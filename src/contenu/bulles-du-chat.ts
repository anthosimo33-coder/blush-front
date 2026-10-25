import { CATALOGUE } from "./offres";

/*
 * Les textes des bulles dans le chat (l’accueil) : le compteur à côté du bouton du compte, ce que coûte chaque réponse
 * (sous elle), les cartes au-dessus du champ (les bulles là pour la première fois, bientôt finies, une réponse prête,
 * finies), la réponse prête et floutée, et le mot qui suit une recharge. Repris tels quels du prototype validé des bulles
 * (12 octobre), sauf ce que marque un TODO(produit).
 */

/**
 * À partir de combien de bulles (ou moins) la carte « Plus que N bulles » se pose au-dessus du champ, le compteur passe
 * au rose, et le mail S4 « il te reste peu de réponses » part (src/server/sequences.ts) : la dernière bulle. C’était 2,
 * comme le prototype (décidé le 13 octobre) ; avec le rapport à 3 bulles (le 23 octobre), 2 viendrait dès la première
 * réponse, deux tiers du solde encore là. La dernière bulle garde son sens pour tous les soldes (3, 10, 25, 60).
 * TODO(produit): le seuil de la grille du 23 octobre (la dernière bulle), à valider.
 */
export const SEUIL_PEU_DE_BULLES = 1;

/** Les places de la rangée de perles de la carte « Plus que N bulles » : les bulles qui restent, pleines, puis des vides. */
export const PERLES_DE_LA_CARTE = 5;

/** Le compteur de bulles (CompteurBulles) : son nom pour un lecteur d’écran, et l’équipe, aux bulles illimitées. */
export const COMPTEUR = {
  nom: (bulles: number) => `Tes bulles\u00a0: ${bulles}`,
  /**
   * L’équipe, à l’œil : « ∞ » (le mot « illimitées » décentrait le logo de BLUSH, et sur 375 px le touchait) ; son nom,
   * pour un lecteur d’écran, le dit en toutes lettres. TODO(produit): le texte de l’équipe, sans maquette.
   */
  illimitees: "∞",
  nomIllimitees: "Tes bulles\u00a0: illimitées",
};

/** Sous chaque réponse de BLUSH, ce qu’elle a coûté et ce qu’il reste (le serveur le dit avec elle). */
export const recu = (depensees: number, restantes: number) => `${depensees} bulle${depensees > 1 ? "s" : ""} · il t’en reste ${restantes}`;

/** Les cartes au-dessus du champ (BandeauBulles). */
export const CARTES = {
  /**
   * La première fois que le compteur se montre : ce qu’il compte. « offertes » quand ce sont les bulles du rapport (3),
   * comme dans le prototype. TODO(produit): le texte d’un autre solde (Premium, un don, la bêta), sans maquette.
   */
  offertes: (bulles: number) => (bulles === CATALOGUE.rapport.bulles ? `Tes ${bulles} bulles offertes sont là` : `Tes ${bulles} bulles sont là`),
  commentCaMarche: "1 bulle = 1 réponse de BLUSH · comment ça marche",
  fermer: "Fermer",
  /** « Plus qu’une bulle » à la dernière (le seuil, SEUIL_PEU_DE_BULLES), « Plus que N bulles » au-delà. */
  peu: (bulles: number) => (bulles > 1 ? `Plus que ${bulles} bulles` : "Plus qu’une bulle"),
  /** `ilOuElle` : « Il » ou « Elle », l’autre personne. */
  peuNote: (ilOuElle: string) => `${ilOuElle} va te répondre. Tu auras de quoi lui répondre\u00a0?`,
  prete: (autre: string) => `Ta réponse à ${autre} est écrite`,
  preteNote: "Recharge, elle s’affiche tout de suite.",
  lire: "La lire",
  finies: "Tes bulles sont finies",
  finiesNote: "BLUSH garde tout en mémoire.",
  recharger: "Recharger",
};

/** La réponse écrite à 0 bulle, floutée dans la conv (sans rien d’elle : le serveur la garde). */
export const REPONSE_PRETE = {
  titre: "Ta réponse est prête",
  recharger: "Recharger pour la lire",
  /** Le solde la couvre déjà (rechargé ailleurs) : elle se lit d’un toucher. */
  lire: "La lire",
};

/** Le mot qui suit une recharge payée, en haut de l’écran : les bulles reçues, et la réponse prête, lue avec elles. */
export const apresLaRecharge = (bulles: number, lue: boolean) => `+${bulles} bulles${lue ? ", ta réponse est là" : ""}`;
