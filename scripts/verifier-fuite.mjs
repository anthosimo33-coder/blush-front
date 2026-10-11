#!/usr/bin/env node
/*
 * Après le build : aucune phrase des prompts ne doit se trouver dans ce que reçoit le navigateur
 * (.next/static, et les pages et données prérendues). Sinon, le build échoue.
 * On cherche des suites de TAILLE mots, normalisées comme dans le garde-fou des réponses (src/server/ia/garde.ts) : la
 * ponctuation, la mise en forme Markdown, les balises et la casse ne comptent pas, et le contenu lu est d’abord décodé
 * (les échappements du JavaScript et du JSON, les entités HTML), sous toutes les formes que prend un texte dans un build.
 * Il échoue aussi quand la vérification ne vérifierait rien : pas de .next/static (pas de build), aucun fichier lu,
 * moins de MIN_PHRASES phrases tirées des prompts (un sous-module vide, des prompts réécrits autrement), ou un canari
 * (une phrase des prompts écrite comme l’écrirait un build) qu’elle ne retrouve pas.
 * `node scripts/verifier-fuite.mjs [dossier .next]` : un autre build que .next/ (les tests du script).
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FICHIERS } from "./fichiers-prompts.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Moins de phrases que ça : les prompts n’ont pas été lus comme il faut, la vérification ne prouverait rien. */
export const MIN_PHRASES = 20;
/**
 * La longueur des suites de mots cherchées. Le garde-fou des réponses en prend 8, mais l’appli partage avec les prompts
 * jusqu’à 9 mots d’affilée, qui n’ont rien de secret (un exemple de message, les noms des niveaux) : à 10 mots, aucun
 * texte de l’appli ne fait échouer le build, et plus de phrases des prompts sont cherchées qu’avec l’ancienne règle des
 * 70 caractères (785 contre 586 en octobre 2026).
 */
export const TAILLE = 10;

/* Les entités nommées qu’un build écrit (React n’échappe que & < > " ', les autres viennent d’un texte écrit à la main) */
const ENTITES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", hellip: "…", ndash: "–", mdash: "—" };
const point = (code) => {
  try {
    return String.fromCodePoint(code);
  } catch {
    return " ";
  }
};

/**
 * Le texte tel qu’on le lirait : les échappements du JavaScript et du JSON (’, \u{1F600}, \x27, \n, \") et les
 * entités HTML (&#x27;, &#39;, &amp;) décodés. Plusieurs passes : le flux RSC glissé dans une page est échappé deux fois.
 */
export function decoder(contenu) {
  let t = contenu;
  for (let passe = 0; passe < 3; passe++) {
    const avant = t;
    t = t
      .replace(/\\u\{([0-9a-f]{1,6})\}/gi, (_, h) => point(parseInt(h, 16)))
      .replace(/\\u([0-9a-f]{4})/gi, (_, h) => point(parseInt(h, 16)))
      .replace(/\\x([0-9a-f]{2})/gi, (_, h) => point(parseInt(h, 16)))
      .replace(/\\[nrt]/g, " ")
      .replace(/\\(["'`\\/])/g, "$1")
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => point(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => point(Number(d)))
      .replace(/&([a-z]+);/gi, (m, nom) => ENTITES[nom.toLowerCase()] ?? m);
    if (t === avant) break;
  }
  return t;
}

/**
 * Les mots d’un texte, comme les compare le garde-fou : en minuscules, les apostrophes droites, tout ce qui n’est ni
 * lettre, ni chiffre, ni apostrophe compte pour une espace. Les commentaires et les balises HTML d’abord retirés (React
 * glisse `<!-- -->` entre deux morceaux d’un texte, et une phrase mise en forme a ses `<strong>`), des deux côtés.
 */
export function mots(texte) {
  return texte
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>/gi, " ")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .split(" ")
    /* Une apostrophe au bord d’un mot est un guillemet (une chaîne 'entre apostrophes' du JavaScript) */
    .map((m) => m.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

/** Les suites de TAILLE mots d’une liste de mots. */
function* suites(liste) {
  for (let i = 0; i + TAILLE <= liste.length; i++) yield liste.slice(i, i + TAILLE).join(" ");
}

/** Les phrases des prompts copiés côté serveur (scripts/prompts.mjs) assez longues pour donner une suite de TAILLE mots, telles qu’écrites. */
export function phrasesDesPrompts() {
  return Object.values(FICHIERS).flatMap((f) =>
    readFileSync(join(RACINE, "prompts", f), "utf8")
      .split(/\n|(?<=[.!?])\s/)
      .map((l) => l.trim())
      .filter((l) => mots(l).length >= TAILLE),
  );
}

/** L’index des suites de mots des phrases : chaque suite renvoie à la première phrase qui la contient (son rang). */
function indexDes(phrases) {
  const index = new Map();
  phrases.forEach((ph, k) => {
    for (const s of suites(mots(ph))) if (!index.has(s)) index.set(s, k);
  });
  return index;
}

/** Le rang de la première phrase des prompts dont une suite de mots est dans le contenu (décodé), ou -1. */
function chercher(contenu, index) {
  let rang = -1;
  for (const s of suites(mots(decoder(contenu)))) {
    const k = index.get(s);
    if (k !== undefined && (rang < 0 || k < rang)) rang = k;
  }
  return rang;
}

/** Une phrase écrite comme l’écrit un build, pour le canari : chaque forme doit être retrouvée. */
export const ENCODAGES = {
  "texte brut": (ph) => ph,
  "chaîne JSON": (ph) => JSON.stringify(ph),
  "chaîne JavaScript en ASCII (\\uXXXX)": (ph) => JSON.stringify(ph).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`),
  "page HTML (entités, commentaires de React)": (ph) =>
    `<p>${ph
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/ /, " <!-- -->")}</p>`,
  "flux RSC dans une page (échappé deux fois)": (ph) => `<script>self.__next_f.push([1,${JSON.stringify(`0:["$","p",null,{"children":${JSON.stringify(ph)}}]`)}])</script>`,
};

/**
 * Le canari : une phrase des prompts écrite sous chaque forme d’ENCODAGES doit être retrouvée. Renvoie les formes
 * manquées (vide : la vérification verrait une fuite sous chacune).
 */
export function canari(phrases, index = indexDes(phrases)) {
  /* Une phrase longue, avec ce qu’un build échappe (une apostrophe, un guillemet, un accent) quand il y en a une */
  const longues = phrases.filter((ph) => mots(ph).length >= TAILLE + 4);
  const phrase = longues.find((ph) => /['’"&<>]/.test(ph) && /[^\x00-\x7f]/.test(ph)) ?? longues[0] ?? phrases[0];
  return Object.entries(ENCODAGES)
    .filter(([, encoder]) => chercher(`/* canari */ ${encoder(phrase)}`, index) < 0)
    .map(([forme]) => forme);
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
  const index = indexDes(phrases);
  const manquees = canari(phrases, index);
  if (manquees.length) return { problemes: [`le canari n’est pas retrouvé (${manquees.join(", ")}) : la vérification ne verrait pas une fuite écrite ainsi`], cibles: 0, phrases: phrases.length };
  const cibles = [...fichiers(join(dossierNext, "static"), (p) => /\.(js|css|json|txt|html)$/.test(p)), ...fichiers(join(dossierNext, "server/app"), (p) => /\.(html|rsc|body|meta)$/.test(p))];
  if (!cibles.length) return { problemes: [`aucun fichier envoyé au navigateur dans ${dossierNext} : rien n’a été vérifié`], cibles: 0, phrases: phrases.length };
  const problemes = [];
  for (const f of cibles) {
    const rang = chercher(readFileSync(f, "utf8"), index);
    /* Le numéro de la phrase, jamais son texte : les logs de la CI sont publics (phrasesDesPrompts()[n - 1] la retrouve en local) */
    if (rang >= 0) problemes.push(`fuite des prompts : ${f.slice(dossierNext.length + 1)} (phrase n° ${rang + 1} sur ${phrases.length})`);
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
  console.log(`✓ Aucune phrase des prompts dans ${cibles} fichiers envoyés au navigateur (${phrases} phrases cherchées, par suites de ${TAILLE} mots, canari retrouvé).`);
}
