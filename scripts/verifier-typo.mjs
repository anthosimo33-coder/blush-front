#!/usr/bin/env node
/*
 * La typographie des textes, vérifiée par `npm run check` (AGENTS.md, « Conventions BLUSH »). Trois règles :
 * - dans les textes que quelqu’un lit (l’appli, ses images de partage et ses mails : voir regleDesInsecables), une espace
 *   normale avant : ; ? ! » ou après « : il y faut l’insécable, sinon le signe peut partir seul à la ligne ;
 * - dans ces mêmes fichiers, l’insécable s’écrit d’une seule façon : `{NBSP}` (src/lib/format.ts) entre deux morceaux
 *   du JSX, ` ` dans une chaîne ou un gabarit. Ni `&nbsp;` ou `{" "}` dans le JSX, ni `${NBSP}` dans un
 *   gabarit, ni une constante d’espace à soi : celles d’AdminScreen et de Partage contenaient une espace normale ;
 * - dans src, tests et prompts/lib, les caractères invisibles écrits en clair : l’insécable U+00A0 (à l’œil, une espace normale),
 *   U+200E, U+200D et U+FEFF. Une chaîne ou une regex semble vide ou juste, et un éditeur peut les effacer ou les
 *   changer sans que personne le voie. On les écrit en échappement (‎…). Le U+200D qui lie deux emojis en un seul
 *   (😮‍💨) se voit : il reste permis.
 * Seuls les textes comptent pour les deux premières règles (chaînes, gabarits, texte du JSX, lus avec le compilateur
 * TypeScript), jamais les commentaires ; dans le JSX, les morceaux d’une même phrase sont recollés comme à l’écran,
 * éléments imbriqués compris (`{" "}:` et `Une question <b>?</b>` comptent). Le code des prompts (prompts/lib,
 * sous-module) n’est vérifié que pour la troisième : ses regex (style.ts, conv.ts) en ont perdu en silence.
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
/*
 * Les fichiers du serveur dont les textes ne s’affichent ni dans l’appli ni dans un mail : le rapport de la veille à
 * l’équipe (alertes.ts), ce que lit et écrit le modèle (ia/, modèle factice compris ; chat.ts et analyse.ts, qui lui
 * écrivent, la demande du chat telle qu’on l’a testée sur les évals) et env.ts, dont les messages vont aux logs. Les
 * alertes envoyées d’ailleurs (`alerter(…)`) se reconnaissent à l’appel (horsDesTextes).
 */
const HORS_DES_TEXTES = /^src\/server\/(alertes\.ts|analyse\.ts|chat\.ts|env\.ts|ia\/)/;

/**
 * La règle des insécables vaut pour tout ce que quelqu’un lit : src, l’appli, ses images de partage (carte-*.tsx), ses
 * mails (mail-*.ts) et les textes que le serveur lui envoie (le prochain pas, l’historique du chat…), sauf les fichiers
 * du serveur qui n’écrivent qu’à l’équipe, aux logs ou au modèle (HORS_DES_TEXTES).
 */
export function regleDesInsecables(f) {
  return f.startsWith("src/") && !HORS_DES_TEXTES.test(f);
}

const NBSP = " ";
/* Ce que le JSX affiche d’une expression qu’on ne sait pas lire : un mot, ni une espace ni un signe */
const OPAQUE = "￼";
/* Le signe d’une phrase, pas celui du code (`:root`, `!important`, `!size-10`) : rien de collé après lui */
const AVANT = /(?<= )[:;?!»](?![\p{L}\p{N}_-])/gu;
const APRES = /«(?= )/g;
const INVISIBLES = /[ ‎‍﻿]/g;
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}️]/u;
const NOMS = { " ": "U+00A0", "‎": "U+200E", "‍": "U+200D", "﻿": "U+FEFF" };
const ENTITES = { nbsp: NBSP, laquo: "«", raquo: "»", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
/* L’insécable écrite en entité dans le texte du JSX */
const ENTITE_NBSP = /&(nbsp|#160|#xa0);/i;

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

/** Une chaîne écrite telle quelle (pas un gabarit avec des `${…}`), ou null. */
const chaine = (x) => (x && (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) ? x.text : null);

/** Ce qu’affiche un enfant {…} du JSX : une chaîne telle quelle, l’insécable partagée, rien pour un commentaire. */
function texteExpression(e) {
  if (!e.expression) return "";
  const x = e.expression;
  if (chaine(x) != null) return x.text;
  if (ts.isIdentifier(x) && x.text === "NBSP") return NBSP;
  return OPAQUE;
}

/* Le commentaire qui dispense une déclaration : une chaîne qui contient du code (le Worker de preparer-captures.ts) */
const MARQUE = /typo\s*:\s*du code/;

/**
 * Une chaîne qui n’est jamais affichée : un message de console.*, d’une erreur (`new …Error(…)`) ou d’une alerte à
 * l’équipe (`alerter(…)`), lu dans les logs ou par l’équipe ; ou une déclaration marquée `typo: du code` dans le
 * commentaire qui la précède.
 */
function horsDesTextes(n, source) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && ts.isIdentifier(p.expression.expression) && p.expression.expression.text === "console") return true;
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === "alerter") return true;
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
    if (m[0] === "‍" && EMOJI.test(source.slice(m.index - 2, m.index)) && EMOJI.test(source.slice(m.index + 1, m.index + 3))) continue;
    const ecrire = m[0] === NBSP ? "l’écrire {NBSP} dans le JSX, \\u00a0 dans une chaîne" : `l’écrire en échappement (\\u${m[0].codePointAt(0).toString(16).padStart(4, "0")})`;
    problemes.push(`${chemin}:${ligneDe(m.index)} · ${NOMS[m[0]]} écrit en clair : ${ecrire}`);
  }
  if (!insecables) return problemes;

  const fichier = ts.createSourceFile(chemin, source, ts.ScriptTarget.Latest, true, chemin.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const forme = (n, quoi) => problemes.push(`${chemin}:${ligneDe(n.getStart(fichier))} · ${quoi}`);
  /** `posDe(i)` : où commence, dans la source, le morceau du texte qui contient son caractère i. */
  const signaler = (texte, n, posDe) => {
    if (horsDesTextes(n, source)) return;
    for (const m of texte.matchAll(AVANT)) problemes.push(`${chemin}:${ligneDe(posDe(m.index))} · espace normale avant « ${m[0]} » : « ${extrait(texte, m.index)} » (NBSP, src/lib/format.ts)`);
    for (const m of texte.matchAll(APRES)) problemes.push(`${chemin}:${ligneDe(posDe(m.index))} · espace normale après « « » : « ${extrait(texte, m.index)} » (NBSP, src/lib/format.ts)`);
  };
  /* Les enfants d’un élément JSX forment une phrase, ses éléments imbriqués compris : on la recolle, puis on la lit d’un
     bloc. Chaque morceau garde son nœud, pour dire la ligne du signe ; un morceau déjà lu ne se relit pas seul. */
  const lus = new Set();
  const morceauxDe = (n) =>
    n.children.flatMap((c) => {
      if (ts.isJsxText(c)) return [[texteJsx(c.text), c]];
      if (ts.isJsxExpression(c)) {
        if (c.expression) lus.add(c.expression);
        return [[texteExpression(c), c]];
      }
      if (ts.isJsxElement(c) || ts.isJsxFragment(c)) {
        lus.add(c);
        return morceauxDe(c);
      }
      return [[OPAQUE, c]];
    });
  const visiter = (n) => {
    /* La forme de l’insécable */
    if (ts.isJsxText(n) && ENTITE_NBSP.test(n.text)) forme(n, "`&nbsp;` dans le JSX : écrire {NBSP} (src/lib/format.ts)");
    if (ts.isJsxExpression(n) && n.parent && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent)) && chaine(n.expression) === NBSP) forme(n, '`{"\\u00a0"}` dans le JSX : écrire {NBSP} (src/lib/format.ts)');
    if (ts.isTemplateSpan(n) && ((ts.isIdentifier(n.expression) && n.expression.text === "NBSP") || chaine(n.expression) === NBSP)) forme(n.expression, "l’insécable d’un gabarit s’écrit \\u00a0 dans son texte, ni `${NBSP}` ni `${\"\\u00a0\"}`");
    if (ts.isVariableDeclaration(n) && /^[  ]$/.test(chaine(n.initializer) ?? "") && chemin !== "src/lib/format.ts") forme(n, "une constante d’espace : importer NBSP de src/lib/format.ts (une copie peut contenir une espace normale)");

    if ((ts.isJsxElement(n) || ts.isJsxFragment(n)) && !lus.has(n)) {
      const morceaux = morceauxDe(n);
      const phrase = morceaux.map(([t]) => t).join("");
      const posDe = (i) => {
        let fin = 0;
        for (const [t, c] of morceaux) if (i < (fin += t.length)) return c.getStart(fichier);
        return n.getStart(fichier);
      };
      if (morceaux.length) signaler(phrase, n, posDe);
    } else if (chaine(n) != null && !lus.has(n) && !ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent) && !ts.isExternalModuleReference(n.parent)) {
      signaler(n.text, n, () => n.getStart(fichier));
    } else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      signaler(n.text, n, () => n.getStart(fichier));
    }
    ts.forEachChild(n, visiter);
  };
  visiter(fichier);
  return problemes;
}

function* sources(dossier) {
  for (const f of readdirSync(join(RACINE, dossier), { recursive: true })) if (EXTENSIONS.test(f)) yield join(dossier, f).split(sep).join("/");
}

/** Vérifie des fichiers (par défaut : src, tests et prompts/lib) ; renvoie leurs problèmes, et combien ont été lus. */
export function verifier(fichiers = [...sources("src"), ...sources("tests"), ...sources("prompts/lib")]) {
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
  console.log(`✓ Typographie : ${lus} fichiers, ni espace normale avant : ; ? ! », ni insécable mal écrite, ni caractère invisible en clair.`);
}
