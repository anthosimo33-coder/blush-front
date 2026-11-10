import { describe, expect, it } from "vitest";
import { nomDeLaPlage, nomsDeLaPeriode, raccourciDe, raccourcis } from "@/app/admin/periodes";
import { caseNommee } from "@/app/admin/calculs";
import { estUnJour, joursDeLaPlage, plageDAvant, plageLue, plusJours, repereDe } from "@/lib/jours";

/*
 * Les périodes du pilotage (src/app/admin/periodes.ts, src/lib/jours.ts) : une période choisie au calendrier se lit dans
 * l’adresse (`?du=&au=`), en jours de Paris entiers ; ses noms, sa période d’avant, et les raccourcis du sélecteur.
 */

describe("une période lue dans l’adresse", () => {
  const bornes = { premier: "2026-10-13", dernier: "2026-11-09" };

  it("deux vrais jours, dans l’ordre, entre le lancement et aujourd’hui", () => {
    expect(plageLue("2026-10-20", "2026-11-02", bornes)).toEqual({ du: "2026-10-20", au: "2026-11-02" });
    expect(plageLue("2026-11-09", "2026-11-09", bornes)).toEqual({ du: "2026-11-09", au: "2026-11-09" });
  });

  it("rien pour une période à l’envers, hors des bornes, mal écrite ou absente", () => {
    expect(plageLue("2026-11-02", "2026-10-20", bornes)).toBeNull();
    expect(plageLue("2026-10-12", "2026-10-20", bornes)).toBeNull();
    expect(plageLue("2026-10-20", "2026-11-10", bornes)).toBeNull();
    expect(plageLue("20/10/2026", "2026-11-02", bornes)).toBeNull();
    expect(plageLue(undefined, "2026-11-02", bornes)).toBeNull();
    expect(plageLue(["2026-10-20"], "2026-11-02", bornes)).toBeNull();
  });

  it("un jour s’écrit AAAA-MM-JJ et existe : ni le 30 février, ni un bout de requête", () => {
    expect(estUnJour("2026-02-28")).toBe(true);
    expect(estUnJour("2026-02-30")).toBe(false);
    expect(estUnJour("2026-13-01")).toBe(false);
    expect(estUnJour("2026-10-20'; drop table achats; --")).toBe(false);
    expect(estUnJour(20261020)).toBe(false);
  });
});

describe("le calcul sur les jours", () => {
  it("compte sur le calendrier, d’un mois à l’autre et par-dessus le changement d’heure du 25 octobre", () => {
    expect(plusJours("2026-10-31", 1)).toBe("2026-11-01");
    expect(plusJours("2026-10-26", -2)).toBe("2026-10-24");
    expect(joursDeLaPlage({ du: "2026-10-20", au: "2026-11-02" })).toBe(14);
    expect(joursDeLaPlage({ du: "2026-11-09", au: "2026-11-09" })).toBe(1);
  });

  it("la période d’avant a la même durée, et finit la veille", () => {
    expect(plageDAvant({ du: "2026-10-20", au: "2026-11-02" })).toEqual({ du: "2026-10-06", au: "2026-10-19" });
    expect(plageDAvant({ du: "2026-11-09", au: "2026-11-09" })).toEqual({ du: "2026-11-08", au: "2026-11-08" });
  });

  it("le repère d’une période choisie : un jour comme 24 h, jusqu’à 13 jours comme 7, au-delà comme 30", () => {
    expect(repereDe({ du: "2026-11-09", au: "2026-11-09" })).toBe(1);
    expect(repereDe({ du: "2026-11-03", au: "2026-11-09" })).toBe(7);
    expect(repereDe({ du: "2026-10-28", au: "2026-11-09" })).toBe(7);
    expect(repereDe({ du: "2026-10-27", au: "2026-11-09" })).toBe(30);
  });
});

describe("les noms d’une période", () => {
  it("en peu de place : un jour, un même mois, deux mois", () => {
    expect(nomDeLaPlage({ du: "2026-10-20", au: "2026-10-20" })).toBe("20 oct.");
    expect(nomDeLaPlage({ du: "2026-10-20", au: "2026-10-27" })).toBe("20 – 27 oct.");
    expect(nomDeLaPlage({ du: "2026-10-28", au: "2026-11-01" })).toBe("28 oct. – 1er nov.");
  });

  it("« sur » et « vs » : ceux de la fenêtre d’office, ou ceux des jours choisis", () => {
    expect(nomsDeLaPeriode({ jours: 7 })).toEqual({ lien: "7 jours", sur: "sur 7\u00a0jours", contre: "vs les 7\u00a0jours d’avant" });
    expect(nomsDeLaPeriode({ jours: 30, plage: { du: "2026-10-20", au: "2026-11-02" } })).toEqual({
      lien: "20 oct. – 2 nov.",
      sur: "du 20 oct. au 2 nov.",
      contre: "vs les 14\u00a0jours d’avant",
    });
    expect(nomsDeLaPeriode({ jours: 7, plage: { du: "2026-11-01", au: "2026-11-07" } }).sur).toBe("du 1er au 7 nov.");
    expect(nomsDeLaPeriode({ jours: 1, plage: { du: "2026-11-08", au: "2026-11-08" } })).toEqual({ lien: "8 nov.", sur: "le 8 nov.", contre: "vs la veille" });
  });
});

describe("les raccourcis du sélecteur", () => {
  const liste = raccourcis("2026-11-09", "2026-10-13");
  const de = (cle: string) => liste.find((r) => r.cle === cle)!;

  it("les fenêtres d’office gardent leur adresse (?p=), les autres sont des jours entiers", () => {
    expect(liste.map((r) => r.cle)).toEqual(["24h", "aujourdhui", "hier", "7j", "30j", "mois", "mois-dernier", "lancement"]);
    expect([de("24h").p, de("7j").p, de("30j").p]).toEqual([1, 7, 30]);
    expect(de("hier").plage).toEqual({ du: "2026-11-08", au: "2026-11-08" });
    expect(de("mois").plage).toEqual({ du: "2026-11-01", au: "2026-11-09" });
    expect(de("lancement").plage).toEqual({ du: "2026-10-13", au: "2026-11-09" });
  });

  it("rien ne commence avant le lancement : le mois dernier et les 30 jours s’y arrêtent", () => {
    expect(de("mois-dernier").plage).toEqual({ du: "2026-10-13", au: "2026-10-31" });
    expect(de("30j").plage.du).toBe("2026-10-13");
    /* Le jour du lancement : ni veille, ni mois d’avant */
    expect(raccourcis("2026-10-13", "2026-10-13").map((r) => r.cle)).toEqual(["24h", "aujourdhui", "7j", "30j", "mois", "lancement"]);
  });

  it("le raccourci affiché : par sa fenêtre, ou par ses jours ; aucun pour d’autres dates", () => {
    expect(raccourciDe(liste, { jours: 7 })?.cle).toBe("7j");
    expect(raccourciDe(liste, { jours: 1, plage: { du: "2026-11-08", au: "2026-11-08" } })?.cle).toBe("hier");
    expect(raccourciDe(liste, { jours: 7, plage: { du: "2026-10-20", au: "2026-10-27" } })).toBeUndefined();
  });
});

describe("les noms sous un graphique de plus de 35 cases", () => {
  it("huit noms au plus, la dernière case toujours nommée", () => {
    const nommees = (n: number) => Array.from({ length: n }, (_, k) => caseNommee(k, n)).filter(Boolean).length;
    expect(nommees(60)).toBeLessThanOrEqual(8);
    expect(nommees(90)).toBeLessThanOrEqual(8);
    expect(caseNommee(59, 60)).toBe(true);
    expect(nommees(30)).toBe(6);
  });
});
