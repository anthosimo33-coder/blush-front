import { describe, expect, it } from "vitest";
import type { JourneyState } from "@/state/journey";
import { quiComplet, reponsesQui, vientDeCaptures } from "@/state/parcours";

/* Le parcours d’un onglet, « Qui es-tu ? » rempli sur un export */
const EXPORT: JourneyState = {
  app: "whatsapp",
  exportApp: "whatsapp",
  exportFileName: "Discussion WhatsApp avec Léa.zip",
  capturesAdded: false,
  me: "p1",
  pronom: "il",
  prenom: "",
  guess: "vus",
  goal: "ensemble",
  email: "tom@e2e.blush.test",
};
/* Le même, sur une conv de captures : l’export s’efface, tu es « Moi » (p0) */
const CAPTURES: JourneyState = { ...EXPORT, app: "instagram", exportFileName: null, me: "p0" };

describe("« Qui es-tu ? » complet (quiComplet)", () => {
  it("sur un export : qui est toi, ton pronom, ta devinette, ce que tu veux", () => {
    expect(quiComplet(EXPORT, { captures: false })).toBe(true);
    for (const manque of ["me", "pronom", "guess", "goal"] as const) expect(quiComplet({ ...EXPORT, [manque]: null }, { captures: false })).toBe(false);
  });

  it("sur des captures : ton prénom en plus (des espaces ne comptent pas)", () => {
    expect(quiComplet(CAPTURES, { captures: true })).toBe(false);
    expect(quiComplet({ ...CAPTURES, prenom: "  " }, { captures: true })).toBe(false);
    expect(quiComplet({ ...CAPTURES, prenom: "Tom" }, { captures: true })).toBe(true);
  });

  it("après le code, une conv de captures sans prénom renvoie à « Qui es-tu ? », comme l’écran", () => {
    expect(vientDeCaptures(CAPTURES)).toBe(true);
    expect(quiComplet(CAPTURES, { captures: vientDeCaptures(CAPTURES) })).toBe(false);
    /* Des captures ajoutées à un export : la conv reste un export */
    const ajout: JourneyState = { ...EXPORT, capturesAdded: true };
    expect(vientDeCaptures(ajout)).toBe(false);
    expect(quiComplet(EXPORT, { captures: vientDeCaptures(EXPORT) })).toBe(true);
  });
});

describe("les réponses qui lancent la lecture (reponsesQui)", () => {
  it("reprennent le parcours, le prénom seulement s’il est écrit", () => {
    const captures = { ...CAPTURES, prenom: " Tom " };
    if (!quiComplet(captures, { captures: true }) || !quiComplet(EXPORT, { captures: false })) throw new Error("parcours incomplet");
    expect(reponsesQui(captures)).toEqual({ me: "p0", pronom: "il", guess: "vus", goal: "ensemble", prenom: "Tom" });
    expect(reponsesQui(EXPORT)).toEqual({ me: "p1", pronom: "il", guess: "vus", goal: "ensemble", prenom: null });
  });
});
