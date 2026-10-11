/*
 * Les types de scripts/verifier-typo.mjs, pour tests/verifier-typo.test.ts : sans allowJs, tsc ne lit plus un .mjs.
 * Le script reste en JavaScript (node le lance par `npm run check`) ; ces déclarations changent avec lui.
 */

/** La règle des insécables vaut-elle pour ce fichier (src, sauf ce que le serveur n’écrit qu’à l’équipe, aux logs ou au modèle) ? */
export function regleDesInsecables(f: string): boolean;

/** Les problèmes de typographie d’un fichier source : `chemin:ligne · règle · extrait`. */
export function problemesDe(chemin: string, source: string, options?: { insecables?: boolean }): string[];

/** Vérifie des fichiers (par défaut : src, tests et prompts/lib) ; renvoie leurs problèmes, et combien ont été lus. */
export function verifier(fichiers?: readonly string[]): { problemes: string[]; lus: number };
