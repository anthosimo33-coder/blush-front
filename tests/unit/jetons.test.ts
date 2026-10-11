import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Les tokens du design system (src/app/globals.css, Q59) : une couleur de l’appli vient d’un token, et un token cité par
 * le code existe. Tailwind ne dit rien d’une classe inconnue (`text-danger-vif` après le retrait du token) : elle ne
 * génère simplement aucune règle, et le texte perd sa couleur sans que rien n’échoue. Ces tests le disent à sa place.
 */

const RACINE = join(__dirname, "../..");
const CSS = readFileSync(join(RACINE, "src/app/globals.css"), "utf8");

/** Les fichiers .ts et .tsx d’un dossier de src, en chemins depuis la racine. */
const fichiersDe = (dossier: string) =>
  readdirSync(join(RACINE, dossier), { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) =>
      relative(RACINE, join(RACINE, dossier, f))
        .split(sep)
        .join("/"),
    );
const SRC = fichiersDe("src");
const lire = (f: string) => readFileSync(join(RACINE, f), "utf8");

/** Les variables déclarées dans globals.css (:root et @theme). */
const DECLAREES = new Set([...CSS.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
/** Les couleurs du thème : la partie après --color- (« danger », « toi-ink »). */
const COULEURS = new Set([...DECLAREES].filter((v) => v?.startsWith("--color-")).map((v) => v?.slice("--color-".length)));
/** Les couleurs de Tailwind qu’on écrit sans token à nous. */
const DE_TAILWIND = new Set(["white", "black", "transparent", "current", "inherit"]);

/* Une classe de couleur qui nomme une couleur à nous : un préfixe de couleur, puis l’un de nos noms (et sa suite) */
const RACINES = [
  "paper",
  "plaque",
  "line",
  "ink",
  "soft",
  "grey",
  "muted",
  "pale",
  "toi",
  "elle",
  "vrai",
  "flou",
  "attente",
  "danger",
  "ok",
  "disabled",
  "track",
  "sep",
  "skeleton",
  "segment",
  "bubble",
];
const CLASSE_DE_COULEUR = new RegExp(
  `(?<![\\w-])(?:bg|text|border|fill|stroke|ring|outline|decoration|from|to|via|caret|accent|divide)-((?:${RACINES.join("|")})(?:-[a-z]+)*)(?=[\\s"'\`/\\]:)}]|$)`,
  "g",
);

describe("les tokens de couleur", () => {
  it("globals.css se lit : les couleurs de sens et le rouge des soucis sont là (le test ne passe pas à vide)", () => {
    expect([...COULEURS]).toEqual(expect.arrayContaining(["paper", "ink", "grey", "muted", "toi", "elle", "vrai", "toi-ink", "danger", "danger-ink", "ok"]));
    expect(SRC.length).toBeGreaterThan(100);
  });

  it("les tokens retirés ne reviennent pas (Q59 : morts, ou fusionnés dans danger)", () => {
    const retires = ["--white", "--opale", "--t-pop", "--t-rise", "--t-fill", "--t-float", "--color-danger-vif"];
    expect(retires.filter((v) => DECLAREES.has(v))).toEqual([]);
  });

  it("chaque classe qui nomme une de nos couleurs nomme un token qui existe", () => {
    const inconnues: string[] = [];
    for (const f of SRC)
      lire(f)
        .split("\n")
        .forEach((ligne, i) => {
          for (const [, nom] of ligne.matchAll(CLASSE_DE_COULEUR)) if (nom && !COULEURS.has(nom) && !DE_TAILWIND.has(nom)) inconnues.push(`${f}:${i + 1} ${nom}`);
        });
    expect(inconnues).toEqual([]);
  });

  it("chaque var(--color-…) cité par le code est un token déclaré", () => {
    const inconnus: string[] = [];
    for (const f of SRC)
      for (const [, nom] of lire(f).matchAll(/var\((--color-[a-z0-9-]+)\)/g)) if (nom && !DECLAREES.has(nom) && nom !== "--color-white") inconnus.push(`${f} ${nom}`);
    expect(inconnus).toEqual([]);
  });

  /*
   * Les composants, la bibliothèque et les services (8c) n’écrivent plus en hex une couleur qui a son token. Les écrans
   * (src/app) suivent avec le codemod de 8b, et la règle d’ESLint de 9a le tiendra partout. Les objets en volume
   * (objects3d.tsx) gardent leurs teintes : ce sont des dessins, pas l’interface.
   */
  /** Les hex à 6 chiffres déclarés comme tokens, et le token de chacun. */
  const VALEURS = new Map<string, string>();
  for (const [, nom, hex] of CSS.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gim)) if (nom && hex) VALEURS.set(hex.toLowerCase(), nom);
  /*
   * Un hex écrit dans une ligne, et le token qui porte sa couleur. Pas de \b pour le finir : dans une valeur arbitraire de
   * Tailwind, l’espace s’écrit « _ » (`#F4F2ED_22%`), un caractère de mot. Un #RRGGBBAA compte par ses six premiers chiffres.
   */
  const hexAvecJeton = (ligne: string) =>
    [...ligne.matchAll(/#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?(?![0-9a-fA-F])/g)].flatMap(([hex, rgb]) => {
      const jeton = rgb && VALEURS.get(`#${rgb.toLowerCase()}`);
      return jeton ? [`${hex} (${jeton})`] : [];
    });

  it("la recherche des hex voit ceux d’une valeur arbitraire et ceux à huit chiffres (le test ne passe pas à vide)", () => {
    expect(VALEURS.size).toBeGreaterThan(15);
    expect(hexAvecJeton("bg-[linear-gradient(180deg,#F4F2ED_22%)]")).toEqual(["#F4F2ED (--paper)"]);
    expect(hexAvecJeton("shadow-[0_0_0_1px_#121214cc]")).toEqual(["#121214cc (--ink)"]);
    expect(hexAvecJeton("#f4f2ed1 #f4f2ed12345 url(#f4f2ed-x)")).toEqual(["#f4f2ed (--paper)"]);
  });

  it("hors des dessins, src/components, src/lib et src/services n’écrivent pas en hex une couleur qui a son token", () => {
    const DESSINS = ["src/components/brand/objects3d.tsx"];
    const ecrits: string[] = [];
    for (const f of SRC.filter((f) => /^src\/(components|lib|services|state|contenu|types)\//.test(f) && !DESSINS.includes(f)))
      lire(f)
        .split("\n")
        .forEach((ligne, i) => {
          for (const trouve of hexAvecJeton(ligne)) ecrits.push(`${f}:${i + 1} ${trouve}`);
        });
    expect(ecrits).toEqual([]);
  });

  it("dans globals.css, hors des déclarations de tokens, une règle cite le token plutôt que son hex", () => {
    const ecrits: string[] = [];
    /* Les commentaires citent les valeurs exprès (l’histoire des rouges) : on les blanchit, lignes gardées */
    const regles = CSS.replace(/\/\*[\s\S]*?\*\//g, (commentaire) => commentaire.replace(/[^\n]/g, " "));
    regles.split("\n").forEach((ligne, i) => {
      if (/^\s*--[a-z0-9-]+\s*:/.test(ligne)) return;
      for (const trouve of hexAvecJeton(ligne)) ecrits.push(`src/app/globals.css:${i + 1} ${trouve}`);
    });
    expect(ecrits).toEqual([]);
  });

  it("danger, écrit en littéral pour que Tailwind en calcule les opacités, garde la valeur de --danger", () => {
    const valeur = (nom: string) => CSS.match(new RegExp(`^\\s*${nom}\\s*:\\s*(#[0-9a-f]{6})\\s*;`, "im"))?.[1];
    expect(valeur("--color-danger")).toBeDefined();
    expect(valeur("--color-danger")).toBe(valeur("--danger"));
  });
});
