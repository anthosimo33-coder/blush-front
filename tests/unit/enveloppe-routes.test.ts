import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * S-44 : chaque gestionnaire de src/app/api passe par l’enveloppe `route` (src/server/http.ts), sous sa propre clé du
 * contrat. Une erreur qu’il ne rattrape pas répond alors « panne » et ne laisse au journal que la route, le nom et le
 * code de l’erreur. Un gestionnaire écrit `export async function POST` la laisserait remonter jusqu’à Next, qui écrit
 * son message entier dans les logs (celui d’une erreur SQL cite ses paramètres, un email). Lu dans le code, sans l’exécuter.
 */

const RACINE = process.cwd();
const API = join(RACINE, "src/app/api");
const METHODES = "GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS";

async function fichiers(dossier: string): Promise<string[]> {
  const entrees = await readdir(dossier, { withFileTypes: true });
  const listes = await Promise.all(entrees.map((e) => (e.isDirectory() ? fichiers(join(dossier, e.name)) : [join(dossier, e.name)])));
  return listes.flat();
}

/** Chaque route de src/app/api : son fichier, son adresse (sans les groupes « (nom) »), son code. */
async function routes() {
  const handlers = (await fichiers(API)).filter((f) => /[/\\]route\.tsx?$/.test(f));
  return Promise.all(
    handlers.map(async (f) => {
      const dossier = relative(join(RACINE, "src/app"), f).split(sep).slice(0, -1);
      return { fichier: relative(RACINE, f), chemin: `/${dossier.filter((d) => !/^\(.*\)$/.test(d)).join("/")}`, source: await readFile(f, "utf8") };
    }),
  );
}

describe("l’enveloppe des routes /api (S-44)", () => {
  it("aucun gestionnaire n’est exporté hors de route() : ni fonction, ni ré-export", async () => {
    const liste = await routes();
    expect(liste.length).toBeGreaterThan(20);
    for (const { fichier, source } of liste) {
      const horsEnveloppe = [
        ...source.matchAll(new RegExp(`export\\s+(?:async\\s+)?function\\s+(${METHODES})\\b`, "g")),
        ...source.matchAll(new RegExp(`export\\s*\\{[^}]*\\b(${METHODES})\\b[^}]*\\}`, "g")),
        ...source.matchAll(new RegExp(`export\\s+(?:const|let|var)\\s+(${METHODES})\\s*=(?!\\s*route\\()`, "g")),
      ].map((m) => m[1]);
      expect({ fichier, horsEnveloppe }).toEqual({ fichier, horsEnveloppe: [] });
    }
  });

  it("chaque gestionnaire passe à route() sa propre clé : sa méthode et l’adresse de son fichier", async () => {
    for (const { fichier, chemin, source } of await routes()) {
      const exportees = [...source.matchAll(new RegExp(`export\\s+const\\s+(${METHODES})\\s*=\\s*route\\(\\s*"([^"]*)"`, "g"))];
      expect(exportees.length, fichier).toBeGreaterThan(0);
      for (const [, methode, cle] of exportees) expect({ fichier, cle }).toEqual({ fichier, cle: `${methode} ${chemin}` });
    }
  });
});
