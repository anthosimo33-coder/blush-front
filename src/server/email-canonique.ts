/*
 * L’email canonique : la boîte où arrive un email, quelle que soit la façon de l’écrire. `Noe+1@gmail.com`,
 * `n.o.e@googlemail.com` et `noe@gmail.com` arrivent dans la même boîte : les limites anti-abus s’y rangent, pour qu’un
 * alias ne remette pas leurs compteurs à zéro (les codes de connexion ; au lot 3, ce que coûte un compte). Le compte, lui,
 * garde l’email tel qu’il a été tapé. Module pur, sans server-only : tests/unit le lit sans base.
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
