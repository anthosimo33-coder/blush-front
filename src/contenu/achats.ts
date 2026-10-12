import type { StatutAchat } from "@/types";
import { CATALOGUE } from "./offres";

/*
 * Les textes de « Tes bulles » et de « Tes achats », dans Mon compte : le solde, la recharge, « C’est quoi une bulle ? »,
 * puis chaque achat (le jour, l’offre, le montant, son état). Sans maquette dans le prototype des bulles, qui n’a pas
 * Mon compte. TODO(produit): textes nouveaux, à valider.
 */

export const TES_BULLES = {
  titre: "Tes bulles",
  solde: (bulles: number) => `Tes bulles\u00a0: ${bulles}`,
  /** L’équipe (BLUSH_ACCES_LIBRE) : ses bulles ne se débitent jamais. */
  illimitees: "Tes bulles\u00a0: illimitées",
  regle: "1 bulle = 1 réponse de BLUSH · elles n’expirent jamais",
  recharger: "Recharger",
  rechargerNote: `${CATALOGUE.pack30.bulles}, ${CATALOGUE.pack80.bulles} ou ${CATALOGUE.pack200.bulles} bulles`,
  cestQuoi: "C’est quoi une bulle\u00a0?",
  cestQuoiNote: "Ce que coûte chaque réponse",
};

export const TES_ACHATS = {
  titre: "Tes achats",
  /** Sous la liste : où trouver le reçu (Whop, vendeur en titre, l’envoie à chaque paiement). */
  pied: "Le reçu de chaque paiement t’a été envoyé par email.",
  /** Les bulles qu’un achat a données, après son jour. */
  bulles: (n: number) => `+${n} bulles`,
};

/** L’état d’un achat, à côté de son montant. */
export const ETAT_ACHAT: Record<StatutAchat, string> = {
  en_attente: "En attente",
  paye: "Payé",
  echoue: "Échoué",
  rembourse: "Remboursé",
  conteste: "Contesté",
};
