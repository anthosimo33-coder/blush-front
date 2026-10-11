import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrationsSautees, sslPour, urlVerifiee } from "../scripts/base.mjs";

/*
 * scripts/verifier-migrations.mjs, lancé avant chaque build et chaque `npm test` : sur une copie de drizzle/, un journal
 * cassé de chacune des façons qu’il doit voir, ou un dernier instantané en retard sur schema.ts, fait échouer le script
 * (code 1, et il dit pourquoi) ; la copie intacte passe.
 */
const SCRIPT = join(__dirname, "../scripts/verifier-migrations.mjs");
let dossier: string;

type Entree = { idx: number; version: string; when: number; tag: string; breakpoints: boolean };
const journal = () => JSON.parse(readFileSync(join(dossier, "meta/_journal.json"), "utf8")) as { entries: Entree[] };
const reecrire = (modifier: (entrees: Entree[]) => void) => {
  const j = journal();
  modifier(j.entries);
  writeFileSync(join(dossier, "meta/_journal.json"), JSON.stringify(j, null, 2));
};
const verifier = () => {
  const r = spawnSync(process.execPath, [SCRIPT, dossier], { encoding: "utf8" });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
};

beforeEach(() => {
  const racine = mkdtempSync(join(tmpdir(), "blush-migrations-"));
  dossier = join(racine, "drizzle");
  cpSync(join(__dirname, "../drizzle"), dossier, { recursive: true });
});
afterEach(() => rmSync(join(dossier, ".."), { recursive: true, force: true }));

describe("la vérification des migrations", { timeout: 30_000 }, () => {
  it("passe sur les migrations du dépôt", () => {
    const { code, sortie } = verifier();
    expect(sortie).toContain("Migrations cohérentes");
    expect(code).toBe(0);
  });

  it("refuse des idx qui ne se suivent pas", () => {
    reecrire((e) => (e[3].idx = 7));
    const { code, sortie } = verifier();
    expect(code).toBe(1);
    expect(sortie).toContain("a l’idx 7 : les idx doivent se suivre depuis 0");
  });

  it("refuse un `when` qui n’est pas après le précédent : drizzle sauterait la migration en production", () => {
    reecrire((e) => (e.at(-1)!.when = e.at(-2)!.when - 1));
    const { code, sortie } = verifier();
    expect(code).toBe(1);
    expect(sortie).toContain("drizzle la sauterait en production");
  });

  it("refuse une migration sans son .sql, ou sans son instantané", () => {
    rmSync(join(dossier, `${journal().entries[5].tag}.sql`));
    rmSync(join(dossier, "meta/0008_snapshot.json"));
    const { code, sortie } = verifier();
    expect(code).toBe(1);
    expect(sortie).toContain(`${journal().entries[5].tag}.sql manque`);
    expect(sortie).toContain("meta/0008_snapshot.json manque");
  });

  it("refuse un .sql hors du journal : il ne serait jamais appliqué", () => {
    writeFileSync(join(dossier, "0012_oubliee.sql"), "alter table users add column oubli text;");
    const { code, sortie } = verifier();
    expect(code).toBe(1);
    expect(sortie).toContain("0012_oubliee.sql n’est pas dans le journal");
  });

  it("refuse un journal illisible", () => {
    writeFileSync(join(dossier, "meta/_journal.json"), "{ pas du json");
    const { code, sortie } = verifier();
    expect(code).toBe(1);
    expect(sortie).toContain("meta/_journal.json illisible");
  });

  it("refuse deux instantanés qui partent du même parent (deux branches qui ont chacune généré sa migration)", () => {
    const chemin = (n: string) => join(dossier, `meta/${n}_snapshot.json`);
    const dernier = JSON.parse(readFileSync(chemin("0011"), "utf8")) as { prevId: string };
    dernier.prevId = (JSON.parse(readFileSync(chemin("0009"), "utf8")) as { id: string }).id;
    writeFileSync(chemin("0011"), JSON.stringify(dernier));
    const { code, sortie } = verifier();
    expect(code).toBe(1);
    expect(sortie).toContain("drizzle-kit check a échoué");
    expect(sortie).toContain("collision");
  });

  it("refuse un schéma qui a changé sans sa migration (une liste des étapes de la chaîne, et son index unique)", () => {
    /* Le dernier instantané garde l’index d’avant une étape de plus dans GENRES_CHAINE : schema.ts en demande un autre */
    const chemin = join(dossier, `meta/${journal().entries.at(-1)!.tag.slice(0, 4)}_snapshot.json`);
    const dernier = JSON.parse(readFileSync(chemin, "utf8")) as { tables: Record<string, { indexes: Record<string, { where: string }> }> };
    const index = dernier.tables["public.tasks"].indexes.tasks_une_par_etape;
    index.where = index.where.replace(", 'memoire')", ")");
    writeFileSync(chemin, JSON.stringify(dernier));
    const { code, sortie } = verifier();
    expect(code).toBe(1);
    expect(sortie).toContain("schema.ts a changé sans sa migration");
    expect(sortie).toContain('CREATE UNIQUE INDEX "tasks_une_par_etape"');
  });
});

/*
 * Au build de la production, scripts/migrer.mjs refuse une migration que drizzle sauterait, et joint la base distante en
 * vérifiant son certificat (scripts/base.mjs, sans base ici).
 */
describe("la migration de la production", () => {
  const entree = (when: number, tag: string) => ({ when, tag });
  const entrees = [entree(100, "0000_a"), entree(200, "0001_b"), entree(300, "0002_c")];

  it("refuse une migration plus ancienne que la dernière appliquée, et jamais appliquée (rebasée derrière une autre)", () => {
    expect(migrationsSautees(entrees, [100, 300])).toEqual([entree(200, "0001_b")]);
    expect(migrationsSautees([...entrees, entree(250, "0003_rebasee")], [100, 200, 300])).toEqual([entree(250, "0003_rebasee")]);
  });

  it("laisse passer une base neuve, une base à jour, et ce qui est plus récent que la base", () => {
    expect(migrationsSautees(entrees, [])).toEqual([]);
    expect(migrationsSautees(entrees, [100, 200, 300])).toEqual([]);
    expect(migrationsSautees(entrees, [100])).toEqual([]);
  });

  it("le journal du dépôt passe, appliqué dans l’ordre jusqu’à n’importe quelle migration", () => {
    const { entries } = JSON.parse(readFileSync(join(__dirname, "../drizzle/meta/_journal.json"), "utf8")) as { entries: Entree[] };
    const quand = entries.map((e) => e.when);
    for (let n = 0; n <= quand.length; n++) expect(migrationsSautees(entries, quand.slice(0, n))).toEqual([]);
  });

  it("hors de la machine, vérifie le certificat de la base, quoi que dise l’URL (S-36)", () => {
    const neon = "postgres://moi:secret@ep-exemple.eu-central-1.aws.neon.tech/neondb?sslmode=require";
    expect(sslPour(neon)).toBe("verify-full");
    expect(new URL(urlVerifiee(neon)).searchParams.get("sslmode")).toBe("verify-full");
    expect(urlVerifiee(neon)).toContain("moi:secret@ep-exemple.eu-central-1.aws.neon.tech/neondb");
    for (const locale of ["postgres://localhost:5432/blush_dev", "postgres://127.0.0.1/blush_test", "postgres://[::1]:5432/blush", "postgres://base.localhost/blush"]) {
      expect(sslPour(locale), locale).toBe(false);
      expect(urlVerifiee(locale), locale).toBe(locale);
    }
  });
});
