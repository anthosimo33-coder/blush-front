/*
 * La forme d’un email, vérifiée dans le navigateur avant d’envoyer quoi que ce soit (le parcours, la connexion, la liste
 * d’attente). Une règle, pas un composant : le champ (EmailField) l’affiche, il ne la tient pas. Le serveur refait sa
 * propre vérification (`Email`, src/server/auth.ts).
 */

/** Quelque chose, une arobase, un domaine avec un point et au moins deux lettres derrière, sans espace. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** L’email saisi a-t-il la forme d’un email (espaces du bord ignorés) ? */
export const emailValide = (email: string) => EMAIL_RE.test(email.trim());
