import type { LotDeLaRoue, OffreId } from "@/types";
import { CATALOGUE, enEuros } from "./offres";

/*
 * La roue du paywall (décidée le 16 octobre, façon e-commerce) : juste avant le paywall, un tour par compte, et on gagne à
 * chaque fois. Huit cases, chacune avec sa chance, réglées pour que chaque lot reste rentable (le calcul du 16 octobre :
 * TVA 20 %, frais de Whop 10 %, 1,50 € d’IA par rapport, la bulle à 0,05 € toutes utilisées au pire : la pire marge
 * reste 30 %, le gros lot ; un tour coûte 0,30 € en moyenne, 0,64 € au pire). Aux prix du 21 octobre (le rapport à
 * 9,90 €), le gros lot « Premium au prix du rapport » n’a presque plus de marge quand toutes ses bulles servent : il reste
 * plafonné par GROS_LOTS_PAR_JOUR. Le tirage se fait sur le serveur
 * (src/server/roue.ts), jamais dans le navigateur, et les chances sont écrites dans le règlement (les conditions, « Le
 * jeu de la roue »). Le lot vaut DUREE_DU_CADEAU_MS, sur la formule payée ensuite (prixAvecLot, bullesDuLot) ; le serveur
 * le fige dans l’achat à la commande, comme le prix (src/server/achats.ts).
 * TODO(produit): le règlement et les chances à faire relire par l’avocat avant la mise en ligne (une loterie liée à un
 * achat est encadrée en France).
 */

/** Une case de la roue : son lot, ses deux lignes, sa chance (en dix-millièmes) et sa couleur. */
export type CaseDeLaRoue = { lot: LotDeLaRoue; haut: string; bas: string; chance: number; couleur: "rose" | "blanc" | "opale" };

/**
 * Les huit cases, dans le sens des aiguilles d’une montre depuis l’aiguille (la case 0 est en haut, la roue au repos
 * tournée d’une case : le gros lot sous l’aiguille). Les chances font 10 000 en tout ; deux cases donnent +10 bulles.
 */
export const CASES_DE_LA_ROUE: readonly CaseDeLaRoue[] = [
  { lot: "bulles20", haut: "+20", bas: "bulles", chance: 1800, couleur: "rose" },
  { lot: "moins10", haut: "−10\u00a0%", bas: "ta formule", chance: 1100, couleur: "blanc" },
  { lot: "bulles10", haut: "+10", bas: "bulles", chance: 2000, couleur: "rose" },
  { lot: "second50", haut: "−50\u00a0%", bas: "2e rapport", chance: 2500, couleur: "blanc" },
  { lot: "bulles30", haut: "+30", bas: "bulles", chance: 450, couleur: "rose" },
  { lot: "moins15", haut: "−15\u00a0%", bas: "ta formule", chance: 100, couleur: "blanc" },
  { lot: "bulles10", haut: "+10", bas: "bulles", chance: 2000, couleur: "rose" },
  { lot: "premium_prix", haut: "Premium", bas: "au prix du rapport", chance: 50, couleur: "opale" },
];

/** La case de la roue au repos sous l’aiguille : le gros lot. */
export const CASE_AU_REPOS = CASES_DE_LA_ROUE.findIndex((c) => c.lot === "premium_prix");

/** Combien de temps le lot gagné vaut : le minuteur du bandeau, l’heure de fin venue du serveur. */
export const DUREE_DU_CADEAU_MS = 15 * 60 * 1000;

/** Combien de temps le 2e rapport à −50 % gagné reste gardé, une fois le rapport payé (le −50 % gardé, ⑥). */
export const DUREE_DU_SECOND_GAGNE_MS = 30 * 24 * 3600 * 1000;

/**
 * Les gros lots, limités par jour (heure de Paris) : au-delà de GROS_LOTS_PAR_JOUR, la case tombe sur +10 bulles. Le
 * règlement le dit (« dans la limite de … par jour »).
 * TODO(produit): le plafond à régler avec les premiers chiffres (10 par jour par lot, pour commencer).
 */
export const GROS_LOTS: readonly LotDeLaRoue[] = ["moins15", "premium_prix"];
export const GROS_LOTS_PAR_JOUR = 10;

/** La case où tombe un gros lot au-delà de son plafond du jour : +10 bulles. */
export const CASE_DE_REPLI = CASES_DE_LA_ROUE.findIndex((c) => c.lot === "bulles10");

/** La remise d’un lot sur la formule (0,10 pour −10 %), ou 0. */
const remiseDe = (lot: LotDeLaRoue | null) => (lot === "moins10" ? 0.1 : lot === "moins15" ? 0.15 : 0);

/** Les bulles qu’un lot ajoute à la formule, ou 0. */
export const bullesDuLot = (lot: LotDeLaRoue | null) => (lot === "bulles10" ? 10 : lot === "bulles20" ? 20 : lot === "bulles30" ? 30 : 0);

/** Les offres où un lot de la roue s’applique : les deux formules du paywall. */
const FORMULES_DE_LA_ROUE: readonly OffreId[] = ["rapport", "premium"];

/**
 * Le lot s’applique-t-il à cette offre ? Aux deux formules, sauf « Premium au prix du rapport », à Premium seulement. Le
 * 2e rapport à −50 % s’applique aux deux sans changer leur prix : il se garde à la livraison.
 */
export const lotSAppliqueA = (lot: LotDeLaRoue, offre: OffreId) => FORMULES_DE_LA_ROUE.includes(offre) && (lot !== "premium_prix" || offre === "premium");

/**
 * Le prix d’une offre avec le lot de la roue (TTC, en centimes), et le prix barré à côté : la remise, ou Premium au prix
 * du rapport ; sans lot (ou un lot qui ne change pas le prix), le prix du catalogue et son prix barré. L’écran et le
 * serveur le calculent de la même façon : le serveur fait payer celui-là.
 */
export function prixAvecLot(offre: OffreId, lot: LotDeLaRoue | null): { centimes: number; barre: number | null } {
  const c = CATALOGUE[offre];
  if (!lot || !lotSAppliqueA(lot, offre)) return { centimes: c.centimes, barre: c.barre };
  if (lot === "premium_prix") return { centimes: CATALOGUE.rapport.centimes, barre: c.barre ?? c.centimes };
  const remise = remiseDe(lot);
  if (!remise) return { centimes: c.centimes, barre: c.barre };
  return { centimes: Math.round(c.centimes * (1 - remise)), barre: c.barre ?? c.centimes };
}

/** Les textes de la roue : son écran (G1), puis « Gagné » (G2). */
export const ROUE = {
  attends: "attends…",
  titre: "Avant ton rapport, tourne la roue",
  sous: "Un cadeau à coup sûr, rien que pour toi.",
  tourner: "Découvrir mon cadeau",
  tourne: "Ça tourne…",
  /** Le serveur n’a pas répondu : on peut réessayer. */
  souci: "La roue n’a pas pu tourner. Réessaie dans un instant.",
  refuser: "Je ne veux pas de cadeau",
  /** Sous les boutons, avant le lien du règlement. */
  regle: "Un tour par personne · tu gagnes à chaque fois · les chances de chaque case sont dans le ",
  reglement: "règlement",
  gagne: "Gagné\u00a0!",
  garde: "Ton cadeau est gardé",
  voir: "Voir mon rapport",
  partir: "Tu peux partir et revenir\u00a0: le cadeau tient jusqu’à la fin du minuteur.",
  /** Le nom de la roue, pour un lecteur d’écran (les cases, dans l’ordre). */
  description:
    "La roue des cadeaux\u00a0: 20 bulles, 10\u00a0% de moins, 10 bulles, ton 2e rapport à moins 50\u00a0%, 30 bulles, 15\u00a0% de moins, 10 bulles, Premium au prix du rapport",
  /** Le titre de la feuille, pour un lecteur d’écran. */
  feuille: "La roue des cadeaux",
};

/**
 * Ce que chaque lot dit : « Gagné » (`titre`, `detail`), le bandeau du paywall (`bandeau`, suivi du minuteur), et sa
 * ligne dans la formule (`ligne`).
 */
export const GAINS: Record<LotDeLaRoue, { titre: string; detail: string; bandeau: string; ligne: string }> = {
  bulles10: {
    titre: "+10 bulles",
    detail: "10 réponses de BLUSH en plus. Elles s’ajoutent toutes seules à ta formule.",
    bandeau: "Ton cadeau\u00a0: +10 bulles",
    ligne: "+10 bulles de la roue",
  },
  bulles20: {
    titre: "+20 bulles",
    detail: "20 réponses de BLUSH en plus. Elles s’ajoutent toutes seules à ta formule.",
    bandeau: "Ton cadeau\u00a0: +20 bulles",
    ligne: "+20 bulles de la roue",
  },
  bulles30: {
    titre: "+30 bulles",
    detail: "30 réponses de BLUSH en plus. Elles s’ajoutent toutes seules à ta formule.",
    bandeau: "Ton cadeau\u00a0: +30 bulles",
    ligne: "+30 bulles de la roue",
  },
  moins10: {
    titre: "−10\u00a0%",
    detail: "Sur ta formule, le rapport ou Premium. Déjà enlevé du prix.",
    bandeau: "Ton cadeau\u00a0: −10\u00a0% sur ta formule",
    ligne: "−10\u00a0% de la roue",
  },
  moins15: {
    titre: "−15\u00a0%",
    detail: "Sur ta formule, le rapport ou Premium. Déjà enlevé du prix.",
    bandeau: "Ton cadeau\u00a0: −15\u00a0% sur ta formule",
    ligne: "−15\u00a0% de la roue",
  },
  second50: {
    titre: "Ton 2e rapport à −50\u00a0%",
    detail: `Pour une autre conv, à ${enEuros(CATALOGUE.rapport_garde.centimes)} au lieu de ${enEuros(CATALOGUE.rapport.centimes)}, pendant 30 jours. Il s’active avec ce rapport.`,
    bandeau: "Ton cadeau\u00a0: ton 2e rapport à −50\u00a0%",
    ligne: "Ton 2e rapport à −50\u00a0%, 30 jours",
  },
  premium_prix: {
    titre: "Premium au prix du rapport",
    detail: `Le rapport et ${CATALOGUE.premium.bulles} bulles pour ${enEuros(CATALOGUE.rapport.centimes)}.`,
    bandeau: "Ton cadeau\u00a0: Premium au prix du rapport",
    ligne: "Premium au prix du rapport",
  },
};

/** Les chances de chaque lot en pourcentage, pour le règlement : « 40 % » (les deux cases de +10 bulles ensemble). */
export function chancesDesLots(): { lot: LotDeLaRoue; titre: string; pourcent: string }[] {
  const total = new Map<LotDeLaRoue, number>();
  for (const c of CASES_DE_LA_ROUE) total.set(c.lot, (total.get(c.lot) ?? 0) + c.chance);
  return [...total].map(([lot, chance]) => ({ lot, titre: GAINS[lot].titre, pourcent: `${String(chance / 100).replace(".", ",")}\u00a0%` }));
}
