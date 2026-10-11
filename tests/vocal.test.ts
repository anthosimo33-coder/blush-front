import { describe, expect, it } from "vitest";
import { ligneA, minuter, texteDit, type Alignement, type LigneScript } from "@/lib/vocal";
import { chiffrerOctets, dechiffrerOctets } from "@/server/chiffrement";
import { auMoins } from "./aide/listes";

const script: LigneScript[] = [
  { jeu: "sighs dramatically", texte: "Bon. Hugo.", punch: false, preuve: null },
  { jeu: null, texte: "Tu réponds « mdr » ?!", punch: true, preuve: "m0002" },
];

/** Un alignement régulier : 50 ms par caractère du texte envoyé. */
const regulier = (texte: string): Alignement => {
  const c = [...texte];
  return { characters: c, character_start_times_seconds: c.map((_, i) => i * 0.05), character_end_times_seconds: c.map((_, i) => (i + 1) * 0.05) };
};

describe("le texte envoyé à la voix", () => {
  it("met le jeu entre crochets devant sa ligne, jamais dans le texte affiché", () => {
    const { texte, debuts } = texteDit(script);
    expect(texte).toBe("[sighs dramatically] Bon. Hugo. Tu réponds « mdr » ?!");
    expect(texte.slice(debuts[1], debuts[1]! + 10)).toBe("Tu réponds");
  });
  it("retire les crochets que le modèle aurait laissés dans le texte", () => {
    expect(texteDit([{ jeu: "[laughs]", texte: "MDR [laughs] frérot", punch: true, preuve: null }]).texte).toBe("[laughs] MDR  frérot");
  });
});

describe("le minutage", () => {
  it("donne le début de chaque ligne et de chaque mot, d’après l’audio", () => {
    const { texte } = texteDit(script);
    const [a, b] = auMoins(minuter(script, regulier(texte)), 2);
    expect(a.texte).toBe("Bon. Hugo.");
    expect(a.mots.map((m) => m.t)).toEqual(["Bon.", "Hugo."]);
    expect(a.debut).toBeCloseTo(texte.indexOf("Bon.") * 0.05);
    expect(b.debut).toBeGreaterThan(a.fin - 0.001);
    expect(b.punch).toBe(true);
  });
  it("colle la ponctuation française à son mot, avec une espace insécable", () => {
    const { texte } = texteDit(script);
    const [, b] = minuter(script, regulier(texte));
    expect(b!.mots.map((m) => m.t)).toEqual(["Tu", "réponds", "«\u00a0mdr\u00a0»\u00a0?!"]);
    expect(b!.texte).toBe("Tu réponds «\u00a0mdr\u00a0»\u00a0?!");
  });
  it("tient quand l’alignement n’a pas la même longueur que le texte", () => {
    const { texte } = texteDit(script);
    const court = regulier(texte.slice(0, 30));
    const lignes = minuter(script, court);
    expect(lignes).toHaveLength(2);
    expect(lignes.flatMap((l) => l.mots).every((m, i, ms) => i === 0 || ms[i - 1]!.debut <= m.debut)).toBe(true);
  });
  it("trouve la ligne dite à un instant (la précédente reste entre deux lignes)", () => {
    const lignes = [{ debut: 0.5 }, { debut: 2 }, { debut: 4 }];
    expect(ligneA(lignes, 0)).toBe(0);
    expect(ligneA(lignes, 3)).toBe(1);
    expect(ligneA(lignes, 9)).toBe(2);
  });
});

describe("l’audio chiffré", () => {
  it("se déchiffre à l’identique, et ne se lit pas en base", () => {
    const audio = Buffer.from("fffb14c4000000000000", "hex");
    const c = chiffrerOctets(audio);
    expect(c.includes(audio)).toBe(false);
    expect(dechiffrerOctets(c).equals(audio)).toBe(true);
  });
});
