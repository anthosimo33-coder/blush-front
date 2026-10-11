/*
 * Les types de scripts/verifier-fuite.mjs, pour tests/verifier-fuite.test.ts : sans allowJs, tsc ne lit plus un .mjs.
 * Le script reste en JavaScript (node le lance après le build) ; ces déclarations changent avec lui.
 */

/** Un prompt copié côté serveur : son nom de fichier (dans prompts/), et son texte. */
export type TextePrompt = { fichier: string; texte: string };
/** Une suite de mots des prompts, et sa première place : le rang du prompt (`k`), celui de son premier mot (`n`). */
export type IndexDesPrompts = Map<string, { k: number; n: number }>;
/** Une phrase écrite comme l’écrit un build. */
type Encodage = (ph: string) => string;

/** Moins de suites que ça : les prompts n’ont pas été lus comme il faut, la vérification ne prouverait rien. */
export const MIN_SUITES: number;
/** La longueur des suites de mots cherchées. */
export const TAILLE: number;

/** Le texte tel qu’on le lirait : les échappements du JavaScript et du JSON, et les entités HTML, décodés. */
export function decoder(contenu: string): string;

/** Les mots d’un texte, comme les compare le garde-fou (en minuscules, sans balises ni commentaires HTML). */
export function mots(texte: string): string[];

/** Les prompts copiés côté serveur (scripts/prompts.mjs), tels qu’écrits. */
export function textesDesPrompts(): TextePrompt[];

/** Les phrases des prompts d’au moins TAILLE mots, telles qu’écrites. */
export function phrasesDesPrompts(textes?: readonly TextePrompt[]): string[];

/** L’index des suites de mots des prompts, prises sur tout leur texte. */
export function indexDes(textes: readonly TextePrompt[]): IndexDesPrompts;

/** Une phrase écrite comme l’écrit un build, pour le canari : chaque forme doit être retrouvée. */
export const ENCODAGES: {
  "texte brut": Encodage;
  "chaîne JSON": Encodage;
  "chaîne JavaScript en ASCII (\\uXXXX)": Encodage;
  "page HTML (entités, commentaires de React)": Encodage;
  "flux RSC dans une page (échappé deux fois)": Encodage;
  "flux RSC en ASCII dans une page (\\uXXXX échappé deux fois)": Encodage;
};

/** Le canari : les formes d’ENCODAGES sous lesquelles une phrase des prompts n’est pas retrouvée (vide : toutes le sont). */
export function canari(textes: readonly TextePrompt[], index?: IndexDesPrompts): string[];

/** Vérifie un build : renvoie ses problèmes (vide : rien ne fuit), et ce qui a été lu. */
export function verifier(dossierNext: string): { problemes: string[]; cibles: number; suites: number; prompts: number };
