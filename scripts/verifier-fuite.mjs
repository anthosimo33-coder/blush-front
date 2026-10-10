#!/usr/bin/env node
/*
 * Après le build : aucune phrase des prompts ne doit se trouver dans ce que reçoit le navigateur
 * (.next/static, et les pages et données prérendues). Sinon, le build échoue.
 * Il échoue aussi quand la vérification ne vérifierait rien : pas de .next/static (pas de build), aucun fichier lu, ou
 * moins de MIN_PHRASES phrases tirées des prompts (un sous-module vide, des prompts réécrits autrement).
 * `node scripts/verifier-fuite.mjs [dossier .next]` : un autre build que .next/ (les tests du script).
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FICHIERS } from "./fichiers-prompts.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Moins de phrases que ça : les prompts n’ont pas été lus comme il faut, la vérification ne prouverait rien. */
export const MIN_PHRASES = 20;

/** Les phrases des prompts copiés côté serveur (scripts/prompts.mjs), assez longues pour n’appartenir qu’à eux. */
export function phrasesDesPrompts() {
  return Object.values(FICHIERS).flatMap((f) =>
    readFileSync(join(RACINE, "prompts", f), "utf8")
      .split(/\n|(?<=[.!?])\s/)
      .map((l) => l.replace(/[*`#>|-]/g, "").trim())
      .filter((l) => l.length >= 70),
  );
}

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

/** Vérifie un build : renvoie ses problèmes (vide : rien ne fuit), et ce qui a été lu. */
export function verifier(dossierNext) {
  const phrases = phrasesDesPrompts();
  if (!existsSync(join(dossierNext, "static"))) return { problemes: [`${join(dossierNext, "static")} manque : pas de build à vérifier`], cibles: 0, phrases: phrases.length };
  if (phrases.length < MIN_PHRASES) return { problemes: [`${phrases.length} phrases tirées des prompts (${MIN_PHRASES} au moins) : prompts/ est-il bien là ?`], cibles: 0, phrases: phrases.length };
  const cibles = [...fichiers(join(dossierNext, "static"), (p) => /\.(js|css|json|txt|html)$/.test(p)), ...fichiers(join(dossierNext, "server/app"), (p) => /\.(html|rsc|body|meta)$/.test(p))];
  if (!cibles.length) return { problemes: [`aucun fichier envoyé au navigateur dans ${dossierNext} : rien n’a été vérifié`], cibles: 0, phrases: phrases.length };
  const problemes = [];
  for (const f of cibles) {
    const contenu = readFileSync(f, "utf8");
    const i = phrases.findIndex((ph) => contenu.includes(ph) || contenu.includes(JSON.stringify(ph).slice(1, -1)));
    /* Le numéro de la phrase, jamais son texte : les logs de la CI sont publics (phrasesDesPrompts()[n - 1] la retrouve en local) */
    if (i >= 0) problemes.push(`fuite des prompts : ${f.slice(dossierNext.length + 1)} (phrase n° ${i + 1} sur ${phrases.length})`);
  }
  return { problemes, cibles: cibles.length, phrases: phrases.length };
}

/* Lancé comme script (après `next build`, ou à la main), même par un lien symbolique : on compare les chemins réels */
const lanceCommeScript = () => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};
if (lanceCommeScript()) {
  const dossierNext = resolve(process.argv[2] ?? join(RACINE, ".next"));
  const { problemes, cibles, phrases } = verifier(dossierNext);
  if (problemes.length) {
    console.error(`✗ Vérification des prompts dans ce que reçoit le navigateur :\n${problemes.join("\n")}`);
    process.exit(1);
  }
  console.log(`✓ Aucune phrase des prompts dans ${cibles} fichiers envoyés au navigateur (${phrases} phrases cherchées).`);
}
