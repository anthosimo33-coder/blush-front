import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { problemesDe, regleDesInsecables, verifier } from "../scripts/verifier-typo.mjs";

/*
 * scripts/verifier-typo.mjs, lancé par `npm run check` : une espace normale avant : ; ? ! » ou après « dans un texte de
 * l’interface (chaîne, gabarit, texte du JSX), et un caractère invisible écrit en clair, font échouer la vérification.
 * Les commentaires, le code (`:root`, `!important`) et les messages des logs ne comptent pas. Les sources ci-dessous
 * écrivent les caractères invisibles en échappement : seul le texte vérifié les contient en clair.
 */
const ecran = (source: string) => problemesDe("src/app/Essai.tsx", source);

describe("la vérification de la typographie", () => {
  it("passe sur tout le dépôt", () => {
    const { problemes, lus } = verifier();
    expect(problemes).toEqual([]);
    expect(lus).toBeGreaterThan(100);
  });

  it("signale une espace normale avant : ; ? ! », et après «", () => {
    expect(ecran(`const a = "Vérifie ton email : il manque quelque chose.";`)).toHaveLength(1);
    expect(ecran(`const a = "Une question ?";`)).toHaveLength(1);
    expect(ecran(`const a = "Trop bien !";`)).toHaveLength(1);
    expect(ecran(`const a = "d’abord ; ensuite";`)).toHaveLength(1);
    expect(ecran(`const a = "« on se parle »";`)).toHaveLength(2);
    expect(ecran("const a = (n: number) => `${n} captures : on garde les premières`;")).toHaveLength(1);
    expect(ecran(`const a = "Une question\\u00a0? «\\u00a0oui\\u00a0»";`)).toEqual([]);
  });

  it("lit le JSX comme il s’affiche : les morceaux d’une phrase recollés, les lignes jointes par une espace", () => {
    expect(ecran(`const a = <p>Leur conv reste privée{" "}: seul le verdict est partagé.</p>;`)).toHaveLength(1);
    expect(ecran(`const a = <p>Leur conv reste privée{"\\u00a0"}: seul le verdict est partagé.</p>;`)).toEqual([]);
    expect(ecran(`const a = <p>Leur conv reste privée{NBSP}: seul le verdict est partagé.</p>;`)).toEqual([]);
    expect(ecran(`const a = <p>une question sur vous deux&nbsp;? balance</p>;`)).toEqual([]);
    expect(ecran(`const a = <p>{IlOuElle(autre)} vient de répondre ?</p>;`)).toHaveLength(1);
    expect(ecran(`const a = (\n  <p>\n    Ta conv\n    : ce qui part\n  </p>\n);`)).toHaveLength(1);
    expect(ecran(`const a = <input aria-label="Ajouter dans « Elle aime »" />;`)).toHaveLength(2);
  });

  it("ne lit ni les commentaires, ni le code, ni les messages des logs", () => {
    expect(ecran(`/* Le verdict : la carte */\n// une question ?\nconst a = 1;`)).toEqual([]);
    expect(ecran(`const css = ":root { color-scheme: light } .carte { background: #FFF !important; }";`)).toEqual([]);
    expect(ecran(`const c = "!size-10 !shadow-soft";`)).toEqual([]);
    expect(ecran(`console.error("alerte : envoi impossible");\nthrow new Error("useContact : hors de HomeScreen");`)).toEqual([]);
    expect(ecran("/* typo: du code */\nconst CODE = `const x = a ? b : c;`;")).toEqual([]);
  });

  it("signale les caractères invisibles écrits en clair, mais pas l’emoji qu’un U+200D assemble", () => {
    expect(ecran(`const m = "\u200eimage omitted";`)).toEqual([expect.stringContaining("U+200E écrit en clair")]);
    expect(ecran(`const r = /^\ufeff?x/;`)).toEqual([expect.stringContaining("U+FEFF écrit en clair")]);
    expect(ecran(`const z = "a\u200db";`)).toEqual([expect.stringContaining("U+200D écrit en clair")]);
    expect(ecran(`const e = "on reprend demain 😮\u200d💨";`)).toEqual([]);
    expect(ecran(`const m = "\\u200eimage omitted";`)).toEqual([]);
  });

  it("garde la règle des insécables pour l’interface : le serveur (sauf ses images de partage) et les tests n’ont que celle des invisibles", () => {
    expect(regleDesInsecables("src/app/v/[id]/page.tsx")).toBe(true);
    expect(regleDesInsecables("src/components/ui/messages.tsx")).toBe(true);
    expect(regleDesInsecables("src/server/carte-verdict.tsx")).toBe(true);
    expect(regleDesInsecables("src/server/mail-code.ts")).toBe(false);
    expect(regleDesInsecables("src/app/api/chat/route.ts")).toBe(false);
    expect(regleDesInsecables("tests/e2e/aide/exports.ts")).toBe(false);
    expect(problemesDe("tests/essai.test.ts", `const a = "une question ?";`, { insecables: false })).toEqual([]);
  });
});

describe("le script, lancé sur des fichiers", { timeout: 30_000 }, () => {
  const SCRIPT = join(__dirname, "../scripts/verifier-typo.mjs");
  let dossier: string;
  beforeEach(() => {
    dossier = mkdtempSync(join(tmpdir(), "blush-typo-"));
  });
  afterEach(() => rmSync(dossier, { recursive: true, force: true }));
  const lancer = (contenu: string) => {
    const fichier = join(dossier, "essai.ts");
    writeFileSync(fichier, contenu);
    const r = spawnSync(process.execPath, [SCRIPT, fichier], { encoding: "utf8" });
    return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
  };

  it("échoue (code 1) sur un caractère invisible en clair, et dit où", () => {
    const { code, sortie } = lancer(`export const m = "\u200eimage omitted";\n`);
    expect(code).toBe(1);
    expect(sortie).toContain("essai.ts:1 · U+200E écrit en clair");
  });

  it("passe sur un fichier propre", () => {
    const { code, sortie } = lancer(`export const m = "\\u200eimage omitted";\n`);
    expect(sortie).toContain("✓ Typographie : 1 fichiers");
    expect(code).toBe(0);
  });
});
