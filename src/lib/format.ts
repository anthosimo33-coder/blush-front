/** L’espace insécable (U+00A0), avant ? ! : ; » et après « : le signe ne part pas seul à la ligne (scripts/verifier-typo.mjs). */
export const NBSP = "\u00a0";

/** 1202 → « 1 202 » (espace insécable, comme dans les maquettes). */
export function formatCount(n: number) {
  return n.toLocaleString("fr-FR").replace(/\s/g, NBSP);
}

/** Le nom accordé à son nombre : le singulier pour 0 et 1 (« 0 vocal », « 1 message »), le pluriel au-delà. */
export const accorde = (n: number, singulier: string, pluriel = `${singulier}s`) => (n > 1 ? pluriel : singulier);

/**
 * Le chiffre des vocaux d’une conv, à l’écran : ses vocaux, ou ses médias quand l’export ne les distingue pas (Android
 * « sans médias » écrit « <Médias omis> » pour un vocal comme pour une photo), plutôt qu’un « 0 vocal » faux.
 */
export function vocauxOuMedias(c: { voiceCount?: number; mediaCount?: number }): { nombre: number; nom: string } {
  const vocaux = c.voiceCount ?? 0;
  if (!vocaux && c.mediaCount) return { nombre: c.mediaCount, nom: accorde(c.mediaCount, "média", "médias") };
  return { nombre: vocaux, nom: accorde(vocaux, "vocal", "vocaux") };
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

/**
 * La dernière ligne d’une page légale, d’après le jour de sa version (« AAAA-MM-JJ ») : « Dernière mise à jour : 26
 * octobre 2026. ». Le même jour va au plan du site (src/lib/referencement.ts) : la page et les moteurs disent la même date.
 */
export const derniereMiseAJour = (jour: string) => `Dernière mise à jour\u00a0: ${jourEnLettres(jour, { annee: true })}.`;
