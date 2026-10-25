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
  /** Le prix barré à côté (ce que coûteraient les mêmes choses achetées à part, ou, pour ③, l’écart entre Premium et le rapport), en centimes, ou null. */
  barre: number | null;
  /** Les bulles qu’elle donne (sans un lot de la roue : bullesDuLot, src/contenu/roue.ts). */
  bulles: number;
  /** Elle débloque le rapport d’une conv : elle s’achète pour une conv à soi, pas encore débloquée. */
  conv: boolean;
  /** L’offre unique qui seule la propose (src/server/offres-uniques.ts), ou null : en vente libre. */
  unique: OffreUnique | null;
  /**
   * Elle se vend encore. Faux : retirée de la vente (commander la refuse), mais gardée telle qu’elle était vendue, pour
   * les achats passés qui la portent (leur titre dans Mon compte, /admin, le MCP) et une commande d’avant qui se livre
   * encore, payée après : son prix et ses bulles sont figés dans l’achat.
   */
  enVente: boolean;
  /** Son nom, court (Mon compte, la liste des achats, /admin). */
  titre: string;
};

/* Ce d’où se tirent les prix barrés de Premium et de ③, et les bulles de ③ : le rapport seul, le pack de 25 bulles (le conseillé), et Premium */
const RAPPORT = { centimes: 990, bulles: 3 };
const PACK25 = { centimes: 1490, bulles: 25 };
const PREMIUM = { centimes: 1990, bulles: 25 };

/*
 * La grille du 23 octobre (marge visée : 80 %, hors frais de Whop ; une bulle coûte environ 0,095 €, la réponse et sa
 * part de la mise à jour de la mémoire). Le rapport reste à 9,90 €, le prix d’appel, avec 3 bulles ; Premium, la cible
 * (choisie d’avance), monte à 19,90 € avec 25 bulles, barré au rapport et au pack de 25 achetés à part (24,80 €) ; les
 * recharges passent à 10, 25 (le conseillé) et 60 bulles. Les offres définies par une remise la gardent vraie : le −50 %
 * (⑤, ⑥) reste la moitié du rapport, ① reste à 3 € de moins, et ③ fait passer le rapport seul en Premium pour 6,90 € de
 * plus (barré à l’écart entre les deux, 10 €), avec les bulles qui manquent. Les offres d’avant (l’ancien ③ à 5 €, les
 * packs de 30, 80 et 200 bulles) restent ici, retirées de la vente, telles qu’elles se vendaient.
 */
export const CATALOGUE: Record<OffreId, Offre> = {
  rapport: { id: "rapport", ...RAPPORT, barre: null, conv: true, unique: null, enVente: true, titre: "Le rapport" },
  /*
   * Le prix barré : le rapport et le pack de 25 bulles, vendus à part (28 bulles en tout, la façon la moins chère d’en
   * avoir au moins 25 sans Premium).
   * TODO(produit): à faire relire par un juriste avant la mise en ligne : 28 bulles à part contre 25 dans Premium, et un
   * prix barré à côté de 19,90 € quand Premium se vendait 14,90 € jusqu’au 23 octobre (le prix de référence d’une
   * réduction, article L112-1-1 du code de la consommation).
   */
  premium: { id: "premium", ...PREMIUM, barre: RAPPORT.centimes + PACK25.centimes, conv: true, unique: null, enVente: true, titre: "Premium" },
  /* ① : le rapport moins cher, une offre unique de 5 minutes (le paywall : 40 s sans payer, ou un retour sur l’onglet ; ailleurs, la feuille fermée sans payer) */
  suite: { id: "suite", centimes: 690, barre: RAPPORT.centimes, bulles: RAPPORT.bulles, conv: true, unique: "suite", enVente: true, titre: "Le rapport, offre unique" },
  /* ⑥ : le rapport à −50 %, gardé 7 jours par le repli de « C’est débloqué » (le 2e rapport refusé), pour une autre conv */
  rapport_garde: {
    id: "rapport_garde",
    centimes: 495,
    barre: RAPPORT.centimes,
    bulles: RAPPORT.bulles,
    conv: true,
    unique: "garde_second",
    enVente: true,
    titre: "Le rapport à −50\u00a0%",
  },
  /*
   * ③ : Premium pour 6,90 € de plus, juste après avoir pris le rapport seul (ou la suite) : les bulles qui lui manquent
   * pour Premium.
   * TODO(produit): son prix barré (10 €, l’écart entre Premium et le rapport, un prix que ce passage n’a jamais eu) à
   * faire relire par un juriste avant de le dessiner : aujourd’hui, aucun écran ne le barre, son texte dit l’écart
   * (OFFRE_PREMIUM_AJOUT, src/contenu/paiement.ts).
   */
  passe_premium: {
    id: "passe_premium",
    centimes: 690,
    barre: PREMIUM.centimes - RAPPORT.centimes,
    bulles: PREMIUM.bulles - RAPPORT.bulles,
    conv: false,
    unique: "premium_ajout",
    enVente: true,
    titre: "Passage en Premium",
  },
  /* ⑤ : le 2e rapport à −50 %, juste après un rapport payé : un rapport d’avance, sans conv ni bulles à l’achat (RAPPORT_D_AVANCE) */
  second: { id: "second", centimes: 495, barre: RAPPORT.centimes, bulles: 0, conv: false, unique: "second_rapport", enVente: true, titre: "Ton 2e rapport" },
  pack10: { id: "pack10", centimes: 690, barre: null, bulles: 10, conv: false, unique: null, enVente: true, titre: "10 bulles" },
  /* Le pack conseillé (PACK_CONSEILLE) */
  pack25: { id: "pack25", ...PACK25, barre: null, conv: false, unique: null, enVente: true, titre: "25 bulles" },
  pack60: { id: "pack60", centimes: 3490, barre: null, bulles: 60, conv: false, unique: null, enVente: true, titre: "60 bulles" },
  /* Retirées de la vente le 23 octobre 2026, telles qu’elles se vendaient : l’ancien ③ (5 € pour 80 bulles), et les packs d’avant */
  premium_ajout: { id: "premium_ajout", centimes: 500, barre: 1390, bulles: 80, conv: false, unique: "premium_ajout", enVente: false, titre: "80 bulles en plus" },
  pack30: { id: "pack30", centimes: 890, barre: null, bulles: 30, conv: false, unique: null, enVente: false, titre: "30 bulles" },
  pack80: { id: "pack80", centimes: 1390, barre: null, bulles: 80, conv: false, unique: null, enVente: false, titre: "80 bulles" },
  pack200: { id: "pack200", centimes: 2390, barre: null, bulles: 200, conv: false, unique: null, enVente: false, titre: "200 bulles" },
};

/** Le rapport seul, à son prix ou moins cher (la suite ①, le −50 % gardé ⑥) : ce que ③, Premium pour 6,90 € de plus, complète. */
export const RAPPORTS_SEULS = ["rapport", "suite", "rapport_garde"] as const satisfies readonly OffreId[];

/** ③, le passage du rapport seul en Premium : celui qui se vend, et celui d’avant le 23 octobre 2026 (80 bulles pour 5 €), retiré, dans les achats passés. */
export const PASSAGES_EN_PREMIUM = ["passe_premium", "premium_ajout"] as const satisfies readonly OffreId[];

/**
 * Les recharges : les packs de bulles du catalogue (ni un rapport, ni une offre unique), ceux retirés de la vente
 * compris (une recharge d’avant, payée après, paie encore la réponse qui l’attend). Ceux de la feuille : PACKS
 * (src/contenu/recharge.ts).
 */
export const PACKS_DE_BULLES = (Object.keys(CATALOGUE) as OffreId[]).filter((o) => !CATALOGUE[o].conv && !CATALOGUE[o].unique);

/** Combien de temps l’offre unique ① reste valable une fois montrée : le compte à rebours de la feuille, l’heure de fin venue du serveur. */
export const DUREE_SUITE_MS = 5 * 60 * 1000;

/**
 * Les offres uniques de « C’est débloqué » (③ Premium pour 6,90 € de plus, ⑤ le 2e rapport à −50 %) ne valent que juste
 * après le paiement : le serveur ne les montre que dans ce temps après le paiement d’un rapport, et, montrées, elles
 * expirent ce temps après.
 */
export const DUREE_AJOUT_MS = 15 * 60 * 1000;

/** Combien de temps le repli de « C’est débloqué » (⑥) garde le −50 % pour une autre conv : 7 jours, l’heure de fin venue du serveur. */
export const DUREE_GARDE_MS = 7 * 24 * 3600 * 1000;

/**
 * Le rapport d’avance (l’offre ⑤, « second ») : payé sur « C’est débloqué », il débloque plus tard le rapport de la conv
 * de son choix, pas encore débloquée, sans rien payer (utiliserAvance, src/server/achats.ts), dans l’année qui suit son
 * paiement (`dureeMs`), et donne alors les bulles du rapport (`bulles`) ; commandé avant la grille du 23 octobre 2026,
 * celles du rapport d’alors, que son billet promettait (`bullesAvantLaGrille`, bullesDeLAvance). Rien n’est livré à
 * l’achat : le délai de rétractation court tant qu’il n’est pas utilisé, et c’est en l’utilisant qu’on y renonce.
 * TODO(produit): à relire par un juriste (un avoir valable un an, remboursable tant qu’il n’est pas utilisé).
 */
export const RAPPORT_D_AVANCE = { offre: "second", dureeMs: 365 * 24 * 3600 * 1000, bulles: CATALOGUE.rapport.bulles, bullesAvantLaGrille: 10 } as const satisfies {
  offre: OffreId;
  dureeMs: number;
  bulles: number;
  bullesAvantLaGrille: number;
};

/**
 * L’heure de la mise en ligne de la grille du 23 octobre 2026 (le rapport à 3 bulles) : un rapport d’avance commandé
 * avant s’est vendu sous les conditions d’alors (le rapport à 10 bulles : son billet, les conditions, Mon compte).
 * Posée à la fusion, le 25 octobre 2026 à 23 h (heure d’hiver, +01:00), juste avant la mise en ligne.
 */
export const GRILLE_DU_23_OCTOBRE = new Date("2026-10-25T23:00:00+01:00");

/** Les bulles que donne à son usage un rapport d’avance commandé à cette heure : celles que son billet promettait. */
export const bullesDeLAvance = (commandeLe: Date) => (commandeLe < GRILLE_DU_23_OCTOBRE ? RAPPORT_D_AVANCE.bullesAvantLaGrille : RAPPORT_D_AVANCE.bulles);

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
 * (pas cumulé avec l’écrite). Le reste est offert : le verdict, le rapport, la fiche et les numéros d’urgence. Une
 * réponse qui sort en alerte se paie comme les autres (décidé le 21 octobre 2026). Les bulles n’expirent jamais.
 */
export const COUT_EN_BULLES = { reponse: 1, vocal: 2, ajout: 3 } as const;

/**
 * Le parrainage (src/server/parrainage.ts) : au premier rapport payé de la filleule (venue par le lien de sa marraine),
 * chacune reçoit ces bulles, une fois (décidé le 17 octobre : 10 bulles chacune ; 3 depuis la grille du 23 octobre, comme
 * le rapport, pour ne pas donner à la filleule plus de la moitié de Premium).
 */
export const PARRAINAGE = { bulles: 3 } as const;

/** Les bulles données aux testeurs de la bêta (users.plan « rapport », ou l’ancien accès au chat), une fois. */
export const BULLES_DE_LA_BETA = 100;

/** La longueur la plus grande d’un nom de prix chez Whop : au-delà, il refuse de créer le prix (« Title is too long », le 13 octobre). */
export const TITRE_MAX_CHEZ_WHOP = 30;

/**
 * Le nom de l’achat chez Whop (le « title » de son prix : sur sa page de paiement, dans son reçu) : l’offre, et les
 * bulles figées dans l’achat à la commande (un lot de la roue compris), en TITRE_MAX_CHEZ_WHOP caractères au plus. Le
 * produit, lui, s’appelle BLUSH chez Whop. L’ancien ③ garde son nom, pour une commande d’avant encore en attente.
 */
export function titreChezWhop(offre: OffreId, bulles: number): string {
  switch (offre) {
    case "rapport":
    case "suite":
    case "rapport_garde":
      return `Le rapport complet + ${bulles} bulles`;
    case "premium":
      return `Premium\u00a0: rapport + ${bulles} bulles`;
    case "passe_premium":
      return `Premium\u00a0: +${bulles} bulles`;
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
