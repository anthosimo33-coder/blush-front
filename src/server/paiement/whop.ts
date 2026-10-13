import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { lirePaiementWhop, type PaiementWhop } from "./evenements";

/*
 * Le client de l’API REST de Whop, par fetch, sans leur bibliothèque (@whop/sdk : trop récente, et quatre appels
 * suffisent). La clé du compte en Bearer, la version de l’API épinglée (Api-Version-Date : sans elle, Whop répond sous
 * les formes de 2025), et une clé d’idempotence sur chaque création (l’id de l’achat, ou le jeton de la feuille : un
 * nouvel essai ne crée pas un second paiement, Whop la garde 24 h). Ce que Whop voit de nous : l’id de l’achat, son
 * prix, l’adresse du retour, l’email du compte (le paiement dans la feuille) ; jamais un prénom ni la conv. Le bac à sable (WHOP_BAC_A_SABLE) a sa propre adresse, et ses propres clés.
 */

/** La version de l’API de Whop sous laquelle ce client est écrit (celle de leur bibliothèque 2.4.0, le 12 octobre 2026). */
export const VERSION_API_WHOP = "2026-10-09-2";

/** L’API, en ligne ou dans le bac à sable. */
const API = { vraie: "https://api.whop.com/api/v1", bacASable: "https://sandbox-api.whop.com/api/v1" };
/** La page de paiement d’une configuration, si Whop ne la donne pas (purchase_url). */
const PAGE = { vraie: "https://whop.com/checkout", bacASable: "https://sandbox.whop.com/checkout" };

/** Combien de temps attendre Whop (le webhook doit répondre en moins de 5 s ; la commande, elle, a l’utilisateur qui attend). */
const DELAI_WHOP_MS = 8_000;

/** Ce qu’il faut pour appeler Whop : la clé, le compte (biz_…), le produit (prod_…) et l’API (le bac à sable ou la vraie). */
export type ConfigWhop = { cle: string; compte: string; produit: string; bacASable: boolean };

/**
 * Whop a refusé l’appel (ou n’a pas répondu) : son statut HTTP, et, pour un refus, ce qu’il en dit (`motif`, motifDuRefus),
 * jamais la clé ni le reste du corps. Le journal les lit dans `code` (« whop_400 », « whop_delai ») et `motif`
 * (champsDErreur, src/lib/tracer.ts).
 */
export class ErreurWhop extends Error {
  readonly code: string;
  constructor(
    readonly statut: number | "delai" | "illisible",
    readonly motif?: string,
  ) {
    super(`Whop a répondu ${statut}`);
    this.name = "ErreurWhop";
    this.code = `whop_${statut}`;
  }
}

/** Le corps d’un refus de Whop : `{ error: { type (ou code), message } }`. */
const Refus = z.looseObject({ error: z.looseObject({ type: z.string().nullish(), code: z.string().nullish(), message: z.string().nullish() }) });

/**
 * Ce que Whop dit d’un refus, pour le journal : son type d’erreur et son message (« invalid_request · Missing required
 * parameter: plan »), le seul moyen de savoir quel champ il refuse. Sans les adresses email qu’il pourrait citer (celle
 * du compte, dans le paiement dans la feuille) ; undefined s’il ne dit rien de lisible.
 */
async function motifDuRefus(r: Response): Promise<string | undefined> {
  const corps: unknown = await r.json().catch(() => null);
  const refus = Refus.safeParse(corps);
  if (!refus.success) return undefined;
  const { type, code, message } = refus.data.error;
  const morceaux = [type ?? code, message].filter((m) => typeof m === "string" && m !== "");
  return morceaux.length > 0 ? morceaux.join(" · ").replace(/[^\s@]+@[^\s@]+/g, "‹email›") : undefined;
}

/** Un appel à l’API : son corps JSON lu, ou ErreurWhop. Une lecture (GET) de ce qui n’existe pas (404) rend null. */
async function appel(config: ConfigWhop, methode: "GET" | "POST", chemin: string, { corps, idempotence }: { corps?: unknown; idempotence?: string } = {}): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(`${config.bacASable ? API.bacASable : API.vraie}${chemin}`, {
      method: methode,
      headers: {
        authorization: `Bearer ${config.cle}`,
        "api-version-date": VERSION_API_WHOP,
        accept: "application/json",
        ...(corps !== undefined && { "content-type": "application/json" }),
        ...(idempotence && { "idempotency-key": idempotence }),
      },
      ...(corps !== undefined && { body: JSON.stringify(corps) }),
      signal: AbortSignal.timeout(DELAI_WHOP_MS),
      cache: "no-store",
    });
  } catch {
    throw new ErreurWhop("delai");
  }
  if (methode === "GET" && r.status === 404) return null;
  if (!r.ok) throw new ErreurWhop(r.status, await motifDuRefus(r));
  try {
    return await r.json();
  } catch {
    throw new ErreurWhop("illisible");
  }
}

/**
 * Le prix d’un achat, créé à la volée chez Whop (un « plan » en ligne : Whop réutilise celui qui a déjà ces attributs) :
 * en euros (Whop compte en unités : 9.9), TTC (`override_tax_type` : la taxe comprise dans le prix, jamais ajoutée
 * par-dessus ; quand Whop est vendeur en titre, c’est le réglage de taxe du compte qui décide, à garder sur « prix TTC »,
 * BACKEND.md), payé une fois, sous notre produit, caché du catalogue de Whop, avec le nom que l’acheteur voit sur la page
 * de paiement (titreChezWhop).
 */
const planEnLigne = (config: ConfigWhop, centimes: number, titre: string) => ({
  title: titre,
  initial_price: centimes / 100,
  currency: "eur",
  override_tax_type: "inclusive",
  plan_type: "one_time",
  product_id: config.produit,
  visibility: "hidden",
});

/** Ce que Whop répond à la création d’une configuration de paiement. */
const Configuration = z.looseObject({ id: z.string().regex(/^[A-Za-z0-9_-]+$/), purchase_url: z.string().url().nullish() });

/**
 * Crée la configuration de paiement d’un achat (POST /checkout_configurations) : son prix en ligne, l’achat dans ses
 * métadonnées (recopiées sur le paiement et ses webhooks : c’est ainsi que le webhook retrouve l’achat), et l’adresse
 * du retour. Rend son id (ch_…) et l’adresse de sa page de paiement.
 */
export async function creerConfiguration(
  config: ConfigWhop,
  { achat, centimes, titre, retour }: { achat: string; centimes: number; titre: string; retour: string },
): Promise<{ id: string; url: string }> {
  const brut = await appel(config, "POST", "/checkout_configurations", {
    corps: { plan: planEnLigne(config, centimes, titre), metadata: { achat }, redirect_url: retour },
    idempotence: `configuration:${achat}`,
  });
  const c = Configuration.safeParse(brut);
  if (!c.success) throw new ErreurWhop("illisible");
  return { id: c.data.id, url: c.data.purchase_url ?? `${config.bacASable ? PAGE.bacASable : PAGE.vraie}/${c.data.id}/` };
}

/** Un paiement chez Whop (GET /payments/{id}), lu : null s’il n’existe pas (ou ne se lit pas). */
export async function lirePaiement(config: ConfigWhop, id: string): Promise<PaiementWhop | null> {
  if (!/^pay_[A-Za-z0-9_-]+$/.test(id)) return null;
  const brut = await appel(config, "GET", `/payments/${encodeURIComponent(id)}`);
  return brut === null ? null : lirePaiementWhop(brut);
}

/** Ce que Whop répond à un paiement en un geste : son id, son statut, et la page où l’acheteur doit confirmer (une 3-D Secure). */
const PaiementCree = z.looseObject({
  id: z.string(),
  status: z.string().nullish(),
  next_action: z.looseObject({ url: z.string().url().nullish(), redirect_to_url: z.looseObject({ url: z.string().url() }).nullish() }).nullish(),
});

/**
 * Le paiement en un geste (les offres de « C’est débloqué », POST /payments) : le moyen de paiement gardé du membre
 * (payt_…, mber_…), payé maintenant, à sa demande. Rend son id, et l’adresse où le confirmer si la banque le demande
 * (« requires_action »), sinon null : le webhook payment.succeeded livrera. L’API n’a pas de champ pour dire « à sa
 * demande » (off_session, qu’on envoyait, n’existe pas chez elle : vérifié dans sa référence du 13 octobre).
 */
export async function payerEnUnGeste(
  config: ConfigWhop,
  { achat, centimes, titre, membre, moyen, retour }: { achat: string; centimes: number; titre: string; membre: string; moyen: string; retour: string },
): Promise<{ id: string; confirmer: string | null }> {
  const brut = await appel(config, "POST", "/payments", {
    corps: {
      account_id: config.compte,
      plan: planEnLigne(config, centimes, titre),
      member_id: membre,
      payment_method_id: moyen,
      return_url: retour,
      metadata: { achat },
    },
    idempotence: `paiement:${achat}`,
  });
  const p = PaiementCree.safeParse(brut);
  if (!p.success) throw new ErreurWhop("illisible");
  const action = p.data.next_action;
  return { id: p.data.id, confirmer: p.data.status === "requires_action" ? (action?.redirect_to_url?.url ?? action?.url ?? null) : null };
}

/** Ce que Whop répond à un paiement créé d’un jeton de confirmation : son id, son statut et son sous-statut, et sa clé pour le navigateur. */
const PaiementDuJeton = z.looseObject({
  id: z.string().regex(/^pay_[A-Za-z0-9_-]+$/),
  status: z.string().nullish(),
  substatus: z.string().nullish(),
  client_secret: z.string().nullish(),
});

/**
 * Un paiement créé dans la feuille : son id (pay_…), son statut chez Whop (« paid » : payé ; le reste : une étape attend
 * l’acheteur, ou la banque décide encore), son sous-statut (« failed », « blocked »… : refusé pour de bon), et la clé qui
 * laisse le navigateur finir l’étape (une 3-D Secure : handleNextAction des Elements), ou null.
 */
export type PaiementDansLaFeuille = { id: string; statut: string; sousStatut: string | null; secret: string | null };

/**
 * Le paiement dans la feuille (POST /payments, avec le jeton de confirmation ctok_… que les Elements de Whop ont donné au
 * navigateur : la carte, Apple Pay ou Google Pay, sans qu’aucun numéro ne passe par nous) : le prix de l’achat en ligne,
 * l’achat dans les métadonnées (le webhook payment.succeeded le livre, comme les autres paiements), l’adresse du retour
 * pour une étape hors de la page (une 3-D Secure, une banque), et l’email du compte, qui rattache chaque achat au même
 * acheteur chez Whop (et à ses moyens de paiement gardés : le paiement en un geste). La clé d’idempotence vient du jeton,
 * à usage unique : un nouvel essai du même jeton ne paie pas deux fois ; une autre carte, un autre jeton.
 */
export async function payerAvecJeton(
  config: ConfigWhop,
  { achat, centimes, titre, jeton, email, retour }: { achat: string; centimes: number; titre: string; jeton: string; email: string; retour: string },
): Promise<PaiementDansLaFeuille> {
  const brut = await appel(config, "POST", "/payments", {
    corps: {
      account_id: config.compte,
      plan: planEnLigne(config, centimes, titre),
      confirmation_token: jeton,
      email,
      metadata: { achat },
      return_url: retour,
    },
    idempotence: `jeton:${createHash("sha256").update(jeton).digest("hex").slice(0, 40)}`,
  });
  const p = PaiementDuJeton.safeParse(brut);
  if (!p.success) throw new ErreurWhop("illisible");
  return { id: p.data.id, statut: (p.data.status ?? "").toLowerCase(), sousStatut: p.data.substatus?.toLowerCase() ?? null, secret: p.data.client_secret ?? null };
}
