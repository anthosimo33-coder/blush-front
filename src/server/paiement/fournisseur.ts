import "server-only";
import { paiementFactice, paiementWhop } from "../env";
import { COMPTE_FACTICE, SECRET_FACTICE } from "./factice-valeurs";
import type { ConfigWhop } from "./whop";

/*
 * Qui encaisse : Whop (ses quatre variables, src/server/env.ts), le faux Whop (BLUSH_PAIEMENT_FACTICE, en dev et dans les
 * tests, jamais sur Vercel), ou personne (null : « Débloquer » répond « bientot », la production d’aujourd’hui). Le faux
 * Whop passe avant Whop : un poste de dev qui a les deux ne paie jamais pour de vrai.
 */

/** Le prestataire du paiement : son mode (celui des achats qu’il encaisse, achats.fournisseur), le secret de ses webhooks et son compte. */
export type Fournisseur = { mode: "whop"; secret: string; compte: string; whop: ConfigWhop } | { mode: "factice"; secret: string; compte: string };

/** Le prestataire du paiement, ou null : le paiement n’est pas branché. */
export function fournisseur(): Fournisseur | null {
  if (paiementFactice()) return { mode: "factice", secret: SECRET_FACTICE, compte: COMPTE_FACTICE };
  const w = paiementWhop();
  if (!w) return null;
  return { mode: "whop", secret: w.secret, compte: w.compte, whop: { cle: w.cle, compte: w.compte, produit: w.produit, bacASable: w.bacASable } };
}
