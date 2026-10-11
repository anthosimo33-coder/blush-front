#!/usr/bin/env node
/*
 * Après le build : aucun passage des prompts ne doit se trouver dans ce que reçoit le navigateur (.next/static, et les
 * pages et données prérendues). Sinon, le build échoue.
 * On cherche des suites de TAILLE mots, prises sur tout le texte de chaque prompt (elles traversent les phrases et les
 * lignes : une liste de règles courtes est cherchée comme un paragraphe), et normalisées comme dans le garde-fou des
 * réponses (src/server/ia/garde.ts) : la ponctuation, la mise en forme Markdown et la casse ne comptent pas. Ici, en
 * plus, les balises HTML et les commentaires de React sont retirés, et le contenu lu est d’abord décodé (les
 * échappements du JavaScript et du JSON, les entités HTML), sous toutes les formes que prend un texte dans un build.
 * Il échoue aussi quand la vérification ne vérifierait rien : pas de .next/static (pas de build), aucun fichier lu,
 * moins de MIN_SUITES suites tirées des prompts (un sous-module vide, des prompts réécrits autrement), ou un canari
 * (une phrase des prompts écrite comme l’écrirait un build) qu’elle ne retrouve pas.
 * `node scripts/verifier-fuite.mjs [dossier .next]` : un autre build que .next/ (les tests du script).
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FICHIERS } from "./fichiers-prompts.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Moins de suites que ça : les prompts n’ont pas été lus comme il faut, la vérification ne prouverait rien. */
export const MIN_SUITES = 1000;
/**
 * La longueur des suites de mots cherchées. Le garde-fou des réponses en prend 8, mais l’appli partage avec les prompts
 * jusqu’à 9 mots d’affilée, qui n’ont rien de secret (un exemple de message, les noms des niveaux) : à 10 mots, aucun
 * texte de l’appli ne fait échouer le build (vérifié sur le build d’octobre 2026 : des suites communes à 8 et 9 mots
 * seulement, dans un chunk et dans la page du guide de style).
 */
export const TAILLE = 10;

/* Les entités nommées qu’un build écrit (React n’échappe que & < > " ', les autres viennent d’un texte écrit à la main) */
const ENTITES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  ndash: "–",
  mdash: "—",
};
const point = (code) => {
  try {
    return String.fromCodePoint(code);
  } catch {
    return " ";
  }
};

/* Un échappement du JavaScript ou du JSON, lu de gauche à droite : `\\` est un antislash, jamais le début du suivant */
const ECHAPPEMENT = /\\(?:u\{([0-9a-f]{1,6})\}|u([0-9a-f]{4})|x([0-9a-f]{2})|([nrt])|(["'`\\/]))/gi;

/**
 * Le texte tel qu’on le lirait : les échappements du JavaScript et du JSON (\u2019, \u{1F600}, \x27, \n, \") et les
 * entités HTML (&#x27;, &#39;, &amp;) décodés. Chaque passe enlève exactement un niveau, et il y en a plusieurs : le
 * flux RSC glissé dans une page est échappé deux fois.
 */
export function decoder(contenu) {
  let t = contenu;
  for (let passe = 0; passe < 3; passe++) {
    const avant = t;
    t = t
      .replace(ECHAPPEMENT, (_, accolades, u, x, blanc, litteral) => litteral ?? (blanc ? " " : point(parseInt(accolades ?? u ?? x, 16))))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => point(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => point(Number(d)))
      .replace(/&([a-z]+);/gi, (m, nom) => ENTITES[nom.toLowerCase()] ?? m);
    if (t === avant) break;
  }
  return t;
}

/*
 * Une balise HTML, écrite comme en écrit un navigateur ou React : un nom, puis des attributs (nom, et valeur entre
 * guillemets ou sans espace) séparés par des espaces, jusqu’au `>`. Pas plus large : dans un JavaScript minifié,
 * `"u"<typeof window?…=>` ressemblerait sinon à une balise, et effacerait le code (et une fuite) jusqu’au `>` d’une flèche.
 */
const BALISE = /<\/?[a-z][a-z0-9-]*(?:\s+[a-z_:@][\w:.-]*(?:\s*=\s*(?:"[^"<>]*"|'[^'<>]*'|[^\s"'<>=`]+))?)*\s*\/?>/gi;

/**
 * Les mots d’un texte, comme les compare le garde-fou : en minuscules, les apostrophes droites, tout ce qui n’est ni
 * lettre, ni chiffre, ni apostrophe compte pour une espace. Les commentaires et les balises HTML d’abord retirés (React
 * glisse `<!-- -->` entre deux morceaux d’un texte, et une phrase mise en forme a ses `<strong>`), des deux côtés.
 */
export function mots(texte) {
  return (
    texte
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(BALISE, " ")
      .toLowerCase()
      .normalize("NFC")
      .replace(/[’‘]/g, "'")
      .replace(/[^\p{L}\p{N}']+/gu, " ")
      .split(" ")
      /* Une apostrophe au bord d’un mot est un guillemet (une chaîne 'entre apostrophes' du JavaScript) */
      .map((m) => m.replace(/^'+|'+$/g, ""))
      .filter(Boolean)
  );
}

/** Les suites de TAILLE mots d’une liste de mots, avec la place de leur premier mot. */
function* suites(liste) {
  for (let i = 0; i + TAILLE <= liste.length; i++) yield [liste.slice(i, i + TAILLE).join(" "), i];
}

/** Les prompts copiés côté serveur (scripts/prompts.mjs), tels qu’écrits : leur nom de fichier, et leur texte. */
export function textesDesPrompts() {
  return Object.values(FICHIERS).map((f) => ({ fichier: f, texte: readFileSync(join(RACINE, "prompts", f), "utf8") }));
}

/** Les phrases des prompts d’au moins TAILLE mots, telles qu’écrites : de quoi choisir le canari (et des fuites, pour les tests). */
export function phrasesDesPrompts(textes = textesDesPrompts()) {
  return textes.flatMap(({ texte }) =>
    texte
      .split(/\n|(?<=[.!?])\s/)
      .map((l) => l.trim())
      .filter((l) => mots(l).length >= TAILLE),
  );
}

/**
 * L’index des suites de mots des prompts, prises sur tout leur texte : chaque suite renvoie à sa première place (le
 * rang du prompt, celui de son premier mot).
 */
export function indexDes(textes) {
  const index = new Map();
  textes.forEach(({ texte }, k) => {
    for (const [s, n] of suites(mots(texte))) if (!index.has(s)) index.set(s, { k, n });
  });
  return index;
}

/** La première place dans les prompts d’une suite de mots du contenu (décodé), ou null. */
function chercher(contenu, index) {
  let place = null;
  for (const [s] of suites(mots(decoder(contenu)))) {
    const p = index.get(s);
    if (p && (!place || p.k < place.k || (p.k === place.k && p.n < place.n))) place = p;
  }
  return place;
}

/* Une chaîne JSON dont tout ce qui n’est pas ASCII est en \uXXXX, comme l’écrit un bundler */
const enAscii = (ph) => JSON.stringify(ph).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
/* Une ligne du flux RSC qui porte la phrase dans un paragraphe */
const ligneRsc = (chaine) => `0:["$","p",null,{"children":${chaine}}]`;

/** Une phrase écrite comme l’écrit un build, pour le canari : chaque forme doit être retrouvée. */
export const ENCODAGES = {
  "texte brut": (ph) => ph,
  "chaîne JSON": (ph) => JSON.stringify(ph),
  "chaîne JavaScript en ASCII (\\uXXXX)": enAscii,
  "page HTML (entités, commentaires de React)": (ph) =>
    `<p>${ph.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/ /, " <!-- -->")}</p>`,
  "flux RSC dans une page (échappé deux fois)": (ph) => `<script>self.__next_f.push([1,${JSON.stringify(ligneRsc(JSON.stringify(ph)))}])</script>`,
  "flux RSC en ASCII dans une page (\\uXXXX échappé deux fois)": (ph) => `<script>self.__next_f.push([1,${JSON.stringify(ligneRsc(enAscii(ph)))}])</script>`,
};

/**
 * Le canari : une phrase des prompts écrite sous chaque forme d’ENCODAGES doit être retrouvée. Renvoie les formes
 * manquées (vide : la vérification verrait une fuite sous chacune).
 */
export function canari(textes, index = indexDes(textes)) {
  /* Une phrase longue, avec ce qu’un build échappe (une apostrophe, un guillemet, un accent) quand il y en a une */
  const phrases = phrasesDesPrompts(textes);
  const longues = phrases.filter((ph) => mots(ph).length >= TAILLE + 4);
  const phrase = longues.find((ph) => /['’"&<>]/.test(ph) && /[^\x00-\x7f]/.test(ph)) ?? longues[0] ?? phrases[0] ?? "";
  return Object.entries(ENCODAGES)
    .filter(([, encoder]) => !chercher(`/* canari */ ${encoder(phrase)}`, index))
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
  const textes = textesDesPrompts();
  const index = indexDes(textes);
  const lu = { cibles: 0, suites: index.size, prompts: textes.length };
  if (!existsSync(join(dossierNext, "static"))) return { problemes: [`${join(dossierNext, "static")} manque : pas de build à vérifier`], ...lu };
  if (index.size < MIN_SUITES) return { problemes: [`${index.size} suites de ${TAILLE} mots tirées des prompts (${MIN_SUITES} au moins) : prompts/ est-il bien là ?`], ...lu };
  const manquees = canari(textes, index);
  if (manquees.length) return { problemes: [`le canari n’est pas retrouvé (${manquees.join(", ")}) : la vérification ne verrait pas une fuite écrite ainsi`], ...lu };
  const cibles = [
    ...fichiers(join(dossierNext, "static"), (p) => /\.(js|css|json|txt|html)$/.test(p)),
    ...fichiers(join(dossierNext, "server/app"), (p) => /\.(html|rsc|body|meta)$/.test(p)),
  ];
  if (!cibles.length) return { problemes: [`aucun fichier envoyé au navigateur dans ${dossierNext} : rien n’a été vérifié`], ...lu };
  const problemes = [];
  for (const f of cibles) {
    const place = chercher(readFileSync(f, "utf8"), index);
    /* Le prompt et la place du premier mot, jamais le texte : les logs de la CI sont publics (mots(texte).slice(n) le retrouve en local) */
    if (place) problemes.push(`fuite des prompts : ${f.slice(dossierNext.length + 1)} (prompts/${textes[place.k].fichier}, mot n° ${place.n + 1})`);
  }
  return { problemes, ...lu, cibles: cibles.length };
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
  const { problemes, cibles, suites: nbSuites, prompts } = verifier(dossierNext);
  if (problemes.length) {
    console.error(`✗ Vérification des prompts dans ce que reçoit le navigateur :\n${problemes.join("\n")}`);
    process.exit(1);
  }
  console.log(
    `✓ Aucune phrase des prompts dans ${cibles} fichiers envoyés au navigateur (${nbSuites} suites de ${TAILLE} mots cherchées, sur tout le texte des ${prompts} prompts, canari retrouvé).`,
  );
}
