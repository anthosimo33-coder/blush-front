import type { Formule, Offer, OffreId, OffreUnique } from "@/types";

/*
 * Le catalogue : ce qu’on achète, une fois, par Whop (vendeur en titre : les prix sont TTC). Le serveur fait payer ces
 * prix-là et rien d’autre (jamais un prix venu du navigateur), et donne ces bulles-là, figées dans l’achat à la commande
 * (src/server/achats.ts). Les libellés reprennent le prototype validé des bulles (12 octobre) ; les écrans du paiement en
 * tirent leurs prix (prixDe), jamais l’inverse.
 */

/** Une offre du catalogue. */
export type Offre = {
  id: OffreId;
  /** Son prix TTC, en centimes d’euro. */
  centimes: number;
  /** Le prix barré à côté (ce que coûteraient les mêmes choses achetées à part), en centimes, ou null. */
  barre: number | null;
  /** Les bulles qu’elle donne (sans le bonus d’une offre unique : bullesDe). */
  bulles: number;
  /** Elle débloque le rapport d’une conv : elle s’achète pour une conv à soi, pas encore débloquée. */
  conv: boolean;
  /** L’offre unique qui seule la propose (src/server/offres-uniques.ts), ou null : en vente libre. */
  unique: OffreUnique | null;
  /** Son nom, court (Mon compte, la liste des achats, /admin). */
  titre: string;
};

export const CATALOGUE: Record<OffreId, Offre> = {
  rapport: { id: "rapport", centimes: 990, barre: null, bulles: 10, conv: true, unique: null, titre: "Le rapport" },
  /* Le prix barré : le rapport et le pack de 80 bulles, vendus à part (pour les mêmes 90 bulles) */
  premium: { id: "premium", centimes: 1490, barre: 1980, bulles: 90, conv: true, unique: null, titre: "Premium" },
  /* ① : la suite moins chère, 5 minutes après avoir fermé la feuille sans payer */
  suite: { id: "suite", centimes: 690, barre: 990, bulles: 10, conv: true, unique: "suite", titre: "Ta suite" },
  /* ③ : Premium pour 5 € de plus, juste après avoir pris le rapport seul (ou la suite) */
  premium_ajout: { id: "premium_ajout", centimes: 500, barre: 990, bulles: 80, conv: false, unique: "premium_ajout", titre: "80 bulles en plus" },
  pack30: { id: "pack30", centimes: 490, barre: null, bulles: 30, conv: false, unique: null, titre: "30 bulles" },
  /* Le pack conseillé : 70 + 10 offertes, et +40 à la première recharge (④) */
  pack80: { id: "pack80", centimes: 990, barre: null, bulles: 80, conv: false, unique: null, titre: "80 bulles" },
  pack200: { id: "pack200", centimes: 1990, barre: null, bulles: 200, conv: false, unique: null, titre: "200 bulles" },
};

/** Le bonus de la première recharge (offre unique ④), sur le pack conseillé seulement. */
export const PREMIERE_RECHARGE = { offre: "pack80", bonus: 40 } as const satisfies { offre: OffreId; bonus: number };

/** Combien de temps l’offre unique ① reste valable une fois montrée : le compte à rebours de la feuille, l’heure de fin venue du serveur. */
export const DUREE_SUITE_MS = 5 * 60 * 1000;

/** Entre deux offres uniques montrées au même compte, au moins ce temps (24 h glissantes) : jamais deux le même jour. */
export const ECART_OFFRES_UNIQUES_MS = 24 * 3600 * 1000;

/**
 * Ce que coûte une réponse de BLUSH, en bulles : écrite, en vocal, ou à un message qui joint des captures ou un export
 * (pas cumulé avec l’écrite). Le reste est offert : le verdict, le rapport, la fiche, et une réponse qui sort en alerte
 * danger (rendue). Les bulles n’expirent jamais.
 */
export const COUT_EN_BULLES = { reponse: 1, vocal: 2, ajout: 3 } as const;

/** Les bulles données aux testeurs de la bêta (users.plan « rapport » ou BLUSH d’avant le paiement), une fois. */
export const BULLES_DE_LA_BETA = 100;

/** Les bulles qu’un achat de cette offre donne, bonus de la première recharge (④) compris s’il est valable. */
export const bullesDe = (offre: OffreId, { premiereRecharge = false }: { premiereRecharge?: boolean } = {}) =>
  CATALOGUE[offre].bulles + (premiereRecharge && offre === PREMIERE_RECHARGE.offre ? PREMIERE_RECHARGE.bonus : 0);

/** « 9,90 € » : des centimes en euros, la virgule française, l’espace insécable avant €. */
export const enEuros = (centimes: number) => `${Math.floor(centimes / 100)},${String(centimes % 100).padStart(2, "0")} €`;

/** Le prix d’une offre, à afficher : « 9,90 € ». */
export const prixDe = (offre: OffreId) => enEuros(CATALOGUE[offre].centimes);

/** Les deux formules de la feuille du paiement, chacune par son id : le rapport seul, ou Premium (le prototype des bulles). */
const FORMULE: Record<Formule, Offer> = {
  rapport: {
    id: "rapport",
    title: "Le rapport",
    titleDesktop: "Le rapport",
    price: prixDe("rapport"),
    note: `+ ${CATALOGUE.rapport.bulles} bulles offertes`,
    noteDesktop: `+ ${CATALOGUE.rapport.bulles} bulles offertes`,
    recommended: false,
  },
  premium: {
    id: "premium",
    title: "Rapport + 60 bulles",
    titleDesktop: "Rapport + 60 bulles",
    price: prixDe("premium"),
    note: `Soit ${CATALOGUE.premium.bulles} bulles en tout`,
    noteDesktop: `Soit ${CATALOGUE.premium.bulles} bulles en tout`,
    recommended: true,
  },
};

/**
 * Les formules dans l’ordre de la feuille : le rapport seul, puis Premium, choisie d’avance (décidé le 12 octobre).
 * TODO(produit): le faire relire par un juriste (un paiement en plus choisi par défaut peut être remboursé, article 22
 * de la directive 2011/83/UE).
 */
export const OFFERS: Offer[] = [FORMULE.rapport, FORMULE.premium];

/** La formule choisie d’avance quand la feuille s’ouvre. */
export const FORMULE_CHOISIE: Formule = "premium";

export const PAYWALL = {
  title: (other?: string) => (other ? `La suite parle de vous deux : toi et ${other}.` : "La suite parle de vous deux."),
  /** Le nombre de chapitres qui restent, quand on le sait (le rapport ouvert) ; sinon, la suite, sans compter. */
  subtitle: (chapitres?: number) =>
    chapitres ? `${chapitres} chapitres, ton plan et les phrases pour lui parler.` : "La suite de ton rapport, ton plan et les phrases pour lui parler.",
  payments: "Paiement unique, pas d’abonnement · Apple Pay ou carte",
};
