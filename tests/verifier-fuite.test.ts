import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MIN_PHRASES, phrasesDesPrompts } from "../scripts/verifier-fuite.mjs";

/*
 * scripts/verifier-fuite.mjs, lancé après chaque build : sur un faux .next, une phrase d’un prompt glissée dans ce que
 * reçoit le navigateur fait échouer le build (code 1), et une vérification qui ne vérifierait rien aussi (pas de build,
 * aucun fichier). Un build propre passe.
 */
const SCRIPT = join(__dirname, "../scripts/verifier-fuite.mjs");
let racine: string;
let next: string;

const ecrire = (chemin: string, contenu: string) => {
  mkdirSync(join(next, chemin, ".."), { recursive: true });
  writeFileSync(join(next, chemin), contenu);
};
const verifier = (script = SCRIPT) => {
  const r = spawnSync(process.execPath, [script, next], { encoding: "utf8" });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
};

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), "blush-fuite-"));
  next = join(racine, ".next");
});
afterEach(() => rmSync(racine, { recursive: true, force: true }));

describe("la vérification des prompts dans le build", { timeout: 30_000 }, () => {
  it("lit assez de phrases dans les prompts pour que la vérification prouve quelque chose", () => {
    expect(phrasesDesPrompts().length).toBeGreaterThanOrEqual(MIN_PHRASES);
  });

  it("passe sur un build sans prompt", () => {
    ecrire("static/chunks/app/page.js", 'console.log("Ta conv en dit plus que tu crois.");');
    ecrire("server/app/index.html", "<html><body>BLUSH</body></html>");
    const { code, sortie } = verifier();
    expect(sortie).toContain("Aucune phrase des prompts dans 2 fichiers");
    expect(code).toBe(0);
  });

  it("échoue quand une phrase d’un prompt est dans un fichier envoyé au navigateur", () => {
    const [phrase] = phrasesDesPrompts();
    ecrire("static/chunks/app/page.js", `const consigne = ${JSON.stringify(phrase)};`);
    const { code, sortie } = verifier();
    expect(code).toBe(1);
    expect(sortie).toContain("fuite des prompts : static/chunks/app/page.js (phrase n° 1 sur");
    /* La sortie ne recopie pas la phrase (les logs de la CI sont publics) ; un booléen, pour qu’un échec ne l’affiche pas non plus */
    expect(sortie.includes(phrase)).toBe(false);
  });

  it("échoue aussi quand la phrase est dans une page prérendue", () => {
    const phrase = phrasesDesPrompts().at(-1)!;
    ecrire("static/chunks/app/page.js", "export {};");
    ecrire("server/app/rapport.rsc", `0:["$","p",null,{"children":${JSON.stringify(phrase)}}]`);
    const { code, sortie } = verifier();
    expect(code).toBe(1);
    expect(sortie).toContain("fuite des prompts : server/app/rapport.rsc");
    expect(sortie.includes(phrase.slice(0, 40))).toBe(false);
  });

  it("échoue sans build : un dossier vide n’a pas de .next/static", () => {
    mkdirSync(next);
    const { code, sortie } = verifier();
    expect(code).toBe(1);
    expect(sortie).toContain("static manque : pas de build à vérifier");
  });

  it("vérifie aussi quand on le lance par un lien symbolique (un dossier relié ailleurs)", () => {
    mkdirSync(next);
    const lien = join(racine, "verifier-fuite.mjs");
    symlinkSync(SCRIPT, lien);
    const { code, sortie } = verifier(lien);
    expect(code).toBe(1);
    expect(sortie).toContain("static manque : pas de build à vérifier");
  });

  it("échoue quand aucun fichier n’a été lu", () => {
    mkdirSync(join(next, "static"), { recursive: true });
    const { code, sortie } = verifier();
    expect(code).toBe(1);
    expect(sortie).toContain("rien n’a été vérifié");
  });
});
