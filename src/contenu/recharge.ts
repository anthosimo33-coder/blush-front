import type { OffreId } from "@/types";
import { CATALOGUE, enEuros, PREMIERE_RECHARGE, prixDe } from "./offres";

/*
 * Les textes de la recharge (FeuilleRecharge, src/components/bulles/FeuilleRecharge.tsx) : trois packs, le conseillé
 * choisi d’avance, et le bonus de la première recharge (④) quand le serveur le montre. Repris tels quels du prototype
 * validé des bulles (12 octobre) ; les prix et les bulles viennent du catalogue (src/contenu/offres.ts), jamais recopiés.
 */

/** Les packs de la recharge, dans l’ordre de la feuille. */
export const PACKS = ["pack30", "pack80", "pack200"] as const satisfies readonly OffreId[];
export type Pack = (typeof PACKS)[number];

/** Le pack conseillé, choisi d’avance : celui du bonus de la première recharge. */
export const PACK_CONSEILLE: Pack = PREMIERE_RECHARGE.offre;

/** Les bulles offertes de chaque pack (« 70 bulles +10 offertes ») : le reste des bulles du catalogue est payé. */
const OFFERTES: Record<Pack, number> = { pack30: 0, pack80: 10, pack200: 50 };

/** Le prix d’une bulle, arrondi au centime (« 0,12 € la bulle »). */
const prixDUneBulle = (centimes: number, bulles: number) => `${enEuros(Math.round(centimes / bulles))} la bulle`;

/**
 * Ce que la feuille montre d’un pack : son titre (les bulles payées), les offertes (le bonus ④ compris s’il vaut), le
 * total, et sa note. `bonus` : le bonus de la première recharge vaut pour ce compte (le serveur l’a montré).
 */
export function lePack(pack: Pack, bonus: boolean) {
  const { bulles, centimes } = CATALOGUE[pack];
  const enPlus = bonus && pack === PREMIERE_RECHARGE.offre ? PREMIERE_RECHARGE.bonus : 0;
  const offertes = OFFERTES[pack] + enPlus;
  const total = bulles + enPlus;
  return {
    titre: `${bulles - OFFERTES[pack]} bulles`,
    offertes,
    total,
    prix: prixDe(pack),
    /* Le premier pack, sans offertes, sert de repère : le prix de la bulle seul */
    note: offertes ? `${total} bulles · ${prixDUneBulle(centimes, total)}` : prixDUneBulle(centimes, total),
    tag: offertes ? `+${offertes} offertes` : null,
  };
}

export const RECHARGE = {
  titre: "Recharge tes bulles",
  /** Sous le titre : rien n’attend, ou une réponse prête qui attend la recharge (ouverte depuis elle). */
  sousTitre: "Elles n’expirent jamais.",
  reponsePrete: (autre: string) => `Ta réponse à ${autre} s’affiche dès que c’est payé.`,
  /** Le bonus de la première recharge (④), en tête de la feuille quand le serveur le montre. */
  bonus: `Ta 1re recharge\u00a0: +${PREMIERE_RECHARGE.bonus} offertes`,
  bonusNote: "Sur le pack conseillé · une seule fois",
  /** Le nom du choix des packs, pour un lecteur d’écran. */
  choix: "Ton pack",
  payer: (prix: string) => `Payer · ${prix}`,
  /** Le pied du paiement, comme celui de la feuille « Ta formule » : la promesse en gras, puis les moyens. */
  pied: { fort: "Paiement unique, pas d’abonnement", reste: " · Apple Pay ou carte" },
  /** Sans paiement branché (ni Whop, ni le faux Whop) : les mots de la feuille « Ta formule ». */
  bientot: "Le paiement arrive très vite. Pour l’instant, BLUSH est ouvert sur invitation.",
  souci: "Ça n’a pas pu se faire. Vérifie ta connexion et réessaie.",
};
