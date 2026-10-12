/*
 * Les valeurs du faux Whop (BLUSH_PAIEMENT_FACTICE, src/server/paiement/factice.ts) : son secret de webhook, son compte,
 * ses identifiants. Fictives et connues de tous : le faux Whop n’existe jamais sur Vercel (env() le refuse). Sans
 * server-only : les tests de bout en bout (tests/e2e/aide) signent leurs propres webhooks avec ce secret.
 */

/** Le secret des webhooks du faux Whop : une chaîne « ws_… » comme celle de Whop, fictive. */
export const SECRET_FACTICE = "ws_secret_fictif_du_faux_whop_de_blush";

/** Le compte Whop du faux Whop (« biz_… »). */
export const COMPTE_FACTICE = "biz_faux_whop";

/** Le membre et le moyen de paiement gardés que donne chaque paiement du faux Whop : de quoi payer l’offre ③ en un geste. */
export const MEMBRE_FACTICE = "mber_faux_whop";
export const MOYEN_FACTICE = "payt_faux_whop";
