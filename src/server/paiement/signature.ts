import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * La signature des webhooks de Whop : le standard « Standard Webhooks » (standardwebhooks.com), écrit à la main plutôt
 * que par la bibliothèque de Whop (une dépendance trop récente, pour trois lignes de cryptographie). Trois en-têtes :
 * `webhook-id` (l’identifiant de l’envoi, le même à chaque nouvel essai), `webhook-timestamp` (en secondes) et
 * `webhook-signature`, une ou plusieurs signatures séparées par des espaces, chacune « v1,<base64> » : le HMAC-SHA256 de
 * « <id>.<timestamp>.<corps brut> ». La clé du HMAC est la chaîne entière du secret (« ws_… »), ses octets UTF-8 tels
 * quels : Whop ne la décode pas (sa bibliothèque, lue le 12 octobre). Un envoi de plus de 5 minutes d’écart est refusé
 * (rejoué plus tard, il ne passe plus) ; la comparaison se fait à temps constant.
 * Sans server-only : le faux Whop des tests de bout en bout (tests/e2e/aide) signe ses webhooks avec la même fonction.
 */

/** L’écart toléré entre l’heure d’un webhook et la nôtre, en secondes (5 minutes, comme Whop). */
export const TOLERANCE_WEBHOOK_S = 5 * 60;

/** Les en-têtes d’un webhook signé, par leur nom (en minuscules). */
export type EntetesWebhook = { "webhook-id": string; "webhook-timestamp": string; "webhook-signature": string };

/** La signature « v1,<base64> » d’un corps brut, pour cet envoi (`id`) à cette heure (`timestamp`, en secondes). */
function signature(secret: string, id: string, timestamp: number | string, corps: string): string {
  const hmac = createHmac("sha256", Buffer.from(secret, "utf8")).update(`${id}.${timestamp}.${corps}`).digest("base64");
  return `v1,${hmac}`;
}

/** Les en-têtes qui signent ce corps : de quoi fabriquer un webhook (le faux Whop, les tests). `maintenant` en millisecondes. */
export function signerWebhook(secret: string, id: string, corps: string, maintenant = Date.now()): EntetesWebhook {
  const timestamp = Math.floor(maintenant / 1000);
  return { "webhook-id": id, "webhook-timestamp": String(timestamp), "webhook-signature": signature(secret, id, timestamp, corps) };
}

/** Pourquoi un webhook est refusé : un en-tête manque (ou est mal formé), il est trop vieux (ou d’un futur trop lointain), ou aucune signature ne colle. */
export type RefusDeSignature = "entetes" | "heure" | "signature";

/** Deux chaînes égales, comparées à temps constant (leurs longueurs peuvent différer : alors fausses, sans rien comparer). */
function egales(a: string, b: string): boolean {
  const [x, y] = [Buffer.from(a, "utf8"), Buffer.from(b, "utf8")];
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Vérifie un webhook : ses trois en-têtes (lus dans `entetes`, des Headers ou un objet), son heure à 5 minutes près de
 * `maintenant` (en millisecondes), puis l’une de ses signatures « v1 ». Rend son identifiant (`webhook-id`, la clé de
 * son idempotence), ou la raison du refus. Le corps doit être exactement celui reçu : relu par JSON.parse puis
 * réécrit, il ne serait plus le même.
 */
export function verifierWebhook(
  secret: string,
  entetes: Headers | Record<string, string | undefined>,
  corps: string,
  maintenant = Date.now(),
): { id: string } | { refus: RefusDeSignature } {
  const lire = (nom: keyof EntetesWebhook) => (entetes instanceof Headers ? entetes.get(nom) : entetes[nom]) ?? "";
  const [id, horodatage, signatures] = [lire("webhook-id"), lire("webhook-timestamp"), lire("webhook-signature")];
  if (!id || !/^\d{1,12}$/.test(horodatage) || !signatures) return { refus: "entetes" };
  if (Math.abs(maintenant / 1000 - Number(horodatage)) > TOLERANCE_WEBHOOK_S) return { refus: "heure" };
  const attendue = signature(secret, id, horodatage, corps);
  /* Plusieurs signatures possibles (le secret qui change : l’ancienne et la nouvelle) ; une autre version que v1 ne compte pas */
  const bonne = signatures
    .split(" ")
    .filter((s) => s.startsWith("v1,"))
    .some((s) => egales(s, attendue));
  return bonne ? { id } : { refus: "signature" };
}
