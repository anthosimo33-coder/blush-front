/*
 * Le compte qui garde les convs de tournage préparées par l’API du mode tournage (src/server/tournage.ts) : un compte
 * de l’équipe, créé à sa première conv, que personne n’ouvre. Son budget de l’IA est à part (src/server/budget.ts) : il
 * paie une lecture entière par lien, pour toutes les créatrices.
 */

/** L’email du compte des convs de tournage préparées par l’API. */
export const COMPTE_DU_TOURNAGE = "tournage@askblush.com";
