import { COUT_EN_BULLES } from "./offres";

/*
 * Les textes des pièces communes des bulles (src/components/bulles) : « C’est quoi une bulle ? », sa feuille, et les
 * petits mots des pièces de dessin (« offertes », « 0 € »). Repris tels quels du prototype validé des bulles (12 octobre) ;
 * les nombres viennent du catalogue (src/contenu/offres.ts), jamais recopiés. Les textes des écrans qui montent ces pièces
 * (la feuille « Ta formule », la recharge, le chat) restent avec leurs écrans.
 */

/** La règle, en une ligne : ce qu’une bulle paie. */
const REGLE = "1 bulle = 1 réponse de BLUSH";

/** « C’est quoi une bulle ? » en une ligne (CestQuoiUneBulle), qui ouvre sa feuille. */
export const CEST_QUOI = {
  texte: REGLE,
  /** Son nom pour un lecteur d’écran : la règle, puis ce que le toucher ouvre. */
  nom: `${REGLE}. C’est quoi une bulle\u00a0?`,
};

/** Ce que coûte chaque réponse, dans l’ordre de la feuille : le libellé de chaque coût du catalogue (COUT_EN_BULLES). */
const QUOI: Record<keyof typeof COUT_EN_BULLES, string> = {
  reponse: "Une réponse de BLUSH",
  vocal: "Une réponse en vocal",
  ajout: "Lire des captures ou un export",
};

/** Les lignes des coûts de la feuille : chaque libellé et son prix en bulles, lu dans le catalogue. */
export const COUTS = (Object.keys(QUOI) as (keyof typeof COUT_EN_BULLES)[]).map((cle) => ({ cle, quoi: QUOI[cle], bulles: COUT_EN_BULLES[cle] }));

/** La feuille « C’est quoi une bulle ? » (FeuilleBulle). */
export const FEUILLE_BULLE = {
  titre: "C’est quoi une bulle\u00a0?",
  regle: REGLE,
  sousRegle: "Sur tout ce que tu veux. Elles n’expirent jamais.",
  exemplesTitre: "Tu lui parles comme à un pote, de tout",
  /** Ce qu’on dit à BLUSH, comme à un pote (inventé) : n’importe quoi, et sa réponse coûte une bulle. */
  exemples: [
    { toi: "elle a liké ma story", blush: "elle t’a remarqué" },
    { toi: "je stresse pour samedi", blush: "on prépare ça" },
    { toi: "«\u00a0on verra\u00a0», ça veut dire\u00a0?", blush: "pas un non" },
  ],
  /** Pour un lecteur d’écran, qui parle dans chaque exemple (les couleurs des bulles le disent à l’œil). */
  toi: "Toi\u00a0: ",
  blush: "BLUSH\u00a0: ",
  /** Pour un lecteur d’écran, après le nombre de bulles d’une ligne. */
  unite: (n: number) => (n > 1 ? "\u00a0bulles" : "\u00a0bulle"),
  offert: { quoi: "Rapport, fiche, numéros d’aide", prix: "Offert" },
  recharger: (solde: number) => `Recharger · il t’en reste ${solde}`,
  compris: "Compris",
};

/** Les petits mots des pièces de dessin (LigneOfferte). */
export const PIECES = {
  /** Ce que coûte ce qui est offert, en rose à droite de sa ligne : sans centimes, comme le prototype. */
  gratuit: "0\u00a0€",
  offertes: "offertes",
};
