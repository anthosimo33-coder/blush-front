import type { Jalon } from "@/types";

/*
 * Les pubs sur Facebook et Instagram (Meta), ce que le navigateur et le serveur partagent : le choix de la personne
 * (accepté ou refusé, gardé six mois), les deux cookies que Meta sait lire, et les jalons du tunnel qui partent chez lui.
 * Aucun script de Meta dans les pages : c’est le serveur qui lui parle (src/server/pubs-meta.ts), et seulement avec
 * l’accord (src/components/shell/BandeauPubs.tsx).
 */

/** Le choix de la personne pour les pubs de Meta, lisible par le navigateur et le serveur. */
export const COOKIE_CHOIX_PUBS = "blush-pubs";
/** Ce navigateur pour Meta, tiré au hasard (« fb.1.<ms>.<hasard> »), posé seulement avec l’accord. */
export const COOKIE_FBP = "_fbp";
/** Le clic d’une pub (« fb.1.<ms>.<fbclid> », le fbclid de l’adresse d’arrivée), posé seulement avec l’accord. */
export const COOKIE_FBC = "_fbc";

export type ChoixPubs = "oui" | "non";

/** Ce qu’un achat garde pour Meta à sa commande, avec l’accord (achats.pubs_meta) : ses deux cookies et le navigateur. */
export type TraceMeta = { fbp?: string; fbc?: string; agent?: string };

/** Combien de temps le choix se garde (la CNIL conseille six mois, un refus compris). */
export const CHOIX_PUBS_S = 182 * 24 * 3600;
/** Combien de temps _fbp et _fbc se gardent : la durée que Meta leur donne. */
export const TRACES_META_S = 90 * 24 * 3600;

/**
 * Les jalons du tunnel (src/lib/jalons.ts) qui partent chez Meta, et leur événement standard : la conv importée (le
 * vrai signal d’intention, assez fréquent pour que Meta apprenne), le compte créé (le code validé), le paywall vu, le
 * bouton qui paie touché. L’achat part de son webhook, payé (src/server/pubs-meta.ts, envoyerAchatAMeta).
 */
const EVENEMENTS_META = {
  importee: "Lead",
  code: "CompleteRegistration",
  paywall: "ViewContent",
  payer: "InitiateCheckout",
} as const satisfies Partial<Record<Jalon, string>>;

/** L’événement de Meta d’un jalon, ou null : ce jalon ne part pas chez Meta. */
export const evenementMetaDe = (jalon: Jalon): string | null => (jalon in EVENEMENTS_META ? EVENEMENTS_META[jalon as keyof typeof EVENEMENTS_META] : null);

/** _fbc, au format de Meta : la version, le domaine (1 : le site lui-même), l’heure du clic en millisecondes, le fbclid. */
export const fbcDe = (fbclid: string, ms: number) => `fb.1.${ms}.${fbclid}`;
/** _fbp, au format de Meta : la version, le domaine, l’heure en millisecondes, un nombre tiré au hasard. */
export const fbpDe = (ms: number, hasard: number) => `fb.1.${ms}.${hasard}`;

/** Le fbclid d’une adresse (le paramètre que Meta ajoute au clic d’une pub), ou null. */
export function fbclidDe(adresse: string): string | null {
  try {
    const f = new URL(adresse).searchParams.get("fbclid")?.trim();
    return f && /^[\w-]{10,500}$/.test(f) ? f : null;
  } catch {
    return null;
  }
}

/** Une valeur des cookies de Meta qu’on accepte de relayer : leur format, et rien d’autre. */
export const traceValide = (valeur: string | undefined): valeur is string => !!valeur && /^fb\.\d\.\d{10,16}\.[\w-]{1,500}$/.test(valeur);
