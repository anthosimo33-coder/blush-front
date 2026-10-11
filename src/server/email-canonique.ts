/*
 * L’email canonique : la boîte où arrive un email, quelle que soit la façon de l’écrire. `Noe+1@gmail.com`,
 * `n.o.e@googlemail.com` et `noe@gmail.com` arrivent dans la même boîte : les limites anti-abus s’y rangent, pour qu’un
 * alias ne remette pas leurs compteurs à zéro : les codes de connexion, et tout ce que compte un compte (cleDuCompte). Le
 * compte, lui, garde l’email tel qu’il a été tapé. Module pur, sans server-only : tests/unit et les aides des tests de bout
 * en bout le lisent sans base.
 */

/** Les domaines de Gmail : une seule boîte pour les deux, où les points du nom ne comptent pas. */
const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/**
 * L’email canonique : en minuscules, sans le `+suffixe` du nom (la plupart des messageries l’ignorent), et pour Gmail
 * sans les points du nom, sur gmail.com. Un texte qui n’est pas un email revient seulement en minuscules.
 */
export function emailCanonique(email: string): string {
  const propre = email.trim().toLowerCase();
  const arobase = propre.lastIndexOf("@");
  if (arobase < 1 || arobase === propre.length - 1) return propre;
  const domaine = propre.slice(arobase + 1);
  /* Un nom qui commence par « + » n’a pas de suffixe à retirer : il resterait vide */
  const nom = propre.slice(0, arobase).replace(/(?<=.)\+.*$/, "");
  return GMAIL.has(domaine) ? `${nom.replaceAll(".", "") || nom}@gmail.com` : `${nom}@${domaine}`;
}

/**
 * Ce qui range les limites d’un compte (src/server/limites.ts) : son email canonique, pas son identifiant. Supprimer son
 * compte puis le recréer, ou en ouvrir un sous un alias, ne remet pas ses compteurs du jour à zéro (rate_limits survit au
 * compte). La clé d’une limite est `<nom>:<cleDuCompte>`, par exemple `analyse:compte:noe@gmail.com`.
 */
export const cleDuCompte = (email: string) => `compte:${emailCanonique(email)}`;

/**
 * Les limites rangées par compte (cleDuCompte), par le nom que leur clé porte : sousLaLimiteDuCompte (src/server/requete.ts)
 * n’en compte pas d’autre. Les tests de bout en bout les remettent à zéro quand ils reprennent un email (oublierEmail).
 */
export const LIMITES_DU_COMPTE = ["analyse", "relance:verdict", "relance", "chat", "ajout", "fiche", "image", "partage-compte", "ecoute", "capturesParCompte", "lotsParCompte"] as const;

/** Le nom d’une limite rangée par compte. */
export type LimiteDuCompte = (typeof LIMITES_DU_COMPTE)[number];
