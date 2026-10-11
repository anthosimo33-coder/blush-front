import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { problemesDe, regleDesInsecables, verifier } from "../scripts/verifier-typo.mjs";

/*
 * scripts/verifier-typo.mjs, lancé par `npm run check` (qui le passe sur tout le dépôt) : une espace normale avant
 * : ; ? ! » ou après « dans un texte affiché (chaîne, gabarit, texte du JSX), une insécable écrite autrement que {NBSP}
 * ou \u00a0, et un caractère invisible écrit en clair font échouer la vérification. Les commentaires, le code (`:root`,
 * `!important`), les messages des logs et les alertes à l’équipe ne comptent pas. Les sources ci-dessous écrivent les
 * caractères invisibles en échappement : seul le texte vérifié les contient en clair.
 */
const ecran = (source: string) => problemesDe("src/app/Essai.tsx", source);

describe("la vérification de la typographie", () => {
  it("passe sur les fichiers que sa première version a corrigés (le dépôt entier, c’est `npm run check`)", () => {
    const corriges = ["src/app/v/[id]/page.tsx", "src/app/rapport/Partage.tsx", "src/app/admin/AdminScreen.tsx", "src/app/app/HomeScreen.tsx", "src/app/rapport/Ecriture.tsx", "src/server/donnees.ts", "src/server/ajouts.ts", "src/server/mail-code.ts"];
    expect(verifier(corriges)).toEqual({ problemes: [], lus: corriges.length });
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
    expect(ecran(`const a = <p>Leur conv reste privée{NBSP}: seul le verdict est partagé.</p>;`)).toEqual([]);
    expect(ecran(`const a = <p>{IlOuElle(autre)} vient de répondre ?</p>;`)).toHaveLength(1);
    expect(ecran(`const a = <p>Une question <b>?</b> <Link href="/">Lis «</Link> la suite</p>;`)).toHaveLength(2);
    expect(ecran(`const a = <p>Une question <b>{NBSP}?</b></p>;`)).toEqual([]);
    expect(ecran(`const a = (\n  <p>\n    Ta conv\n    : ce qui part\n  </p>\n);`)).toHaveLength(1);
    expect(ecran(`const a = <input aria-label="Ajouter dans « Elle aime »" />;`)).toHaveLength(2);
  });

  it("veut l’insécable sous une seule forme : {NBSP} dans le JSX, \\u00a0 dans une chaîne ou un gabarit, jamais une copie", () => {
    expect(ecran(`const a = <p>une question sur vous deux&nbsp;? balance</p>;`)).toEqual([expect.stringContaining("`&nbsp;` dans le JSX")]);
    expect(ecran(`const a = <p>Leur conv reste privée{"\\u00a0"}: seul le verdict est partagé.</p>;`)).toEqual([expect.stringContaining("dans le JSX : écrire {NBSP}")]);
    expect(ecran("const a = `${n}${NBSP}%`;")).toEqual([expect.stringContaining("l’insécable d’un gabarit")]);
    expect(ecran("const a = `${n}\\u00a0%`;")).toEqual([]);
    /* La cause du bug de /v : une constante locale qui contenait une espace normale */
    expect(ecran(`const N = " ";\nconst a = <p>Une question{N}?</p>;`)).toEqual([expect.stringContaining("une constante d’espace")]);
    expect(ecran(`const NB = "\\u00a0";`)).toEqual([expect.stringContaining("une constante d’espace")]);
    expect(problemesDe("src/lib/format.ts", `export const NBSP = "\\u00a0";`)).toEqual([]);
  });

  it("ne lit ni les commentaires, ni le code, ni les messages des logs, ni les alertes à l’équipe", () => {
    expect(ecran(`/* Le verdict : la carte */\n// une question ?\nconst a = 1;`)).toEqual([]);
    expect(ecran(`const css = ":root { color-scheme: light } .carte { background: #FFF !important; }";`)).toEqual([]);
    expect(ecran(`const c = "!size-10 !shadow-soft";`)).toEqual([]);
    expect(ecran(`console.error("alerte : envoi impossible");\nthrow new Error("useContact : hors de HomeScreen");`)).toEqual([]);
    expect(ecran("await alerter(`chat en échec`, [`Histoire ${id}`, `Erreur : ${e.message}`]);")).toEqual([]);
    /* Le journal du serveur et la trace du navigateur : à l’équipe aussi */
    expect(ecran(`journal("garde-fou : réponse remplacée", { histoire: id }, "alerte");\njournalErreur("code : non envoyé", e);`)).toEqual([]);
    expect(ecran(`after(() => auMieux(() => inscrire(email), "liste d’attente : non inscrit"));\nenLocal(\`[dev] mail « \${sujet} » pour \${pour}\`);\ntracer("son : non joué", e);`)).toEqual([]);
    /* Le même texte hors de ces appels reste lu */
    expect(ecran(`const t = "liste d’attente : non inscrit";`)).toEqual([expect.stringContaining("espace normale avant « : »")]);
    /* Le travail passé à auMieux (une closure ou une promesse) peut envoyer un mail : il reste lu, seul l’événement est dispensé */
    const mail = `envoyerMail(u, { sujet: "Ton rapport : prêt" })`;
    expect(ecran(`void auMieux(() => ${mail}, "mail : non parti");`)).toEqual([expect.stringContaining("espace normale avant « : »")]);
    expect(ecran(`void auMieux(${mail}, "mail : non parti", { cle: "a : b" });`)).toEqual([expect.stringContaining("espace normale avant « : »")]);
    expect(ecran("/* typo: du code */\nconst CODE = `const x = a ? b : c;`;")).toEqual([]);
  });

  it("signale les caractères invisibles écrits en clair, l’insécable comprise, mais pas l’emoji qu’un U+200D assemble", () => {
    expect(ecran(`const a = "Une question\u00a0?";`)).toEqual([expect.stringContaining("U+00A0 écrit en clair")]);
    expect(problemesDe("tests/essai.test.ts", `expect(t).toBe("Une question\u00a0?");`, { insecables: false })).toEqual([expect.stringContaining("U+00A0 écrit en clair")]);
    expect(ecran(`const m = "\u200eimage omitted";`)).toEqual([expect.stringContaining("U+200E écrit en clair")]);
    expect(ecran(`const r = /^\ufeff?x/;`)).toEqual([expect.stringContaining("U+FEFF écrit en clair")]);
    expect(ecran(`const z = "a\u200db";`)).toEqual([expect.stringContaining("U+200D écrit en clair")]);
    expect(ecran(`const e = "on reprend demain 😮\u200d💨";`)).toEqual([]);
    expect(ecran(`const m = "\\u200eimage omitted";`)).toEqual([]);
  });

  it("garde la règle des insécables pour ce que quelqu’un lit : ni ce que le serveur n’écrit qu’à l’équipe, aux logs ou au modèle, ni les tests", () => {
    expect(regleDesInsecables("src/app/v/[id]/page.tsx")).toBe(true);
    expect(regleDesInsecables("src/components/ui/messages.tsx")).toBe(true);
    expect(regleDesInsecables("src/server/carte-verdict.tsx")).toBe(true);
    expect(regleDesInsecables("src/server/mail-code.ts")).toBe(true);
    expect(regleDesInsecables("src/server/donnees.ts")).toBe(true);
    expect(regleDesInsecables("src/app/api/chat/route.ts")).toBe(true);
    expect(regleDesInsecables("src/server/alertes.ts")).toBe(false);
    expect(regleDesInsecables("src/server/ia/factice.ts")).toBe(false);
    expect(regleDesInsecables("tests/e2e/aide/exports.ts")).toBe(false);
    expect(regleDesInsecables("prompts/lib/conv.ts")).toBe(false);
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
