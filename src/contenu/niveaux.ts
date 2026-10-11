/*
 * Les niveaux d’une histoire, et leurs noms à l’écran : une règle du produit, lue par le chemin des niveaux
 * (src/components/ui/progress.tsx), l’anneau du contact (src/components/ui/contact.tsx) et l’accueil (l’anneau de
 * l’en-tête, les niveaux de la feuille du contact). Le modèle choisit l’identifiant (LevelId) ; les noms vivent ici.
 */
import type { LevelId } from "@/types";

/** Un niveau : son identifiant (celui du rapport) et son nom à l’écran. */
type Niveau = { id: LevelId; label: string };

/** Avant d’être ensemble : des étapes, qu’on franchit l’une après l’autre. */
const ETAPES: Niveau[] = [
  { id: "parle", label: "On se parle" },
  { id: "voit", label: "On se voit" },
  { id: "dit", label: "On se le dit" },
  { id: "ensemble", label: "On est ensemble" },
];

/** En couple : une température, du plus froid au plus chaud. On y est quelque part, sans étape à franchir. */
const TEMPERATURE: Niveau[] = [
  { id: "eloigne", label: "On s’éloigne" },
  { id: "coince", label: "Ça coince" },
  { id: "va", label: "Ça va" },
  { id: "soudes", label: "On est soudés" },
];

/** L’échelle d’un niveau : les étapes, ou la température en couple, et la place du niveau sur elle. */
export function scaleOf(level: LevelId) {
  const temperature = TEMPERATURE.some((l) => l.id === level);
  const levels = temperature ? TEMPERATURE : ETAPES;
  return { levels, index: levels.findIndex((l) => l.id === level), temperature };
}

/**
 * Ce que les lecteurs d’écran entendent après le nom d’un niveau : la tienne (« niveau en cours », ou « vous en êtes
 * là » en couple), les franchies (« réussi »), les suivantes (« à venir » ; rien en couple, où rien n’est à franchir).
 */
export function etatDuNiveau(i: number, index: number, temperature: boolean): string {
  if (i === index) return temperature ? "\u00a0: vous en êtes là" : "\u00a0: niveau en cours";
  if (!temperature && i < index) return "\u00a0: réussi";
  return temperature ? "" : "\u00a0: à venir";
}
