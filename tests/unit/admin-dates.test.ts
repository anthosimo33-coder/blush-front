import { describe, expect, it } from "vitest";
import { datesDeLaPeriode, periodeGardee } from "@/app/admin/dates";

/*
 * Les dates d’une période du pilotage, en toutes lettres (src/app/admin/dates.ts) : une période choisie au calendrier
 * couvre des jours de Paris entiers, les trois d’office glissent jusqu’à maintenant et disent leur heure ; chacune dit la
 * période d’avant, de même durée.
 */

/* Mardi 13 octobre 2026, 16:05 à Paris */
const LE = "2026-10-13T14:05:00.000Z";

describe("une période choisie au calendrier : des jours entiers", () => {
  it("dans un seul mois, jusqu’à aujourd’hui : le mois une fois, et le jour en cours", () => {
    expect(datesDeLaPeriode({ le: LE, jours: 7, plage: { du: "2026-10-07", au: "2026-10-13" } })).toEqual({
      periode: "Du mer. 7 au mar. 13 octobre, aujourd’hui en cours",
      avant: "à la période du mer. 30 sept. au mar. 6 oct.",
    });
  });

  it("à cheval sur deux mois, finie : les deux mois, sans jour en cours", () => {
    expect(datesDeLaPeriode({ le: LE, jours: 7, plage: { du: "2026-09-28", au: "2026-10-04" } })).toEqual({
      periode: "Du lun. 28 septembre au dim. 4 octobre",
      avant: "à la période du lun. 21 au dim. 27 sept.",
    });
  });

  it("un seul jour se compare à sa veille ; le premier du mois s’écrit « 1er »", () => {
    expect(datesDeLaPeriode({ le: LE, jours: 1, plage: { du: "2026-10-12", au: "2026-10-12" } })).toEqual({
      periode: "Le lun. 12 octobre",
      avant: "à la veille, dim. 11 oct.",
    });
    expect(datesDeLaPeriode({ le: LE, jours: 1, plage: { du: "2026-10-01", au: "2026-10-01" } }).periode).toBe("Le jeu. 1er octobre");
    expect(datesDeLaPeriode({ le: LE, jours: 1, plage: { du: "2026-10-13", au: "2026-10-13" } }).periode).toBe("Le mar. 13 octobre, aujourd’hui en cours");
  });
});

describe("les trois périodes d’office : des fenêtres qui glissent jusqu’à maintenant", () => {
  it("7 jours : depuis il y a 7 fois 24 h, à la même heure, contre les 7 jours d’avant", () => {
    expect(datesDeLaPeriode({ le: LE, jours: 7 })).toEqual({
      periode: "Du mar. 6 oct. à 16:05 jusqu’à maintenant",
      avant: "aux 7 jours d’avant, depuis le mar. 29 sept.",
    });
  });

  it("30 jours", () => {
    expect(datesDeLaPeriode({ le: LE, jours: 30 })).toEqual({
      periode: "Du dim. 13 sept. à 16:05 jusqu’à maintenant",
      avant: "aux 30 jours d’avant, depuis le ven. 14 août",
    });
  });

  it("24 h : depuis hier à la même heure", () => {
    expect(datesDeLaPeriode({ le: LE, jours: 1 })).toEqual({ periode: "Depuis hier 16:05", avant: "aux 24\u00a0h d’avant" });
  });
});

describe("la période gardée dans l’adresse, d’une rubrique à l’autre", () => {
  it("rien pour les 7 jours d’office, « p= » pour les deux autres, « du=&au= » pour des dates choisies", () => {
    expect(periodeGardee({ jours: 7 })).toBe("");
    expect(periodeGardee({ jours: 30 })).toBe("p=30");
    expect(periodeGardee({ jours: 1 })).toBe("p=1");
    expect(periodeGardee({ jours: 7, plage: { du: "2026-10-01", au: "2026-10-07" } })).toBe("du=2026-10-01&au=2026-10-07");
  });
});
