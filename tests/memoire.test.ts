import { describe, expect, it } from "vitest";
import { appliquerMaj } from "@prompts/lib/memoire";
import type { Maj, Memoire } from "@prompts/lib/schemas";

const etat: Memoire = {
  alerte: null,
  rien_de_neuf: false,
  memoire: {
    ou_on_en_est: "Vus deux fois.",
    moments: [{ quand: "2026-04-21", quoi: "Premier verre.", preuves: ["m0088"] }],
    son_mode: [{ texte: "Vanne après un mot doux.", preuves: ["m0290"] }],
    ton_mode: [],
    conseils: [{ quand: "2026-05-12", conseil: "Samedi soir.", suite: "en_attente", resultat: null }],
    a_venir: [{ date: "2026-05-16", quoi: "Son partiel." }],
  },
  fiche: { portrait: "la Taquine", phrase: "Son partiel samedi", phrase_courte: "Partiel samedi", faits: [{ section: "dates", texte: "Partiel le 16 mai", preuves: ["m0100"], statut: "nouveau" }] },
  niveau: { niveau: "voit", tendance: null, pourquoi: "vus deux fois", preuves: [] },
  questions: ["a", "b", "c", "d"],
};
const vide: Maj = {
  alerte: null,
  rien_de_neuf: false,
  ou_on_en_est: null,
  moments_ajoutes: [],
  son_mode: null,
  ton_mode: null,
  conseils: null,
  a_venir: null,
  faits_ajoutes: [],
  faits_retires: [],
  portrait: null,
  phrase: null,
  phrase_courte: null,
  niveau: null,
  questions: null,
};

describe("mise à jour de la mémoire (seulement ce qui change)", () => {
  it("garde tout ce que la mise à jour ne touche pas", () => {
    expect(appliquerMaj(etat, vide).memoire).toEqual(etat.memoire);
    expect(appliquerMaj(etat, { ...vide, rien_de_neuf: true })).toBe(etat);
  });
  it("ajoute les moments, remplace une info, vide « à venir », change le niveau", () => {
    const e = appliquerMaj(etat, {
      ...vide,
      moments_ajoutes: [{ quand: "2026-05-17", quoi: "Ils se le disent.", preuves: [] }],
      faits_ajoutes: [{ section: "dates", texte: "Partiel déplacé au 23 mai", preuves: [] }],
      faits_retires: ["partiel le 16 mai"],
      a_venir: [],
      niveau: { niveau: "ensemble", tendance: "↗", pourquoi: "il le dit", preuves: [] },
    });
    expect(e.memoire!.moments.map((m) => m.quand)).toEqual(["2026-04-21", "2026-05-17"]);
    expect(e.fiche!.faits.map((f) => [f.texte, f.statut])).toEqual([["Partiel déplacé au 23 mai", "nouveau"]]);
    expect(e.memoire!.a_venir).toEqual([]);
    expect(e.niveau!.niveau).toBe("ensemble");
    expect(e.questions).toEqual(etat.questions);
  });
});
