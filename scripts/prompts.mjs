#!/usr/bin/env node
/**
 * Copie les prompts (sous-module prompts/) dans un module serveur, src/server/ia/textes.generated.ts.
 * Il n’est importé que derrière `import "server-only"` : les prompts ne partent jamais vers le navigateur
 * (scripts/verifier-fuite.mjs le contrôle après chaque build). Le fichier généré n’est pas commité.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = join(RACINE, "prompts");
import { FICHIERS } from "./fichiers-prompts.mjs";

if (!existsSync(join(DOSSIER, FICHIERS.socle))) {
  console.error("prompts/ est vide : lance `git submodule update --init` (le dépôt privé blush-prompts).");
  process.exit(1);
}
const textes = Object.fromEntries(Object.entries(FICHIERS).map(([cle, f]) => [cle, readFileSync(join(DOSSIER, f), "utf8")]));
const sortie = [
  "// Généré par scripts/prompts.mjs depuis le sous-module prompts/ : ne pas modifier, ne pas commiter.",
  'import "server-only";',
  "",
  `export const TEXTES = ${JSON.stringify(textes, null, 2)} as const;`,
  "",
].join("\n");
const chemin = join(RACINE, "src/server/ia/textes.generated.ts");
if (!existsSync(chemin) || readFileSync(chemin, "utf8") !== sortie) writeFileSync(chemin, sortie);
console.log(`prompts : ${Object.keys(textes).length} textes prêts`);
