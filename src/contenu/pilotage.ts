import type { EtapeVisite, OffreId, SourceVisite } from "@/types";

/*
 * Le pilotage (/admin) : les repères et les noms que le serveur et l’écran partagent. La marge se calcule ici, d’une
 * seule façon, pour la période comme pour chaque case des graphiques.
 */

/** La marge visée après l’IA, en % du chiffre d’affaires hors taxes (décidé le 11 octobre : 80 % au moins). */
export const CIBLE_DE_MARGE = 80;

/**
 * La TVA comprise dans les prix (TTC : Whop, vendeur en titre, la reverse). Celle de la France : un achat d’un autre pays
 * de l’Union en paie une autre, la marge reste une estimation.
 */
const TVA = 0.2;

/**
 * Le dollar en euros, pour mettre l’IA (facturée en dollars) face aux ventes (en euros). Le cours du 11 octobre 2026.
 * TODO(produit): le mettre à jour si le cours bouge de plus de 5 %.
 */
export const EUROS_PAR_DOLLAR = 0.86;

/**
 * La marge après l’IA, en % : (CA hors taxes − l’IA en euros) ÷ CA hors taxes. `centimes` : le chiffre d’affaires net,
 * TTC ; `dollars` : ce qu’a coûté l’IA. null sans vente (rien à diviser). Hors frais Whop et hors créatrices.
 */
export function margeApresIA(centimes: number, dollars: number): number | null {
  const ht = centimes / 100 / (1 + TVA);
  if (ht <= 0) return null;
  return ((ht - dollars * EUROS_PAR_DOLLAR) / ht) * 100;
}

/** Les offres réunies par ce qu’elles vendent, pour « Ce qui se vend » : les deux formules, la suite (①), et les bulles. */
export const GROUPES_D_OFFRES = ["premium", "rapport", "suite", "bulles"] as const;
export type GroupeDOffres = (typeof GROUPES_D_OFFRES)[number];
export const GROUPE_DE_L_OFFRE: Record<OffreId, GroupeDOffres> = {
  premium: "premium",
  rapport: "rapport",
  suite: "suite",
  premium_ajout: "bulles",
  pack30: "bulles",
  pack80: "bulles",
  pack200: "bulles",
};
export const NOMS_DES_GROUPES: Record<GroupeDOffres, string> = { premium: "Premium", rapport: "Le rapport", suite: "Ta suite", bulles: "Bulles" };

/** Le nom d’une source de visiteurs ; null : un acheteur venu avant que les visites se comptent. */
export const NOMS_DES_SOURCES: Record<SourceVisite, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  snapchat: "Snapchat",
  partage: "Verdicts partagés",
  google: "Google",
  autre: "Autres sites",
  direct: "Direct",
};
export const SOURCE_INCONNUE = "Avant le suivi";

/** Ce que fait un visiteur sur cet écran, en ce moment (/admin en direct). */
export const NOMS_DES_ETAPES: Record<EtapeVisite, string> = {
  accueil: "Sur l’accueil",
  partage: "Sur un verdict partagé",
  import: "Importent",
  verdict: "Lisent leur verdict",
  rapport: "Lisent leur rapport",
  paiement: "Au paiement",
  chat: "Parlent à BLUSH",
  compte: "Sur leur compte",
  autre: "Ailleurs",
};
