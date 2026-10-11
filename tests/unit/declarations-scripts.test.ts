import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/*
 * Les scripts restés en JavaScript (scripts/**.mjs) que le TypeScript importe ont leurs types écrits à la main, dans un
 * .d.mts à côté : tsc lit celui-ci, jamais le .mjs. Rien d’autre ne compare les deux : un export ajouté, renommé ou
 * retiré d’un côté seulement ne casserait qu’à l’exécution, ou passerait sans un mot. Ce test lit chaque .d.mts, et
 * vérifie que son .mjs exporte exactement les mêmes valeurs (les types n’existent qu’à la compilation), une fonction là
 * où il déclare une fonction. Les signatures, elles, se relisent à la main, quand le script change.
 */
const RACINE = fileURLToPath(new URL("../..", import.meta.url));
const SCRIPTS = join(RACINE, "scripts");

/** Les .d.mts de scripts/, à toute profondeur (scripts/deployer/node_modules exclu). */
function declarations(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : declarations(chemin);
    return e.name.endsWith(".d.mts") ? [chemin] : [];
  });
}

/** Les valeurs qu’un .d.mts déclare exportées, et leur genre : une fonction, ou une constante. */
function exportsDeclares(chemin: string): Map<string, "fonction" | "constante"> {
  const source = ts.createSourceFile(chemin, readFileSync(chemin, "utf8"), ts.ScriptTarget.Latest);
  const declares = new Map<string, "fonction" | "constante">();
  const exporte = (n: ts.Node) => ts.canHaveModifiers(n) && !!ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const s of source.statements) {
    if (ts.isFunctionDeclaration(s) && s.name && exporte(s)) declares.set(s.name.text, "fonction");
    else if (ts.isVariableStatement(s) && exporte(s)) {
      for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) declares.set(d.name.text, "constante");
    } else if (ts.isExportDeclaration(s) || ts.isExportAssignment(s) || ts.isClassDeclaration(s) || ts.isEnumDeclaration(s))
      throw new Error(`${relative(RACINE, chemin)} : une forme d’export que ce test ne lit pas encore, à lui apprendre`);
  }
  return declares;
}

const FICHIERS = declarations(SCRIPTS).map((d) => relative(RACINE, d));

describe("les types écrits à côté des scripts en JavaScript", () => {
  it("existent (sinon ce test ne vérifierait rien)", () => {
    expect(FICHIERS.length).toBeGreaterThan(0);
  });

  it.each(FICHIERS)("%s déclare exactement ce que son .mjs exporte", async (fichier) => {
    const declares = exportsDeclares(join(RACINE, fichier));
    const script: Record<string, unknown> = await import(/* @vite-ignore */ pathToFileURL(join(RACINE, fichier.replace(/\.d\.mts$/, ".mjs"))).href);
    expect([...declares.keys()].sort()).toEqual(Object.keys(script).sort());
    for (const [nom, genre] of declares) expect(`${nom} : ${typeof script[nom] === "function" ? "fonction" : "constante"}`).toBe(`${nom} : ${genre}`);
  });
});
