import type { OffreId } from "@/types";
import { CATALOGUE, enEuros, prixDe } from "./offres";

/*
 * Les textes de la recharge (FeuilleRecharge, src/components/bulles/FeuilleRecharge.tsx) : trois packs, le conseillé
 * choisi d’avance. Repris du prototype validé des bulles (12 octobre) ; les prix et les bulles viennent du catalogue
 * (src/contenu/offres.ts), jamais recopiés. Le bonus de la première recharge (④, +40 bulles sur le pack conseillé) est
 * arrêté le 23 octobre 2026 : plus rien n’est offert ni montré.
 */

/** Les packs de la recharge, dans l’ordre de la feuille (la grille du 23 octobre). */
export const PACKS = ["pack10", "pack25", "pack60"] as const satisfies readonly OffreId[];
export type Pack = (typeof PACKS)[number];

/** Le pack conseillé, choisi d’avance (décidé le 23 octobre : celui de 25 bulles). */
export const PACK_CONSEILLE: Pack = "pack25";

/**
 * Les bulles offertes de chaque pack (« 70 bulles +10 offertes ») : le reste des bulles du catalogue est payé. Aucune
 * dans la grille du 23 octobre (10, 25 et 60 bulles, toutes payées).
 * Le prix à la bulle baisse avec la taille du pack (0,69 €, 0,60 €, 0,58 €) : le petit pack à 6,90 € (décidé le 23 octobre) pour que le conseillé ne revienne pas plus cher que lui.
 */
const OFFERTES: Record<Pack, number> = { pack10: 0, pack25: 0, pack60: 0 };

/** Le prix d’une bulle, arrondi au centime (« 0,60 € la bulle »). */
const prixDUneBulle = (centimes: number, bulles: number) => `${enEuros(Math.round(centimes / bulles))} la bulle`;

/** Ce que la feuille montre d’un pack : son titre (les bulles payées), les offertes, le total, et sa note. */
export function lePack(pack: Pack) {
  const { bulles, centimes } = CATALOGUE[pack];
  const offertes = OFFERTES[pack];
  return {
    titre: `${bulles - offertes} bulles`,
    offertes,
    total: bulles,
    prix: prixDe(pack),
    /* Un pack sans offertes : le prix de la bulle seul */
    note: offertes ? `${bulles} bulles · ${prixDUneBulle(centimes, bulles)}` : prixDUneBulle(centimes, bulles),
    tag: offertes ? `+${offertes} offertes` : null,
  };
}

export const RECHARGE = {
  titre: "Recharge tes bulles",
  /** Sous le titre : rien n’attend, ou une réponse prête qui attend la recharge (ouverte depuis elle). */
  sousTitre: "Elles n’expirent jamais.",
  reponsePrete: (autre: string) => `Ta réponse à ${autre} s’affiche dès que c’est payé.`,
  /** Le nom du choix des packs, pour un lecteur d’écran. */
  choix: "Ton pack",
  payer: (prix: string) => `Payer · ${prix}`,
  /** Le bouton, pour un lecteur d’écran, pendant qu’on part payer. */
  enCours: "Paiement en cours",
  /** Le pied du paiement, comme celui de la feuille « Ta formule » : la promesse en gras, puis les moyens. */
  pied: { fort: "Paiement unique, pas d’abonnement", reste: " · Apple Pay ou carte" },
  /** Sans paiement branché (ni Whop, ni le faux Whop) : les mots de la feuille « Ta formule ». */
  bientot: "Le paiement arrive très vite. Pour l’instant, BLUSH est ouvert sur invitation.",
  souci: "Ça n’a pas pu se faire. Vérifie ta connexion et réessaie.",
  /**
   * Un solde sous zéro (des bulles reprises après un remboursement, les CGU le disent) : ce qu’il est, et ce que le pack
   * choisi en fera, pour que personne ne paie en croyant rouvrir une réponse qu’il ne rouvrira pas (SUP14-1).
   */
  dette: (solde: number, apres: number) =>
    `Ton solde est à \u2212${-solde} bulles (après un remboursement)\u00a0: ce pack le ${apres > 0 ? `remet à ${apres}` : `remonte à ${apres === 0 ? "0" : `\u2212${-apres}`}`}.`,
};
