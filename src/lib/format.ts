/** L’espace insécable (U+00A0), avant ? ! : ; » et après « : le signe ne part pas seul à la ligne (scripts/verifier-typo.mjs). */
export const NBSP = "\u00a0";

/** 1202 → « 1 202 » (espace insécable, comme dans les maquettes). */
export function formatCount(n: number) {
  return n.toLocaleString("fr-FR").replace(/\s/g, NBSP);
}

const JOUR_EN_LETTRES = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long" });
const JOUR_ET_ANNEE = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" });
const JOUR_COURT = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short" });

/**
 * Un jour, à l’heure de Paris, en lettres : « 20 octobre », « 13 octobre 2027 » avec `annee`, « 20 oct. » `court` (une
 * place étroite, la souche d’un billet). La fin d’une offre, d’un avoir.
 */
export const jourEnLettres = (iso: string, { annee = false, court = false }: { annee?: boolean; court?: boolean } = {}) =>
  (court ? JOUR_COURT : annee ? JOUR_ET_ANNEE : JOUR_EN_LETTRES).format(new Date(iso));
