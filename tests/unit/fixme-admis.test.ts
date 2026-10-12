import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Un fixme (un test marqué `.fixme`) est un bug connu, que la CI ne joue pas : il ne doit pas s’oublier. Chaque fixme des tests de bout
 * en bout (tests/e2e/**\/*.spec.ts) est dans FIXME_ADMIS, avec la raison qui le garde, et `npm run todo` les liste avec
 * les TODO(produit). Un nouveau fixme fait échouer ce test : on corrige le bug, ou on l’ajoute ici en le disant. Ce
 * fichier n’écrit jamais le nom complet de l’appel, pour que `npm run todo` ne liste que les vrais fixme.
 *
 * La liste ne fait que rétrécir : un fixme corrigé (repassé en test()) en sort. Un fixme admis mais absent ne fait pas
 * échouer (les quatre lots du 12 octobre se fusionnent dans n’importe quel ordre) ; à l’intégration, il ne reste que la
 * question du plan « rapport », qui attend une décision (TODO(produit) dans src/lib/acces.ts).
 */

/** Les fixme admis, par fichier (depuis tests/e2e) et par titre, avec ce qui les garde. */
const FIXME_ADMIS: readonly { fichier: string; titre: string; raison: string }[] = [
  {
    fichier: "rapport-question.spec.ts",
    titre: "compte « rapport » : la question incluse avec le rapport reçoit sa réponse",
    raison: "TODO(produit) : la question incluse avec le seul plan « rapport » (src/lib/acces.ts)",
  },
  /* Corrigés dans les autres lots du 12 octobre : à retirer d’ici une fois ces lots fusionnés */
  { fichier: "chat-fiche-sa-fiche.spec.ts", titre: "après un retrait, les infos arrivées gardent leur point « Nouveau »", raison: "corrigé dans un autre lot" },
  { fichier: "chat-fiche-sa-fiche.spec.ts", titre: "quand elle parle de lui, la ligne d’ajout de « Il aime » porte ce nom", raison: "corrigé dans un autre lot" },
  { fichier: "chat-fiche.spec.ts", titre: "le champ du chat porte son seul nom, sans celui du bouton à côté", raison: "corrigé dans un autre lot" },
  {
    fichier: "import-whatsapp.spec.ts",
    titre: "la durée de la conv est la même pendant la lecture et sur le verdict : 4 jours, du 4 au 7 septembre",
    raison: "corrigé dans un autre lot",
  },
  { fichier: "rapport-sobre.spec.ts", titre: "une alerte : pas de scène du verdict, même avant que le rapport doux soit écrit", raison: "corrigé dans un autre lot" },
];

const E2E = join(__dirname, "../e2e");
const SPECS = readdirSync(E2E, { recursive: true, encoding: "utf8" })
  .filter((f) => f.endsWith(".spec.ts"))
  .map((f) => f.split("\\").join("/"));

/** Les appels à `.fixme` d’un fichier : leur titre quand ils en ont un (un titre puis la fonction du test), null sinon (`.fixme()`, `describe.fixme(cond)`…). */
function fixmeDe(source: string): (string | null)[] {
  return [...source.matchAll(/\.fixme\(\s*(?:(["'`])((?:\\.|(?!\1)[^\\])*)\1)?/g)].map((m) => m[2] ?? null);
}

describe("les fixme des tests de bout en bout", () => {
  it("se trouvent dans les specs (la lecture des fichiers marche)", () => {
    expect(SPECS.length).toBeGreaterThan(20);
    const appel = ["test", "fixme"].join(".");
    expect(fixmeDe(`${appel}("un titre", async () => {});`)).toEqual(["un titre"]);
    expect(fixmeDe(`${appel}('l’autre', () => {});\n${appel}(\`un gabarit\`, () => {});`)).toEqual(["l’autre", "un gabarit"]);
    expect(fixmeDe(`test.describe.fixme(true);\n/* le ${appel} plus bas */`)).toEqual([null]);
  });

  it("sont tous admis (FIXME_ADMIS), avec un titre", () => {
    const trouves = SPECS.flatMap((fichier) => fixmeDe(readFileSync(join(E2E, fichier), "utf8")).map((titre) => ({ fichier, titre })));
    const horsListe = trouves.filter(({ fichier, titre }) => !FIXME_ADMIS.some((a) => a.fichier === fichier && a.titre === titre));
    expect(horsListe, "un fixme hors de FIXME_ADMIS : corriger le bug, ou l’admettre en disant pourquoi").toEqual([]);
  });

  it("la question du plan « rapport » est la seule admise pour une raison de produit", () => {
    expect(FIXME_ADMIS.filter((a) => a.raison.startsWith("TODO(produit)")).map((a) => a.fichier)).toEqual(["rapport-question.spec.ts"]);
  });
});
