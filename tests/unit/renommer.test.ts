import { describe, expect, it } from "vitest";
import { renommer } from "@/lib/renommer";

describe("renommer : le prénom de la source devient celui de la prise", () => {
  it("un mot entier, tel quel, en capitales ou en minuscules, à toute profondeur ; le reste ne bouge pas", () => {
    const lecture = {
      titre: "Lorena. Assieds-toi, ma belle.",
      chapitres: [{ texte: "LORENA, écoute : Mehdi t’a dit « moi aussi »." }, { texte: "lorena relance, Lorenzo répond, Lorenaise non." }],
      lignes: ["m0412 2026-09-28 dim. 23:41 Lorena : tu deviens fatigante ?"],
      nombre: 6084,
      vide: null,
    };
    expect(renommer(lecture, "Lorena", "Juliette")).toEqual({
      titre: "Juliette. Assieds-toi, ma belle.",
      chapitres: [{ texte: "JULIETTE, écoute : Mehdi t’a dit « moi aussi »." }, { texte: "juliette relance, Lorenzo répond, Lorenaise non." }],
      lignes: ["m0412 2026-09-28 dim. 23:41 Juliette : tu deviens fatigante ?"],
      nombre: 6084,
      vide: null,
    });
  });

  it("les accents comptent pour un mot ; le même prénom, ou aucun, ne change rien", () => {
    expect(renommer("Léa et Léandre", "Léa", "Inès")).toBe("Inès et Léandre");
    const v = { a: "Kelly" };
    expect(renommer(v, "Kelly", "Kelly")).toBe(v);
    expect(renommer(v, "", "Juliette")).toBe(v);
  });
});
