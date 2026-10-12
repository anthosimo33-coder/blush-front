import { creerRepere } from "@/lib/repere";

/*
 * Les ancres du rapport, écrites en un seul endroit. Chaque chapitre est une section `chapitre-N` : le sommaire et la
 * reprise y mènent, la lecture suivie les mesure, et on y arrive par l’adresse (/rapport#chapitre-N : « Lire la suite »
 * de « C’est débloqué », src/app/rapport/debloque/EcranDebloque.tsx). Les tests de bout en bout et la galerie
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

/*
 * Les pastilles flottantes et ce qu’elles surveillent, par repère (src/lib/repere.ts) plutôt que par un id cherché dans
 * la page : celui qui montre l’élément lui passe son repère en `ref`, la pastille le suit.
 */

/** La liste des chapitres qui s’écrivent : la pastille d’écriture s’efface tant qu’elle est à l’écran (src/app/rapport/Ecriture.tsx). */
export const SUITE_ECRITURE = creerRepere();
/** « Parler à BLUSH », au pied du rapport : la bulle du chat se cache tant qu’il est à l’écran (src/app/rapport/ChatBubble.tsx). */
export const PARLER_A_BLUSH = creerRepere();
/** « Reprendre ta lecture », en bas de l’écran : sur mobile, la bulle du chat se pose au-dessus d’elle (src/app/rapport/ChatBubble.tsx). */
export const PASTILLE_REPRISE = creerRepere();
