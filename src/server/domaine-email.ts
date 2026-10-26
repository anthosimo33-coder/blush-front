import "server-only";
import { Resolver } from "node:dns/promises";
import { DOMAINES_CONNUS } from "@/lib/domaines-email";
import { boiteAMails, env } from "./env";

/*
 * Le domaine d’un email peut-il recevoir du mail ? Avant d’écrire un code (POST /api/auth/code), on demande au DNS les
 * serveurs de mail du domaine (ses MX) : un domaine qui n’existe pas (« laposte.nett »), qui n’en a aucun, ou qui dit
 * n’en vouloir aucun (le « MX nul » de la RFC 7505 : gmail.fr, gmail.co) ne recevra jamais le code. Il rebondirait, et
 * chaque rebond pèse sur la réputation du domaine des mails (le bloc « Délivrabilité » d’/admin). Les domaines qu’on
 * sait bons (DOMAINES_CONNUS, src/lib/domaines-email.ts) ne se demandent pas. Le DNS en panne ou trop lent ne refuse
 * personne : le doute laisse passer. Seul le domaine part au DNS, jamais l’adresse.
 */

/** Ce qu’on demande au DNS : les serveurs de mail d’un domaine. Un faux dans les tests. */
type ResolveurMx = { resolveMx: (domaine: string) => Promise<{ exchange: string; priority: number }[]> };

/** Le plus long qu’on attend le DNS : au-delà, on laisse passer (le code part, comme avant). */
const DELAI_DNS_MS = 1_500;
/** Une réponse du DNS se garde une heure, dans l’instance : un même domaine ne se redemande pas à chaque code. */
const GARDEE_MS = 3_600_000;
/** Les domaines gardés au plus : au-delà, les plus anciens s’oublient. */
const GARDES_MAX = 500;

let resolveurDuServeur: ResolveurMx | null = null;
/* Deux essais d’une seconde chacun, coupés de toute façon par DELAI_DNS_MS */
const resolveur = () => (resolveurDuServeur ??= new Resolver({ timeout: 1_000, tries: 2 }));

const gardes = new Map<string, { recoit: boolean; jusqua: number }>();

/** Les codes d’erreur du DNS qui disent « pas de serveur de mail » : le domaine n’existe pas, ou il n’a pas de MX. */
const SANS_MX = new Set(["ENOTFOUND", "ENODATA"]);

/** Ce que le DNS dit des serveurs de mail du domaine : true, false, ou null quand il ne répond pas (panne, délai). */
async function lireMx(domaine: string, dns: ResolveurMx): Promise<boolean | null> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  try {
    const mx = await Promise.race([
      dns.resolveMx(domaine),
      new Promise<null>((ok) => {
        minuteur = setTimeout(() => ok(null), DELAI_DNS_MS);
      }),
    ]);
    if (mx === null) return null;
    /* Le MX nul (« 0 . ») arrive avec un serveur vide : le domaine ne reçoit rien */
    return mx.some((r) => r.exchange !== "" && r.exchange !== ".");
  } catch (e) {
    return SANS_MX.has((e as { code?: unknown } | null)?.code as string) ? false : null;
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Ce domaine peut-il recevoir du mail ? true pour un domaine connu, ou que le DNS n’a pas pu lire ; false quand il dit
 * qu’aucun serveur de mail n’y répond. `dns` et `maintenant` : pour les tests.
 */
export async function domaineRecoitDuMail(domaine: string, { dns = resolveur(), maintenant = Date.now() }: { dns?: ResolveurMx; maintenant?: number } = {}): Promise<boolean> {
  const d = domaine.toLowerCase();
  if (DOMAINES_CONNUS.has(d)) return true;
  const garde = gardes.get(d);
  if (garde && garde.jusqua > maintenant) return garde.recoit;
  const recoit = await lireMx(d, dns);
  if (recoit === null) return true;
  gardes.delete(d);
  gardes.set(d, { recoit, jusqua: maintenant + GARDEE_MS });
  /* Une Map garde l’ordre d’entrée : la première clé est la plus ancienne */
  if (gardes.size > GARDES_MAX) gardes.delete(gardes.keys().next().value!);
  return recoit;
}

/**
 * L’email peut-il recevoir le code ? Seulement quand les mails partent vraiment (une clé du prestataire, pas la boîte
 * des tests) : en local et dans les tests, rien ne rebondit, et leurs domaines inventés (blush.test) passent.
 */
export async function emailRecoitDuMail(email: string): Promise<boolean> {
  const { RESEND_API_KEY, RESEND_API_KEY_CODES } = env();
  if (boiteAMails() || !(RESEND_API_KEY_CODES ?? RESEND_API_KEY)) return true;
  return domaineRecoitDuMail(email.slice(email.lastIndexOf("@") + 1));
}
