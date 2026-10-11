import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canari, decoder, ENCODAGES, indexDes, MIN_SUITES, mots, phrasesDesPrompts, TAILLE, textesDesPrompts } from "../scripts/verifier-fuite.mjs";

/*
 * scripts/verifier-fuite.mjs, lancé après chaque build : sur un faux .next, une phrase d’un prompt glissée dans ce que
 * reçoit le navigateur fait échouer le build (code 1), quelle que soit sa forme (mise en forme, échappée, en entités
 * HTML, en lignes courtes), et une vérification qui ne vérifierait rien aussi (pas de build, aucun fichier). Un build
 * propre passe, comme un texte qui partage moins de TAILLE mots d’affilée avec les prompts. Les phrases sont lues dans
 * le sous-module à chaque lancement : aucune n’est recopiée ici (le dépôt est public).
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
  it("lit assez de suites dans les prompts pour que la vérification prouve quelque chose", () => {
    expect(indexDes(textesDesPrompts()).size).toBeGreaterThanOrEqual(MIN_SUITES);
  });

  it("passe sur un build sans prompt", () => {
    ecrire("static/chunks/app/page.js", 'console.log("Ta conv en dit plus que tu crois.");');
    ecrire("server/app/index.html", "<html><body>BLUSH</body></html>");
    const { code, sortie } = verifier();
    expect(sortie).toContain("Aucune phrase des prompts dans 2 fichiers");
    expect(code).toBe(0);
  });

  it("échoue quand une phrase d’un prompt est dans un fichier envoyé au navigateur", () => {
    const phrase = phrasesDesPrompts()[0]!;
    ecrire("static/chunks/app/page.js", `const consigne = ${JSON.stringify(phrase)};`);
    const { code, sortie } = verifier();
    expect(code).toBe(1);
    expect(sortie).toMatch(/fuite des prompts : static\/chunks\/app\/page\.js \(prompts\/[\w-]+\.md, mot n° \d+\)/);
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

  it.each(Object.keys(ENCODAGES))("échoue quand la phrase est écrite en %s", (forme) => {
    const phrase = phrasesDesPrompts().find((ph) => mots(ph).length >= TAILLE + 2)!;
    ecrire("static/chunks/app/page.js", "export {};");
    ecrire("server/app/page.html", `<html><body>${ENCODAGES[forme as keyof typeof ENCODAGES](phrase)}</body></html>`);
    const { code, sortie } = verifier();
    expect(code).toBe(1);
    expect(sortie).toContain("fuite des prompts : server/app/page.html");
    expect(sortie.includes(phrase.slice(0, 40))).toBe(false);
  });

  it("échoue aussi sur une phrase remise en forme : Markdown au milieu, majuscules, coupée par un retour à la ligne", () => {
    const phrase = phrasesDesPrompts().find((ph) => mots(ph).length >= TAILLE + 2)!;
    const m = mots(phrase);
    const remise = `${m.slice(0, 3).join(" ").toUpperCase()} **${m[3]}** \`${m[4]}\` -\n> ${m.slice(5).join(" | ")}`;
    ecrire("static/chunks/app/page.js", `const t = ${JSON.stringify(remise)};`);
    const { code, sortie } = verifier();
    expect(code).toBe(1);
    expect(sortie).toContain("fuite des prompts : static/chunks/app/page.js");
  });

  it("échoue aussi sur un passage fait de lignes courtes (une liste de règles), chacune de moins de TAILLE mots", () => {
    /* Des lignes qui se suivent dans un prompt, chacune trop courte pour une suite de TAILLE mots, mais pas leur suite */
    const passage = textesDesPrompts()
      .flatMap(({ texte }) => {
        const blocs: string[][] = [[]];
        for (const l of texte.split("\n")) {
          const n = mots(l).length;
          if (n > 0 && n < TAILLE) blocs.at(-1)!.push(l);
          else blocs.push([]);
        }
        return blocs;
      })
      .find((b) => mots(b.join("\n")).length >= TAILLE + 2);
    expect(passage, "aucune suite de lignes courtes dans les prompts").toBeDefined();
    ecrire("static/chunks/app/page.js", `const regles = ${JSON.stringify(passage!.join("\n"))};`);
    const { code, sortie } = verifier();
    expect(code).toBe(1);
    expect(sortie).toContain("fuite des prompts : static/chunks/app/page.js");
    expect(sortie.includes(passage![0]!)).toBe(false);
  });

  it("échoue aussi quand la phrase est au milieu d’un JavaScript minifié qui contient un « < » (ce n’est pas une balise)", () => {
    const phrase = phrasesDesPrompts().find((ph) => mots(ph).length >= TAILLE + 2 && !/[<>]/.test(ph))!;
    ecrire("static/chunks/app/page.js", `x="u"<typeof window?${JSON.stringify(phrase)}:(a)=>a;`);
    const { code, sortie } = verifier();
    expect(code).toBe(1);
    expect(sortie).toContain("fuite des prompts : static/chunks/app/page.js");
  });

  it(`passe quand un texte ne partage que ${TAILLE - 1} mots d’affilée avec une phrase des prompts`, () => {
    const phrase = phrasesDesPrompts().find((ph) => mots(ph).length >= TAILLE + 2)!;
    ecrire("static/chunks/app/page.js", `const t = ${JSON.stringify(mots(phrase).slice(0, TAILLE - 1).join(" "))};`);
    const { code, sortie } = verifier();
    expect(sortie).toContain("Aucune phrase des prompts dans 1 fichiers");
    expect(code).toBe(0);
  });

  it("le canari : une phrase des prompts écrite sous chaque forme est retrouvée, et une recherche aveugle le dit", () => {
    const textes = textesDesPrompts();
    expect(canari(textes)).toEqual([]);
    /* Sans index (une recherche qui ne trouverait rien), chaque forme est signalée */
    expect(canari(textes, new Map())).toEqual(Object.keys(ENCODAGES));
  });

  it("décode les échappements du JavaScript et les entités HTML, même deux fois", () => {
    expect(decoder("l\\u2019autre \\x27a\\x27 \\u{1F600}")).toBe("l’autre 'a' 😀");
    /* Échappé deux fois : chaque passe enlève un niveau, l’antislash échappé n’entame pas l’échappement qui le suit */
    expect(decoder("l\\\\u2019autre")).toBe("l’autre");
    expect(mots(decoder("l\\\\u2019autre"))).toEqual(["l'autre"]);
    expect(decoder("a\\\\nous")).toBe("a ous");
    expect(decoder("&lt;p&gt;l&#x27;autre &amp;amp; &#8217; &rsquo;&quot;")).toBe("<p>l'autre & ’ ’\"");
    expect(mots("<p>C’est <!-- -->l’<strong>AUTRE</strong>, 'vraiment'</p>")).toEqual(["c'est", "l", "autre", "vraiment"]);
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
