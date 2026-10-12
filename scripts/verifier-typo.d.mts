/*
 * Les types de scripts/verifier-typo.mjs, pour tests/verifier-typo.test.ts : sans allowJs, tsc ne lit plus un .mjs.
 * Le script reste en JavaScript (node le lance par `npm run check`) ; ces déclarations changent avec lui.
 * tests/unit/declarations-scripts.test.ts vérifie que les deux exportent les mêmes noms, les fonctions en
 * fonctions ; les signatures, elles, se relisent à la main.
 */

/** La règle des insécables vaut-elle pour ce fichier (src, sauf ce que le serveur n’écrit qu’à l’équipe, aux logs ou au modèle) ? */
export function regleDesInsecables(f: string): boolean;

/** Les problèmes de typographie d’un fichier source : `chemin:ligne · règle · extrait`. */
export function problemesDe(chemin: string, source: string, options?: { insecables?: boolean }): string[];

/** Les fichiers vérifiés par défaut : src, tests, scripts (ce script compris), prompts/lib et les configurations de la racine. */
export function aVerifier(): string[];

/** Vérifie des fichiers (par défaut : aVerifier()) ; renvoie leurs problèmes, et combien ont été lus. */
export function verifier(fichiers?: readonly string[]): { problemes: string[]; lus: number };
