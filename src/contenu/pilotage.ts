import type { EtapeVisite, GenreVendu, OffreId, SourceVisite } from "@/types";
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
 * TTC ; `dollars` : ce qu’a coûté l’IA. null sans vente (rien à diviser). Hors frais Whop et hors créatrices.
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
