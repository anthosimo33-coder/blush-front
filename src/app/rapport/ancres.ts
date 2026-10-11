/*
 * Les ancres du rapport, écrites en un seul endroit. Chaque chapitre est une section `chapitre-N` : le sommaire et la
 * reprise y mènent, la lecture suivie les mesure, et on y arrive par l’adresse (/rapport#chapitre-N : « Lire la suite »
 * de « C’est débloqué », src/app/rapport/debloque/UnlockedScreen.tsx). Les tests de bout en bout et la galerie
 * (scripts/galerie/screens.mjs) les visent aussi, sous la même forme.
 */

/** L’id de la section d’un chapitre (et l’ancre de son adresse, sans le #). */
export const ancreDuChapitre = (n: number) => `chapitre-${n}`;

/** L’id du titre d’un chapitre, qui nomme sa section. */
export const titreDuChapitre = (n: number) => `${ancreDuChapitre(n)}-titre`;

/** Le chapitre que vise une ancre d’adresse (« #chapitre-3 » → 3), ou null. */
export function chapitreDeLAncre(hash: string): number | null {
  const m = /^#chapitre-(\d+)$/.exec(hash);
  return m ? Number(m[1]) : null;
}

/** La section d’un chapitre dans la page, si elle y est. */
export const sectionDuChapitre = (n: number) => document.getElementById(ancreDuChapitre(n));

/** La liste des chapitres qui s’écrivent : la bulle du chat se cache tant qu’elle est à l’écran (src/app/rapport/Ecriture.tsx). */
export const ID_SUITE_ECRITURE = "suite-ecriture";
/** « Parler à BLUSH », au pied du rapport : la bulle du chat se cache tant qu’il est à l’écran (src/app/rapport/ChatBubble.tsx). */
export const ID_PARLER_A_BLUSH = "cta-chat";
/** Le titre de la feuille du sommaire (mobile), qui la nomme. */
export const ID_TITRE_SOMMAIRE = "sommaire-titre";
