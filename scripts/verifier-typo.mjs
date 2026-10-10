#!/usr/bin/env node
/*
 * La typographie des textes, vérifiée par `npm run check` (AGENTS.md, « Conventions BLUSH »). Deux règles :
 * - dans les textes de l’interface (src, sauf le serveur : voir regleDesInsecables), une espace normale avant : ; ? ! »
 *   ou après « : il y faut l’insécable (NBSP, src/lib/format.ts), sinon le signe peut partir seul à la ligne ;
 * - dans src et tests, les caractères invisibles U+200E, U+200D et U+FEFF écrits en clair : une chaîne ou une regex
 *   semble vide, et un éditeur peut les effacer sans que personne le voie. On les écrit en échappement (\u200e…). Le
 *   U+200D qui lie deux emojis en un seul (😮‍💨) se voit : il reste permis.
 * Seuls les textes comptent pour la première règle (chaînes, gabarits, texte du JSX, lus avec le compilateur
 * TypeScript), jamais les commentaires ; dans le JSX, les morceaux d’une même phrase sont recollés comme à l’écran
 * (`{" "}:` compte). Les prompts (prompts/lib, sous-module) ne sont pas vérifiés ici : la session des prompts s’en charge.
 * `node scripts/verifier-typo.mjs [fichiers…]` : ces fichiers seulement (les tests du script).
 */
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSIONS = /\.(ts|tsx|mts|mjs)$/;
/* Généré depuis les prompts (scripts/prompts.mjs) : pas un texte de l’appli */
const GENERES = new Set(["src/server/ia/textes.generated.ts"]);
/** Les fichiers dispensés de la règle des insécables jusqu’à la PR qui les réécrit. */
export const EXCEPTIONS = new Map([["src/app/compte/CompteScreen.tsx", "réécrit par la PR 2.6 (se déconnecter), qui lève l’exception"]]);

/**
 * La règle des insécables vaut pour les textes de l’interface : tout src, sauf le serveur (src/server, src/app/api),
 * dont les textes sont des mails, des alertes à l’équipe et des entrées du modèle, que leurs tests lisent mot pour mot
 * (les mails y viendront, avec leurs tests). Ses images de partage (carte-*.tsx) en sont : elles s’affichent comme une page.
 */
export function regleDesInsecables(f) {
  if (!f.startsWith("src/") || EXCEPTIONS.has(f)) return false;
  return /^src\/server\/carte-[^/]+\.tsx$/.test(f) || !/^src\/(server|app\/api)\//.test(f);
}

const NBSP = "\u00a0";
/* Ce que le JSX affiche d’une expression qu’on ne sait pas lire : un mot, ni une espace ni un signe */
const OPAQUE = "\ufffc";
/* Le signe d’une phrase, pas celui du code (`:root`, `!important`, `!size-10`) : rien de collé après lui */
const AVANT = /(?<= )[:;?!»](?![\p{L}\p{N}_-])/gu;
const APRES = /«(?= )/g;
const INVISIBLES = /[\u200e\u200d\ufeff]/g;
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\ufe0f]/u;
const NOMS = { "\u200e": "U+200E", "\u200d": "U+200D", "\ufeff": "U+FEFF" };
const ENTITES = { nbsp: NBSP, laquo: "«", raquo: "»", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Le texte d’un JsxText tel que React l’affiche : les lignes recollées par une espace, leurs bords retirés, les entités lues. */
function texteJsx(brut) {
  const lignes = brut.split(/\r\n|\n|\r/);
  const derniere = lignes.findLastIndex((l) => /[^ \t]/.test(l));
  let texte = "";
  lignes.forEach((ligne, i) => {
    let l = ligne.replace(/\t/g, " ");
    if (i > 0) l = l.replace(/^ +/, "");
    if (i < lignes.length - 1) l = l.replace(/ +$/, "");
    if (l) texte += i === derniere ? l : `${l} `;
  });
  return texte.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (e, n) =>
    n[0] !== "#" ? (ENTITES[n.toLowerCase()] ?? e) : String.fromCodePoint(n[1] === "x" || n[1] === "X" ? parseInt(n.slice(2), 16) : +n.slice(1)),
  );
}

/** Ce qu’affiche un enfant {…} du JSX : une chaîne telle quelle, l’insécable partagée, rien pour un commentaire. */
function texteExpression(e) {
  if (!e.expression) return "";
  const x = e.expression;
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) return x.text;
  if (ts.isIdentifier(x) && x.text === "NBSP") return NBSP;
  return OPAQUE;
}

/* Le commentaire qui dispense une déclaration : une chaîne qui contient du code (le Worker de preparer-captures.ts) */
const MARQUE = /typo\s*:\s*du code/;

/**
 * Une chaîne qui n’est jamais affichée : un message de console.* ou d’une erreur (`new …Error(…)`), lu dans les logs ;
 * ou une déclaration marquée `typo: du code` dans le commentaire qui la précède.
 */
function horsDesTextes(n, source) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && ts.isIdentifier(p.expression.expression) && p.expression.expression.text === "console") return true;
    if (ts.isNewExpression(p) && ts.isIdentifier(p.expression) && p.expression.text.endsWith("Error")) return true;
    /* L’instruction qui contient la chaîne : le commentaire juste au-dessus d’elle peut la dispenser */
    if (p.parent && (ts.isSourceFile(p.parent) || ts.isBlock(p.parent))) return (ts.getLeadingCommentRanges(source, p.pos) ?? []).some((c) => MARQUE.test(source.slice(c.pos, c.end)));
  }
  return false;
}

/** Les problèmes de typographie d’un fichier source : `chemin:ligne · règle · extrait`. */
export function problemesDe(chemin, source, { insecables = true } = {}) {
  const problemes = [];
  const ligneDe = (pos) => source.slice(0, pos).split("\n").length;
  const extrait = (t, i) => JSON.stringify(t.slice(Math.max(0, i - 24), i + 24).replaceAll(NBSP, "⍽")).slice(1, -1);

  for (const m of source.matchAll(INVISIBLES)) {
    if (m[0] === "\u200d" && EMOJI.test(source.slice(m.index - 2, m.index)) && EMOJI.test(source.slice(m.index + 1, m.index + 3))) continue;
    problemes.push(`${chemin}:${ligneDe(m.index)} · ${NOMS[m[0]]} écrit en clair : l’écrire en échappement (\\u${m[0].codePointAt(0).toString(16).padStart(4, "0")})`);
  }
  if (!insecables) return problemes;

  const fichier = ts.createSourceFile(chemin, source, ts.ScriptTarget.Latest, true, chemin.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const signaler = (texte, debut, n) => {
    if (horsDesTextes(n, source)) return;
    for (const m of texte.matchAll(AVANT)) problemes.push(`${chemin}:${ligneDe(debut)} · espace normale avant « ${m[0]} » : « ${extrait(texte, m.index)} » (NBSP, src/lib/format.ts)`);
    for (const m of texte.matchAll(APRES)) problemes.push(`${chemin}:${ligneDe(debut)} · espace normale après « « » : « ${extrait(texte, m.index)} » (NBSP, src/lib/format.ts)`);
  };
  /* Les enfants d’un élément JSX forment une phrase : on la recolle, puis on la lit d’un bloc */
  const enfantsLus = new Set();
  const visiter = (n) => {
    if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
      let phrase = "";
      let debut = null;
      for (const c of n.children) {
        if (ts.isJsxText(c)) phrase += texteJsx(c.text);
        else if (ts.isJsxExpression(c)) {
          phrase += texteExpression(c);
          if (c.expression) enfantsLus.add(c.expression);
        } else phrase += OPAQUE;
        debut ??= c.getStart(fichier);
      }
      if (debut != null) signaler(phrase, debut, n);
    } else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !enfantsLus.has(n) && !ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent) && !ts.isExternalModuleReference(n.parent)) {
      signaler(n.text, n.getStart(fichier), n);
    } else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      signaler(n.text, n.getStart(fichier), n);
    }
    ts.forEachChild(n, visiter);
  };
  visiter(fichier);
  return problemes;
}

function* sources(dossier) {
  for (const f of readdirSync(join(RACINE, dossier), { recursive: true })) if (EXTENSIONS.test(f)) yield join(dossier, f).split(sep).join("/");
}

/** Vérifie des fichiers (par défaut : src et tests) ; renvoie leurs problèmes, et combien ont été lus. */
export function verifier(fichiers = [...sources("src"), ...sources("tests")]) {
  const lus = fichiers.map((f) => relative(RACINE, resolve(RACINE, f)).split(sep).join("/")).filter((f) => !GENERES.has(f));
  const problemes = lus.flatMap((f) => problemesDe(f, readFileSync(resolve(RACINE, f), "utf8"), { insecables: regleDesInsecables(f) }));
  return { problemes, lus: lus.length };
}

/* Lancé comme script (par `npm run check`, ou à la main), même par un lien symbolique : on compare les chemins réels */
const lanceCommeScript = () => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};
if (lanceCommeScript()) {
  const { problemes, lus } = verifier(process.argv.length > 2 ? process.argv.slice(2) : undefined);
  if (problemes.length) {
    console.error(`✗ Typographie (${problemes.length}) :\n${problemes.join("\n")}`);
    process.exit(1);
  }
  console.log(`✓ Typographie : ${lus} fichiers, ni espace normale avant : ; ? ! », ni caractère invisible en clair.`);
}
