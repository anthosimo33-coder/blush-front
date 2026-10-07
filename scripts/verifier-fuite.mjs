#!/usr/bin/env node
/**
 * Après le build : aucune phrase des prompts ne doit se trouver dans ce que reçoit le navigateur
 * (.next/static, et les pages et données prérendues). Sinon, le build échoue.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROMPTS = ["00-socle.md", "04-verdict.md", "05-rapport.md", "07-memoire.md", "10-chat.md"];

/* Des phrases assez longues pour n’appartenir qu’aux prompts */
const phrases = PROMPTS.flatMap((f) =>
  readFileSync(join(RACINE, "prompts", f), "utf8")
    .split(/\n|(?<=[.!?])\s/)
    .map((l) => l.replace(/[*`#>|-]/g, "").trim())
    .filter((l) => l.length >= 70),
);

function* fichiers(dossier, filtre) {
  let entrees = [];
  try {
    entrees = readdirSync(dossier);
  } catch {
    return;
  }
  for (const e of entrees) {
    const p = join(dossier, e);
    if (statSync(p).isDirectory()) yield* fichiers(p, filtre);
    else if (filtre(p)) yield p;
  }
}

const cibles = [...fichiers(join(RACINE, ".next/static"), (p) => /\.(js|css|json|txt|html)$/.test(p)), ...fichiers(join(RACINE, ".next/server/app"), (p) => /\.(html|rsc|body|meta)$/.test(p))];
const fuites = [];
for (const f of cibles) {
  const contenu = readFileSync(f, "utf8");
  const trouvee = phrases.find((ph) => contenu.includes(ph) || contenu.includes(JSON.stringify(ph).slice(1, -1)));
  if (trouvee) fuites.push(`${f.slice(RACINE.length + 1)} : « ${trouvee.slice(0, 60)}… »`);
}
if (fuites.length) {
  console.error(`✗ Fuite des prompts dans ce que reçoit le navigateur :\n${fuites.join("\n")}`);
  process.exit(1);
}
console.log(`✓ Aucune phrase des prompts dans ${cibles.length} fichiers envoyés au navigateur (${phrases.length} phrases cherchées).`);
