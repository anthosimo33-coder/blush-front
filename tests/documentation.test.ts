import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { Env } from "@/server/env";

/*
 * BACKEND.md suit le code, sans base : chaque route de src/app/api (avec ses méthodes) et chaque variable du schéma Env
 * y ont leur ligne, et la doc n’en cite aucune qui n’existe plus. Une route ou une variable ajoutée arrive avec sa ligne.
 */
const RACINE = join(__dirname, "..");
const DOC = readFileSync(join(RACINE, "BACKEND.md"), "utf8");
const METHODES = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Une section de BACKEND.md : de son titre (« ## … ») au titre suivant du même niveau. */
function section(titre: string): string {
  const morceau = DOC.split(/^## /m).find((s) => s.startsWith(titre));
  if (!morceau) throw new Error(`BACKEND.md n’a plus de section « ${titre} »`);
  return morceau;
}

/** Les cellules des lignes du premier tableau d’une section, sans l’en-tête ni sa ligne de séparation. */
function tableau(texte: string): string[][] {
  const lignes = texte.split("\n");
  const debut = lignes.findIndex((l) => l.startsWith("|"));
  const fin = lignes.findIndex((l, i) => i > debut && !l.startsWith("|"));
  return lignes.slice(debut + 2, fin === -1 ? undefined : fin).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
}

/** Les méthodes HTTP citées dans un texte, dans l’ordre de METHODES. */
const methodesDe = (texte: string) => METHODES.filter((m) => new RegExp(`\\b${m}\\b`).test(texte));

/** Les routes du code (`/api/vocal/chat/[id]`, d’après le dossier de leur route.ts), et les méthodes qu’elles exportent. */
function routesDuCode(): Map<string, string[]> {
  const routes = new Map<string, string[]>();
  const parcourir = (dossier: string) => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) parcourir(chemin);
      else if (e.name === "route.ts" || e.name === "route.tsx") {
        const source = readFileSync(chemin, "utf8");
        const exportees = METHODES.filter((m) => new RegExp(`export (async )?function ${m}\\b|export const ${m}\\b`).test(source));
        /* Un groupe de routes, « (nom) », n’apparaît pas dans l’adresse */
        const adresse = `/${relative(join(RACINE, "src/app"), dossier).split(sep).join("/")}`.replace(/\/\([^/]+\)/g, "");
        routes.set(adresse, exportees);
      }
    }
  };
  parcourir(join(RACINE, "src/app/api"));
  return routes;
}

/** Les routes du tableau « Les routes /api » : la première cellule (`/api/…`), et les méthodes de la deuxième. */
function routesDocumentees(): Map<string, string[]> {
  const routes = new Map<string, string[]>();
  for (const [route, methodes] of tableau(section("Les routes /api"))) {
    const adresse = /^`(\/api\/[^`]+)`$/.exec(route ?? "")?.[1];
    if (adresse) routes.set(adresse, methodesDe(methodes ?? ""));
  }
  return routes;
}

/** Les variables du tableau « Variables d’environnement » : celles de la première cellule (« `A`, `B` »). */
const variablesDocumentees = () => tableau(section("Variables d’environnement")).flatMap(([cellule]) => [...(cellule ?? "").matchAll(/`([A-Z][A-Z0-9_]*)`/g)].map((m) => m[1]!));

describe("BACKEND.md", () => {
  const code = routesDuCode();
  const doc = routesDocumentees();

  it("documente chaque route de src/app/api, avec ses méthodes", () => {
    expect(code.size).toBeGreaterThan(0);
    const manquantes = [...code.keys()].filter((r) => !doc.has(r));
    expect(manquantes, "routes sans ligne dans BACKEND.md (« Les routes /api »)").toEqual([]);
    for (const [route, methodes] of code) expect(doc.get(route), `les méthodes de ${route} dans BACKEND.md`).toEqual(methodes);
  });

  it("ne documente aucune route qui n’existe plus", () => {
    expect([...doc.keys()].filter((r) => !code.has(r))).toEqual([]);
  });

  it("documente chaque variable du schéma Env, et aucune autre dans son tableau", () => {
    const schema = Object.keys(Env.shape);
    const documentees = variablesDocumentees();
    expect(
      schema.filter((v) => !documentees.includes(v)),
      "variables sans ligne dans BACKEND.md (« Variables d’environnement »)",
    ).toEqual([]);
    expect(
      documentees.filter((v) => !schema.includes(v)),
      "variables du tableau absentes du schéma Env (src/server/env.ts)",
    ).toEqual([]);
  });
});
