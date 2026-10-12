/*
 * Les types de scripts/galerie/screens.mjs, pour scripts/galerie/galerie.spec.ts : sans allowJs, tsc ne lit plus un
 * .mjs. La liste reste en JavaScript (capture.mjs la lit aussi, sans compiler) ; ces déclarations reprennent ses
 * @typedef, et changent avec eux.
 * tests/unit/declarations-scripts.test.ts vérifie que les deux exportent les mêmes noms, les fonctions en
 * fonctions ; les signatures, elles, se relisent à la main.
 */
import type { Page } from "@playwright/test";

/** Le compte préparé avant la capture (galerie.spec.ts, `preparer`) : voir screens.mjs. Sans : aucun compte, aucune conv. */
export type Compte = "brouillon" | "code" | "gratuit" | "lecture-en-cours" | "rapport" | "equipe" | "sobre" | "plusieurs" | "couple";

/** Ce que les gestes reçoivent : l’écran (m ou d), l’histoire ouverte, et un code faux pour l’email du parcours. */
export type Contexte = { ecran: "m" | "d"; histoire: string | null; codeFaux: string | null };

/** Un état capturé : une route, le compte préparé avant, des gestes éventuels (le détail de chaque champ : screens.mjs). */
export type Etat = {
  id: string;
  section: string;
  title: string;
  state?: string;
  route: string;
  ref?: string;
  note?: string;
  changement?: string;
  full?: boolean;
  sheet?: boolean;
  touch?: boolean;
  motion?: boolean;
  wait?: number;
  only?: "m" | "d";
  compte?: Compte;
  bulles?: number;
  journey?: Record<string, unknown>;
  reprise?: number;
  hover?: string | { role: string; name: string | RegExp };
  retenir?: { chemin: string; methode?: string };
  steps?: (page: Page, ctx: Contexte) => Promise<void>;
};

/** Les sections de la galerie, dans l’ordre de la page. */
export const SECTIONS: { id: string; title: string; sub: string }[];
/** Les états qui ne sont plus dans la galerie, et pourquoi : affichés en haut de la page. */
export const RETIRES: { ids: string; why: string }[];
/** Les états capturés. */
export const STATES: Etat[];
/** Planches du design system, montrées comme références dans la section « Design system ». */
export const PLANCHES: string[];
