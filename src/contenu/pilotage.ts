import type { EtapeVisite, GenreVendu, OffreId, Population, SourceVisite, TypeDImport } from "@/types";
import { CATALOGUE, prixDe } from "./offres";

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
 * TTC ; `dollars` : ce qu’a coûté l’IA. null sans vente (rien à diviser). Hors frais Whop et hors créatrices. /admin en
 * fait la marge produit : les ventes des vrais clients face à l’IA du produit (les clients et les prospects), sans les
 * achats ni l’IA des tests (src/server/population.ts).
 */
export function margeApresIA(centimes: number, dollars: number): number | null {
  const ht = centimes / 100 / (1 + TVA);
  if (ht <= 0) return null;
  return ((ht - dollars * EUROS_PAR_DOLLAR) / ht) * 100;
}

/**
 * Les offres réunies par ce qu’elles vendent, pour « Ce qui se vend » : les deux formules (le rapport seul compte aussi
 * son −50 % gardé), la suite (①), le 2e rapport (⑤, un rapport d’avance), et les bulles (les packs, et ③ : le passage en
 * Premium après le rapport, comme l’ancien ③ ; les offres retirées de la vente le 23 octobre gardent leur groupe).
 */
export const GROUPES_D_OFFRES = ["premium", "rapport", "suite", "second", "bulles"] as const;
export type GroupeDOffres = (typeof GROUPES_D_OFFRES)[number];
export const GROUPE_DE_L_OFFRE: Record<OffreId, GroupeDOffres> = {
  premium: "premium",
  rapport: "rapport",
  suite: "suite",
  rapport_garde: "rapport",
  second: "second",
  passe_premium: "bulles",
  pack10: "bulles",
  pack25: "bulles",
  pack60: "bulles",
  premium_ajout: "bulles",
  pack30: "bulles",
  pack80: "bulles",
  pack200: "bulles",
};
export const NOMS_DES_GROUPES: Record<GroupeDOffres, string> = { premium: "Premium", rapport: "Le rapport", suite: "Offre unique", second: "2e rapport", bulles: "Bulles" };

/**
 * ③, le passage en Premium après le rapport seul, dans /admin (ses coups de pouce, sa carte du chat). Ses compteurs
 * (montrée, prise, posée, payée) réunissent l’ancien ③ et le nouveau, qui partagent l’offre unique et le genre de la
 * carte (une seule fois par compte) : son nom dit l’ancien, sur une période à cheval sur le 23 octobre 2026. Les
 * centimes, eux, sont ceux payés.
 */
export const NOM_DU_PASSAGE_EN_PREMIUM = `Premium pour ${prixDe("passe_premium")} de plus (${CATALOGUE.premium_ajout.bulles} bulles pour ${CATALOGUE.premium_ajout.centimes / 100}\u00a0€ avant le 23 octobre)`;

/**
 * Le nom de chaque population (la règle « qui est qui », src/server/population.ts), dans /admin « Ce que coûte l’IA », le
 * serveur MCP et le résumé de la nuit.
 */
export const NOMS_DES_POPULATIONS: Record<Population, string> = {
  client: "Clients",
  prospect: "Prospects",
  offert: "Invités (offert)",
  equipe: "L’équipe",
  tournage: "Le tournage",
  inconnu: "Non classé",
};

/** Le nom de chaque type d’import (src/server/imports.ts), dans /admin « L’IA avant l’achat » et le serveur MCP. */
export const NOMS_DES_TYPES_D_IMPORT: Record<TypeDImport, string> = { export: "Export", captures: "Captures", video: "Vidéo" };

/**
 * Les tranches de longueur d’une conv payée (« Par longueur », src/server/stats.ts), par son nombre de messages
 * (stories.message_count : tous ceux reçus, pas seulement ceux que lit le modèle) : moins de 1 000, de 1 000 à 3 000, de
 * 3 000 à 7 000, et 7 000 ou plus. 3 000 : la conv très longue du plan du 27 octobre 2026 (environ 100 000 jetons lus) ;
 * 7 000 : à peu près ce que le modèle lit au plus (CONV_MAX, prompts/lib/conv.ts : 500 000 caractères, le début et
 * surtout la fin), au-delà duquel une lecture ne coûte plus davantage.
 */
export const TRANCHES_DE_LONGUEUR = ["moins_de_1000", "de_1000_a_3000", "de_3000_a_7000", "7000_et_plus"] as const;
export type TrancheDeLongueur = (typeof TRANCHES_DE_LONGUEUR)[number];
/* Le premier nombre de messages de chaque tranche, la première exceptée (dans l’ordre de TRANCHES_DE_LONGUEUR) */
const BORNES_DES_TRANCHES = [1000, 3000, 7000] as const;
/** Les tranches d’une conv très longue (3 000 messages ou plus) : la part des ventes qu’elles font décide d’en réserver la lecture à Premium. */
export const TRANCHES_TRES_LONGUES: readonly TrancheDeLongueur[] = ["de_3000_a_7000", "7000_et_plus"];
/** La tranche d’une conv de `messages` messages. */
export const trancheDe = (messages: number): TrancheDeLongueur => TRANCHES_DE_LONGUEUR[BORNES_DES_TRANCHES.filter((b) => messages >= b).length]!;
export const NOMS_DES_TRANCHES: Record<TrancheDeLongueur, string> = {
  moins_de_1000: "Moins de 1\u202f000 messages",
  de_1000_a_3000: "1\u202f000 à 3\u202f000",
  de_3000_a_7000: "3\u202f000 à 7\u202f000",
  "7000_et_plus": "7\u202f000 et plus",
};

/**
 * L’offre qui a débloqué une conv payée (« Par longueur ») : le rapport, Premium, ① (le rapport moins cher, l’offre
 * unique du paywall), ⑤ (le 2e rapport, payé d’avance et utilisé sur elle), ⑥ (le rapport à −50 % gardé 7 jours), ou une
 * autre offre d’une conv (aucune aujourd’hui : une offre à venir s’y range d’elle-même).
 */
export const OFFRES_D_UNE_CONV = ["rapport", "premium", "suite", "second", "rapport_garde", "autre"] as const satisfies readonly (OffreId | "autre")[];
export type OffreDUneConv = (typeof OFFRES_D_UNE_CONV)[number];
export const NOMS_DES_OFFRES_D_UNE_CONV: Record<OffreDUneConv, string> = {
  rapport: "Le rapport",
  premium: "Premium",
  suite: "①\u00a0offre unique",
  second: "⑤\u00a02e rapport",
  rapport_garde: "⑥\u00a0−50\u00a0%",
  autre: "Autre",
};

/** Le nom de chaque carte d’achat du chat (src/server/vente.ts), dans /admin. */
export const NOMS_DES_VENTES: Record<GenreVendu, string> = {
  bulles: "Recharge",
  premium: NOM_DU_PASSAGE_EN_PREMIUM,
  autre: "Une autre conv",
  a_jour: "Le rapport à jour",
  reimport: "Le réimport (ancien doux)",
};

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

/** Celui qui importe et la personne dont il parle, d’après leurs pronoms (« Qui importe », src/server/stats.ts). */
export const PAIRES = ["fille_garcon", "garcon_fille", "deux_filles", "deux_garcons"] as const;
export type Paire = (typeof PAIRES)[number];
export const NOMS_DES_PAIRES: Record<Paire, string> = {
  fille_garcon: "Une fille sur un garçon",
  garcon_fille: "Un garçon sur une fille",
  deux_filles: "Deux filles",
  deux_garcons: "Deux garçons",
};
/** Celui qui importe, d’après son pronom de « Qui es-tu ? » ; `inconnu` : pas encore rempli. */
export const NOMS_DES_GENRES: Record<"elle" | "il" | "inconnu", string> = { elle: "Des filles", il: "Des garçons", inconnu: "Pas encore dit" };

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

/**
 * Les seuils de la délivrabilité des mails (le bloc « Délivrabilité », src/server/delivrabilite.ts), en part de 1.
 * Resend : rebonds sous 4 % des mails partis, plaintes sous 0,08 % des mails remis (au-delà, il peut suspendre l’envoi).
 * Gmail : signalements comme spam sous 0,1 %, jamais 0,3 % (ses règles des envois en nombre, février 2024) ; mais Gmail
 * ne rend pas ses plaintes à Resend : elles se lisent dans Google Postmaster Tools, pas ici.
 */
export const SEUILS_DELIVRABILITE = { rebonds: 0.04, plaintes: 0.0008, spamGmail: 0.001, spamGmailJamais: 0.003 } as const;

/** Sous ce nombre de mails partis sur 7 jours, le taux de rebonds ne se juge pas (un rebond sur dix mails ferait 10 %) ; les plaintes, toujours. */
export const VOLUME_MIN_DES_REBONDS = 50;

/** Une sorte de mail (SorteSuivie, src/server/email.ts) du sous-domaine des relances : la relance ②, ou un mail des séquences. */
export const estUneRelance = (sorte: string) => sorte === "relance" || sorte.startsWith("sequence-");
