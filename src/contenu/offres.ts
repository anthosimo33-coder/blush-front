import type { Formule, OffreId, OffreUnique } from "@/types";

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

/*
 * La grille du 16 octobre : +4 € sur le rapport, Premium et les recharges (décidé : le paywall passe avant toute lecture,
 * plus de verdict offert). Les offres définies par une remise la gardent vraie : le −50 % (⑤, ⑥) reste la moitié du
 * rapport, et ③ reste « Premium pour 5 € de plus » (Premium − le rapport) ; ① monte de 4 € comme le rapport.
 */
export const CATALOGUE: Record<OffreId, Offre> = {
  rapport: { id: "rapport", centimes: 1390, barre: null, bulles: 10, conv: true, unique: null, titre: "Le rapport" },
  /* Le prix barré : le rapport et le pack de 80 bulles, vendus à part (pour les mêmes 90 bulles) */
  premium: { id: "premium", centimes: 1890, barre: 2780, bulles: 90, conv: true, unique: null, titre: "Premium" },
  /* ① : le rapport moins cher, une offre unique de 5 minutes (le paywall : 40 s sans payer, ou un retour sur l’onglet ; ailleurs, la feuille fermée sans payer) */
  suite: { id: "suite", centimes: 1090, barre: 1390, bulles: 10, conv: true, unique: "suite", titre: "Le rapport, offre unique" },
  /* ⑥ : le rapport à −50 %, gardé 7 jours par le repli de « C’est débloqué » (le 2e rapport refusé), pour une autre conv */
  rapport_garde: { id: "rapport_garde", centimes: 695, barre: 1390, bulles: 10, conv: true, unique: "garde_second", titre: "Le rapport à −50\u00a0%" },
  /* ③ : Premium pour 5 € de plus, juste après avoir pris le rapport seul (ou la suite) */
  premium_ajout: { id: "premium_ajout", centimes: 500, barre: 1390, bulles: 80, conv: false, unique: "premium_ajout", titre: "80 bulles en plus" },
  /* ⑤ : le 2e rapport à −50 %, juste après un rapport payé : un rapport d’avance, sans conv ni bulles à l’achat (RAPPORT_D_AVANCE) */
  second: { id: "second", centimes: 695, barre: 1390, bulles: 0, conv: false, unique: "second_rapport", titre: "Ton 2e rapport" },
  pack30: { id: "pack30", centimes: 890, barre: null, bulles: 30, conv: false, unique: null, titre: "30 bulles" },
  /* Le pack conseillé : 70 + 10 offertes, et +40 à la première recharge (④) */
  pack80: { id: "pack80", centimes: 1390, barre: null, bulles: 80, conv: false, unique: null, titre: "80 bulles" },
  pack200: { id: "pack200", centimes: 2390, barre: null, bulles: 200, conv: false, unique: null, titre: "200 bulles" },
};

/** Le rapport seul, à son prix ou moins cher (la suite ①, le −50 % gardé ⑥) : ce que ③, Premium pour 5 € de plus, complète. */
export const RAPPORTS_SEULS = ["rapport", "suite", "rapport_garde"] as const satisfies readonly OffreId[];

/** Le bonus de la première recharge (offre unique ④), sur le pack conseillé seulement. */
export const PREMIERE_RECHARGE = { offre: "pack80", bonus: 40 } as const satisfies { offre: OffreId; bonus: number };

/** Combien de temps l’offre unique ① reste valable une fois montrée : le compte à rebours de la feuille, l’heure de fin venue du serveur. */
export const DUREE_SUITE_MS = 5 * 60 * 1000;

/**
 * Les offres uniques de « C’est débloqué » (③ Premium pour 5 € de plus, ⑤ le 2e rapport à −50 %) ne valent que juste
 * après le paiement : le serveur ne les montre que dans ce temps après le paiement d’un rapport, et, montrées, elles
 * expirent ce temps après.
 */
export const DUREE_AJOUT_MS = 15 * 60 * 1000;

/** Combien de temps le repli de « C’est débloqué » (⑥) garde le −50 % pour une autre conv : 7 jours, l’heure de fin venue du serveur. */
export const DUREE_GARDE_MS = 7 * 24 * 3600 * 1000;

/**
 * Le rapport d’avance (l’offre ⑤, « second ») : payé sur « C’est débloqué », il débloque plus tard le rapport de la conv
 * de son choix, pas encore débloquée, sans rien payer (utiliserAvance, src/server/achats.ts), dans l’année qui suit son
 * paiement (`dureeMs`), et donne alors les bulles du rapport (`bulles`). Rien n’est livré à l’achat : le délai de
 * rétractation court tant qu’il n’est pas utilisé, et c’est en l’utilisant qu’on y renonce.
 * TODO(produit): à relire par un juriste (un avoir valable un an, remboursable tant qu’il n’est pas utilisé).
 */
export const RAPPORT_D_AVANCE = { offre: "second", dureeMs: 365 * 24 * 3600 * 1000, bulles: CATALOGUE.rapport.bulles } as const satisfies {
  offre: OffreId;
  dureeMs: number;
  bulles: number;
};

/**
 * Cette offre est-elle livrée dès le paiement (un rapport qui s’ouvre, des bulles qui arrivent) ? Alors le geste de
 * payer donne la renonciation au délai de rétractation. Seul le rapport d’avance attend son usage : à son achat, aucune
 * renonciation (elle se donne en l’utilisant).
 */
export const livreeAuPaiement = (offre: OffreId) => offre !== RAPPORT_D_AVANCE.offre;

/** Entre deux offres uniques montrées au même compte, au moins ce temps (24 h glissantes) : jamais deux le même jour. */
export const ECART_OFFRES_UNIQUES_MS = 24 * 3600 * 1000;

/**
 * Ce que coûte une réponse de BLUSH, en bulles : écrite, en vocal, ou à un message qui joint des captures ou un export
 * (pas cumulé avec l’écrite). Le reste est offert : le verdict, le rapport, la fiche, et une réponse qui sort en alerte
 * danger (rendue). Les bulles n’expirent jamais.
 */
export const COUT_EN_BULLES = { reponse: 1, vocal: 2, ajout: 3 } as const;

/** Les bulles données aux testeurs de la bêta (users.plan « rapport », ou l’ancien accès au chat), une fois. */
export const BULLES_DE_LA_BETA = 100;

/** Les bulles qu’un achat de cette offre donne, bonus de la première recharge (④) compris s’il est valable. */
export const bullesDe = (offre: OffreId, { premiereRecharge = false }: { premiereRecharge?: boolean } = {}) =>
  CATALOGUE[offre].bulles + (premiereRecharge && offre === PREMIERE_RECHARGE.offre ? PREMIERE_RECHARGE.bonus : 0);

/** La longueur la plus grande d’un nom de prix chez Whop : au-delà, il refuse de créer le prix (« Title is too long », le 13 octobre). */
export const TITRE_MAX_CHEZ_WHOP = 30;

/**
 * Le nom de l’achat chez Whop (le « title » de son prix : sur sa page de paiement, dans son reçu) : l’offre, et les
 * bulles figées dans l’achat à la commande (la première recharge compte son bonus), en TITRE_MAX_CHEZ_WHOP caractères
 * au plus. Le produit, lui, s’appelle BLUSH chez Whop.
 */
export function titreChezWhop(offre: OffreId, bulles: number): string {
  switch (offre) {
    case "rapport":
    case "suite":
    case "rapport_garde":
      return `Le rapport complet + ${bulles} bulles`;
    case "premium":
      return `Premium\u00a0: rapport + ${bulles} bulles`;
    case "premium_ajout":
      return `${bulles} bulles en plus`;
    case "second":
      return "Ton 2e rapport, valable 1 an";
    default:
      return `${bulles} bulles`;
  }
}

/** « 9,90 € » : des centimes en euros, la virgule française, l’espace insécable avant €. */
export const enEuros = (centimes: number) => `${Math.floor(centimes / 100)},${String(centimes % 100).padStart(2, "0")}\u00a0€`;

/** Le prix d’une offre, à afficher : « 9,90 € ». */
export const prixDe = (offre: OffreId) => enEuros(CATALOGUE[offre].centimes);

/**
 * La formule choisie d’avance quand la feuille « Ta formule » s’ouvre : Premium (décidé le 12 octobre). Ses textes sont
 * dans src/contenu/paiement.ts (FEUILLE_FORMULE).
 * TODO(produit): le faire relire par un juriste (un paiement en plus choisi par défaut peut être remboursé, article 22
 * de la directive 2011/83/UE).
 */
export const FORMULE_CHOISIE: Formule = "premium";
