import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { avecEcheance, delaiAppel, DUREE_FONCTION_S, echeancePour, tempsRestant } from "@/server/echeance";

/*
 * Ce que vit une fonction Vercel, écrit une fois (src/server/echeance.ts). Chaque route garde son littéral
 * `export const maxDuration` (Next le lit tel quel au build) : on vérifie dans les sources que son échéance en dérive,
 * et qu’une route qui lance la chaîne des tâches vit autant que l’échéance de la chaîne le suppose. Changer un
 * `maxDuration` sans son échéance couperait la fonction en plein appel payé. Sans base.
 */
const RACINE = join(__dirname, "..");

/** Les fichiers .ts et .tsx d’un dossier de src, avec leur texte (chemins avec des /). */
function sources(dossier: string): { chemin: string; texte: string }[] {
  const fichiers: { chemin: string; texte: string }[] = [];
  const parcourir = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const chemin = join(d, e.name);
      if (e.isDirectory()) parcourir(chemin);
      else if (/\.tsx?$/.test(e.name)) fichiers.push({ chemin: relative(RACINE, chemin).split(sep).join("/"), texte: readFileSync(chemin, "utf8") });
    }
  };
  parcourir(join(RACINE, dossier));
  return fichiers;
}

/** Le `maxDuration` exporté par une route, en secondes, ou null. */
const maxDurationDe = (texte: string) => {
  const m = /^export const maxDuration = (\d+);$/m.exec(texte);
  return m ? Number(m[1]) : null;
};
/** Le premier argument de chaque appel à avecEcheance. */
const echeancesPosees = (texte: string) => [...texte.matchAll(/\bavecEcheance\(([^,]+),/g)].map((m) => m[1].trim());

describe("l’échéance d’une fonction", () => {
  it("echeancePour : 15 s avant que Vercel coupe la fonction, par défaut", () => {
    expect(DUREE_FONCTION_S).toBe(300);
    expect(echeancePour(DUREE_FONCTION_S)).toBe(285_000);
    expect(echeancePour(180)).toBe(165_000);
    expect(echeancePour(60, 5_000)).toBe(55_000);
  });

  it("chaque route qui pose une échéance exporte son maxDuration, et l’échéance en dérive (echeancePour)", () => {
    const routes = sources("src/app").filter((f) => echeancesPosees(f.texte).length);
    expect(routes.length).toBeGreaterThanOrEqual(4);
    for (const { chemin, texte } of routes) {
      expect(maxDurationDe(texte), `${chemin} : export const maxDuration`).not.toBeNull();
      expect(echeancesPosees(texte), chemin).toEqual(echeancesPosees(texte).map(() => "echeancePour(maxDuration)"));
    }
  });

  it("hors des routes, seule la chaîne des tâches pose une échéance : celle d’une fonction qui vit DUREE_FONCTION_S", () => {
    const ailleurs = sources("src").filter((f) => !f.chemin.startsWith("src/app/") && f.chemin !== "src/server/echeance.ts" && echeancesPosees(f.texte).length);
    expect(ailleurs.map((f) => f.chemin)).toEqual(["src/server/analyse.ts"]);
    expect(echeancesPosees(ailleurs[0].texte)).toEqual(["ECHEANCE_CHAINE_MS"]);
    expect(ailleurs[0].texte).toContain("export const ECHEANCE_CHAINE_MS = echeancePour(DUREE_FONCTION_S);");
  });

  it("une route qui lance la chaîne des tâches (executerChaine) vit DUREE_FONCTION_S", () => {
    const routes = sources("src/app").filter((f) => /\bexecuterChaine\(/.test(f.texte));
    expect(routes.length).toBeGreaterThanOrEqual(5);
    for (const { chemin, texte } of routes) expect(maxDurationDe(texte), chemin).toBe(DUREE_FONCTION_S);
  });

  it("avecEcheance : tempsRestant la suit, la plus proche l’emporte, et le délai d’un appel s’y plie", async () => {
    expect(tempsRestant()).toBe(Infinity);
    expect(delaiAppel(60_000)).toBe(60_000);
    await avecEcheance(10_000, async () => {
      expect(tempsRestant()).toBeGreaterThan(9_000);
      expect(tempsRestant()).toBeLessThanOrEqual(10_000);
      /* La marge de 5 s pour finir proprement */
      expect(delaiAppel(60_000)).toBeLessThanOrEqual(5_000);
      await avecEcheance(60_000, async () => expect(tempsRestant()).toBeLessThanOrEqual(10_000));
    });
  });
});
