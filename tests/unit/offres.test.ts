import { describe, expect, it } from "vitest";
import { bullesDe, CATALOGUE, COUT_EN_BULLES, enEuros, FORMULE_CHOISIE, OFFERS, PREMIERE_RECHARGE, prixDe } from "@/contenu/offres";
import { FORMULES, OFFRES } from "@/types";

/*
 * Le catalogue (src/contenu/offres.ts), tel que l’utilisateur l’a décidé le 12 octobre : les prix TTC, les bulles que
 * chaque offre donne, ce qui débloque une conv, les offres uniques. Le serveur fait payer ces prix-là et rien d’autre :
 * un prix qui change change ici d’abord.
 */
describe("le catalogue", () => {
  it.each<[string, number, number | null, number, boolean, string | null]>([
    ["rapport", 990, null, 10, true, null],
    ["premium", 1490, 1980, 90, true, null],
    ["suite", 690, 990, 10, true, "suite"],
    ["premium_ajout", 500, 990, 80, false, "premium_ajout"],
    ["pack30", 490, null, 30, false, null],
    ["pack80", 990, null, 80, false, null],
    ["pack200", 1990, null, 200, false, null],
  ])("%s : %i centimes (barré %s), %i bulles, conv %s, offre unique %s", (id, centimes, barre, bulles, conv, unique) => {
    expect(CATALOGUE[id as keyof typeof CATALOGUE]).toMatchObject({ id, centimes, barre, bulles, conv, unique });
  });

  it("chaque offre du vocabulaire est au catalogue, sous son id", () => {
    expect(Object.keys(CATALOGUE).sort()).toEqual([...OFFRES].sort());
  });

  it("la première recharge : +40 bulles sur le pack conseillé, et sur lui seul", () => {
    expect(bullesDe("pack80", { premiereRecharge: true })).toBe(120);
    expect(bullesDe("pack80")).toBe(80);
    expect(bullesDe("pack200", { premiereRecharge: true })).toBe(200);
    expect(PREMIERE_RECHARGE).toEqual({ offre: "pack80", bonus: 40 });
  });

  it("une bulle par réponse écrite, deux en vocal, trois avec des captures ou un export", () => {
    expect(COUT_EN_BULLES).toEqual({ reponse: 1, vocal: 2, ajout: 3 });
  });

  it("les prix s’écrivent à la française, l’insécable avant €", () => {
    expect(enEuros(990)).toBe("9,90\u00a0€");
    expect(enEuros(500)).toBe("5,00\u00a0€");
    expect(prixDe("premium")).toBe("14,90\u00a0€");
  });

  it("la feuille du paiement : le rapport seul, puis Premium, choisie d’avance", () => {
    expect(OFFERS.map((o) => [o.id, o.price, o.recommended])).toEqual([
      ["rapport", "9,90\u00a0€", false],
      ["premium", "14,90\u00a0€", true],
    ]);
    expect(FORMULE_CHOISIE).toBe("premium");
    expect(OFFERS.map((o) => o.id)).toEqual([...FORMULES]);
  });
});
