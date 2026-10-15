import { Chapitre05, type Chapitre } from "@prompts/lib/schemas";
import type { AvanceMoitie, DetailEcriture, Genre } from "./db/enums";
import type { Avance } from "./ia/claude";

/*
 * Les jauges : où en est une étape, lu sur ce que le modèle a déjà écrit (sa réflexion, puis sa réponse), et les seuils
 * des écrans qui les montrent (la lecture, l’écriture du rapport). Des calculs purs, sans base ni modèle : la chaîne
 * (analyse.ts) les écrit en base pendant l’appel, les écrans (presentation/rapport.ts, donnees.ts) les relisent.
 * Testés seuls (tests/unit/avancement.test.ts). Les chiffres viennent des rapports de test : la longueur habituelle de
 * chaque sortie, et le rythme de la réflexion.
 */

/* ———— Le verdict ———— */

/** Le verdict (0 à 100) : pendant la réflexion, on s’approche de ce seuil sans l’atteindre ; l’écriture du verdict part de là. */
export const VERDICT_REFLEXION = 70;
/** Le verdict, avant ses premiers mots : on part de là (le modèle lit la conv). */
const VERDICT_DEPART = 15;
/** La longueur habituelle d’un verdict écrit, en caractères. */
const VERDICT_LONGUEUR = 700;
/** Le rythme de la réflexion : à ce nombre de caractères, elle a fait environ 63 % de son chemin. */
const REFLEXION_ECHELLE = 2500;
/** Une jauge en base ne dit jamais 100 avant la fin de l’étape (`finir` la clôt). */
const PLAFOND = 98;

/** S’approche de 1 sans l’atteindre, au rythme `echelle` : une réflexion dont on ne connaît pas la longueur. */
const approche = (x: number, echelle: number) => 1 - Math.exp(-x / echelle);

/**
 * L’avancée du verdict (0 à 100) d’après ce que le modèle a déjà écrit : sa réflexion (sa longueur varie : on s’en
 * approche sans l’atteindre, jusqu’à 70), puis le verdict lui-même (environ 700 caractères), jusqu’à 98.
 */
export const avanceVerdict = (a: Avance) =>
  Math.min(
    PLAFOND,
    Math.round(
      a.texte > 0
        ? VERDICT_REFLEXION + (PLAFOND - VERDICT_REFLEXION) * Math.min(1, a.texte / VERDICT_LONGUEUR)
        : VERDICT_DEPART + (VERDICT_REFLEXION - VERDICT_DEPART) * approche(a.reflexion, REFLEXION_ECHELLE),
    ),
  );

/* ———— Le plan du rapport ———— */

/** Le plan (0 à 100) : sa réflexion jusqu’à ce seuil, puis ses chapitres. */
const PLAN_REFLEXION = 50;
/** Les chapitres d’un rapport, que le plan annonce un par un. */
const CHAPITRES_DU_PLAN = 8;

/** Les chapitres déjà commencés dans ce que le modèle a écrit (chaque chapitre de sa réponse commence par son numéro). */
export const chapitresCommences = (ecrit: string) => [...ecrit.matchAll(/"numero"\s*:\s*(\d+)/g)].map((m) => +m[1]!);

/** Le plan du rapport (0 à 100) : sa réflexion jusqu’à 50, puis ses huit chapitres, un par un, jusqu’à 98. */
export const avancePlan = (a: Avance) =>
  Math.min(
    PLAFOND,
    Math.round(
      a.texte > 0
        ? PLAN_REFLEXION + (PLAFOND - PLAN_REFLEXION) * Math.min(1, chapitresCommences(a.ecrit).length / CHAPITRES_DU_PLAN)
        : PLAN_REFLEXION * approche(a.reflexion, REFLEXION_ECHELLE),
    ),
  );

/* ———— Les chapitres, moitié par moitié ———— */

/** Une moitié (0 à 1) : sa réflexion, avant le premier chapitre, s’approche de ce seuil sans l’atteindre. */
const MOITIE_REFLEXION = 0.45;
/** Le rythme de la réflexion d’une moitié (plus longue que celle du plan : elle relit le plan). */
const MOITIE_REFLEXION_ECHELLE = 3000;
/** La longueur habituelle d’un chapitre écrit, en caractères. */
const CHAPITRE_LONGUEUR = 2000;
/** Un chapitre en cours ne compte jamais pour fini avant que le suivant commence. */
const CHAPITRE_EN_COURS_MAX = 0.95;
/** Une moitié ne dit jamais 1 avant la fin de l’étape. */
const MOITIE_PLAFOND = 0.98;
/** Les chapitres d’une moitié (1 à 4, ou 5 à 8) : la première finit au chapitre CHAPITRES_PAR_MOITIE. */
export const CHAPITRES_PAR_MOITIE = 4;

/**
 * Les chapitres déjà finis dans ce que le modèle a écrit : un chapitre est fini quand le suivant commence (le dernier,
 * à la fin de la réponse). Chacun est relu par son schéma : un morceau mal formé est simplement ignoré.
 */
export function chapitresFinis(ecrit: string): Chapitre[] {
  const debuts = [...ecrit.matchAll(/\{\s*"numero"\s*:/g)].map((m) => m.index!);
  return debuts.slice(0, -1).flatMap((d, k) => {
    try {
      const ok = Chapitre05.safeParse(JSON.parse(ecrit.slice(d, debuts[k + 1]).replace(/[\s,]+$/, "")));
      return ok.success ? [ok.data] : [];
    } catch {
      return [];
    }
  });
}

/** Où en est une moitié du rapport (chapitres 1 à 4, ou 5 à 8), d’après ce que le modèle a déjà écrit. */
export function avanceMoitie(a: Avance, premier: 1 | 5): AvanceMoitie {
  const nums = chapitresCommences(a.ecrit).filter((n) => n >= premier && n < premier + CHAPITRES_PAR_MOITIE);
  /* Avant le premier chapitre, il réfléchit : on s’approche de 45 % sans l’atteindre */
  if (!nums.length) return { progres: MOITIE_REFLEXION * approche(a.reflexion, MOITIE_REFLEXION_ECHELLE), ecrits: [], enCours: a.texte > 0 ? premier : null };
  /* Un chapitre fait environ 2 000 caractères : on avance dans celui en cours, sans jamais le finir avant le suivant */
  const dansLeChapitre = a.ecrit.length - a.ecrit.lastIndexOf('"numero"');
  const chapitres = nums.length - 1 + Math.min(CHAPITRE_EN_COURS_MAX, dansLeChapitre / CHAPITRE_LONGUEUR);
  return { progres: Math.min(MOITIE_PLAFOND, MOITIE_REFLEXION + ((1 - MOITIE_REFLEXION) * chapitres) / CHAPITRES_PAR_MOITIE), ecrits: nums.slice(0, -1), enCours: nums.at(-1)! };
}

/**
 * L’avancée des chapitres (0 à 1) : la moyenne des deux moitiés, qui s’écrivent en même temps. L’étape l’écrit en base
 * (sur 100), l’écran de l’écriture la relit (ecritureDe, src/server/presentation/rapport.ts). 0 avant le premier suivi.
 */
export const avanceChapitres = (detail: DetailEcriture | null | undefined): number => (detail ? (detail.a.progres + detail.b.progres) / 2 : 0);

/* ———— Les durées des étapes ———— */

/**
 * La durée habituelle de chaque étape, mesurée sur les rapports de test (ai_usage.ms donne celles de la production).
 * Elle décide si une étape a le temps de commencer (tempsPourCommencer, src/server/pipeline.ts), et donne aux écrans
 * le temps qui reste.
 */
export const DUREES_MS: Record<Genre, number> = {
  verdict: 60_000,
  rapport_plan: 55_000,
  /* Les deux moitiés en même temps, et le vocal pendant ce temps */
  rapport_chapitres: 100_000,
  vocal: 45_000,
  memoire: 90_000,
  memoire_maj: 60_000,
};

/* ———— Ce que montrent les écrans ———— */

/*
 * L’écran de lecture (le verdict) : avant les premiers mots du modèle, on avance doucement, de LECTURE_DEPART jusqu’à
 * LECTURE_MAX, en une minute ; ensuite, la jauge du verdict. Ses quatre étapes affichées suivent ces phases, et son
 * compteur de messages est plein quand l’écriture du verdict commence (VERDICT_REFLEXION).
 */
/** La lecture, tant que sa tâche attend : un peu plus que rien. */
export const LECTURE_ATTENTE = 0.02;
/** La lecture, au début de son essai. */
export const LECTURE_DEPART = 0.03;
/** La lecture, avant les premiers mots du modèle : on ne dépasse pas ce seuil. */
export const LECTURE_MAX = 0.15;
/** Les secondes qu’il faut pour aller de LECTURE_DEPART à 1 (on s’arrête à LECTURE_MAX). */
export const LECTURE_RYTHME_S = 60;
/** Les seuils des étapes de l’écran de lecture (0 à 1) : la deuxième étape commence au premier, et ainsi de suite. */
export const ETAPES_DE_LECTURE = [0.35, 0.55, VERDICT_REFLEXION / 100] as const;
/** Les étapes de l’écran de lecture : une de plus que de seuils (la première commence à 0). Toutes faites, la lecture est finie. */
export const NB_ETAPES_DE_LECTURE = ETAPES_DE_LECTURE.length + 1;

/** L’étape de l’écran de lecture (0 à 3) pour une avancée de 0 à 1. */
export const etapeDeLecture = (p: number) => {
  const k = ETAPES_DE_LECTURE.findIndex((seuil) => p < seuil);
  return k < 0 ? ETAPES_DE_LECTURE.length : k;
};

/*
 * La relecture d’une prise du mode tournage (src/server/tournage.ts) : la lecture est déjà faite, l’écran la rejoue au
 * rythme d’une vraie (« Ça prend environ 40 secondes »), par les mêmes phases : le modèle lit la conv, réfléchit, puis
 * écrit le verdict. Rien n’attend le modèle : la même prise rejouée deux fois avance pareil.
 */
/** La durée de la relecture d’une prise. */
export const DUREE_RELECTURE_MS = 40_000;
/** Les points de la relecture : la part du temps écoulé, et l’avancée de l’écran à ce moment. */
const RELECTURE: readonly (readonly [number, number])[] = [
  [0, LECTURE_DEPART],
  [0.1, LECTURE_MAX],
  [0.7, VERDICT_REFLEXION / 100],
  [0.95, PLAFOND / 100],
  [1, PLAFOND / 100],
];

/** L’avancée de la relecture (0 à 1) au bout de `ecouleMs` : 1 une fois DUREE_RELECTURE_MS passée, la lecture finie. */
export function avanceRejouee(ecouleMs: number): number {
  const x = Math.max(0, ecouleMs) / DUREE_RELECTURE_MS;
  if (x >= 1) return 1;
  const k = RELECTURE.findIndex(([part]) => part > x);
  const [x0, y0] = RELECTURE[k - 1]!;
  const [x1, y1] = RELECTURE[k]!;
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

/*
 * L’écriture du rapport : le plan compte pour PART_DU_PLAN de l’avancée, les deux moitiés des chapitres pour le reste.
 * L’écran ne dit jamais « fini » avant que le rapport le soit.
 */
/** La part du plan dans l’avancée de l’écriture (0 à 1) ; les chapitres font le reste. */
export const PART_DU_PLAN = 0.35;
/** L’écriture affichée ne dépasse pas ce seuil tant que le rapport n’est pas gardé. */
export const ECRITURE_MAX = 0.99;
/** En dessous de cette avancée des chapitres, leur rythme observé est trop court pour estimer le temps qui reste : on prend leur durée habituelle. */
export const RYTHME_FIABLE = 0.25;
