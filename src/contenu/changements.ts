/*
 * Les changements du produit qui touchent tout le monde, datés (jour de Paris de leur mise en ligne) : le résumé d’/admin
 * les pose sur les colonnes du payé, pour lire un avant et un après sans test A/B (le volume est trop petit pour en
 * faire). Un changement du prix, d’une offre, du paywall, de l’import ou du chat s’ajoute ici avec sa mise en ligne ; une
 * retouche qui ne peut pas bouger les ventes n’y a pas sa place. Du plus ancien au plus récent.
 * TODO(produit): les jours d’avant novembre sont ceux de leur fusion, à confirmer contre leur mise en ligne.
 */

/** Un changement du produit : son jour (AAAA-MM-JJ, à Paris), et ce qui a changé ce jour-là. */
export type Changement = { le: string; quoi: string };

export const CHANGEMENTS: readonly Changement[] = [
  { le: "2026-10-16", quoi: "Paywall\u00a0: un seul écran, sans verdict gratuit, et un titre tiré des chiffres de la conv" },
  { le: "2026-10-21", quoi: "Prix\u00a0: le rapport à 9,90\u00a0€, Premium à 14,90\u00a0€" },
  { le: "2026-10-22", quoi: "Landing et paywall\u00a0: les aperçus du rapport, les avis et les questions" },
  { le: "2026-10-25", quoi: "Offres\u00a0: le rapport à 9,90\u00a0€ avec 3 bulles, Premium à 19,90\u00a0€ avec 25 bulles" },
  { le: "2026-10-26", quoi: "Paywall\u00a0: «\u00a0Qu’est-ce qui coince\u00a0?\u00a0» après la carte refermée, et la note du rapport" },
  { le: "2026-10-27", quoi: "Paywall\u00a0: un titre pour les convs sans heures, et le titre «\u00a0volume\u00a0»" },
  { le: "2026-11-03", quoi: "Import\u00a0: la vidéo de l’écran retirée, des captures seules" },
  { le: "2026-11-09", quoi: "Chat à 0 bulle\u00a0: la réponse déjà écrite, à débloquer" },
];
