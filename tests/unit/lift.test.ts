import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Le soulevé des boîtes cliquables (`.lift`, src/app/globals.css) écrit la propriété `translate` au survol, au focus et
 * à la pression. Un élément qui se place aussi par un translate de Tailwind (`-translate-x-1/2`, pour se centrer) le perd
 * à ce moment-là, et saute de côté : le bouton « Voir la vidéo » de l’export, le 14 octobre. On lit les sources, sans
 * navigateur : une classe `lift` et un translate sans variante dans la même chaîne de classes sont refusés.
 */
const RACINE = join(__dirname, "..", "..");

/** Les fichiers .tsx de src, avec leur texte (chemins avec des /). */
function sources(dossier: string): { chemin: string; texte: string }[] {
  const fichiers: { chemin: string; texte: string }[] = [];
  const parcourir = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const chemin = join(d, e.name);
      if (e.isDirectory()) parcourir(chemin);
      else if (e.name.endsWith(".tsx")) fichiers.push({ chemin: relative(RACINE, chemin).split(sep).join("/"), texte: readFileSync(chemin, "utf8") });
    }
  };
  parcourir(join(RACINE, dossier));
  return fichiers;
}

/** Une classe qui place l’élément par translate, sans variante (`hover:`, `[&:has(…)]:` : celles-là suivent le soulevé). */
const TRANSLATE = /^-?translate-[xy]-/;

/** Les chaînes de classes d’un texte qui mêlent `lift` et un translate sans variante, avec leur ligne. */
function conflits(texte: string): { ligne: number; classes: string }[] {
  const trouves: { ligne: number; classes: string }[] = [];
  for (const m of texte.matchAll(/"([^"\n]*)"|`([^`]*)`/g)) {
    const classes = (m[1] ?? m[2] ?? "").split(/\s+/);
    if (classes.includes("lift") && classes.some((c) => TRANSLATE.test(c))) trouves.push({ ligne: texte.slice(0, m.index).split("\n").length, classes: m[0] });
  }
  return trouves;
}

describe("le soulevé des boîtes cliquables (lift)", () => {
  it("la règle repère un élément lift centré par translate, pas un translate de variante", () => {
    expect(conflits(`<button className="lift absolute left-1/2 -translate-x-1/2" />`)).toHaveLength(1);
    expect(conflits(`<div className="lift [&:has(:focus-visible)]:-translate-y-0.5" />`)).toEqual([]);
    expect(conflits(`<button className="lift absolute inset-x-0 mx-auto w-fit" />`)).toEqual([]);
  });

  it("aucun élément de src ne se place par translate en se soulevant : il sauterait au survol et au toucher", () => {
    const trouves = sources("src").flatMap(({ chemin, texte }) => conflits(texte).map((c) => `${chemin}:${c.ligne} ${c.classes}`));
    expect(trouves).toEqual([]);
  });
});
