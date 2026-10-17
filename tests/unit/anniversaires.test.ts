import { describe, expect, it } from "vitest";
import { dateDAnniversaire, prochainAnniversaire } from "@/server/anniversaires";

/*
 * Les anniversaires notés dans une fiche (S8, src/server/anniversaires.ts) : seulement une date entière (jour et mois),
 * dans un fait qui parle d’anniversaire ou de naissance ; et le prochain, vu de Paris.
 */

describe("l’anniversaire d’un fait de la fiche", () => {
  it.each([
    ["Son anniversaire : le 23 mars", { jour: 23, mois: 3 }],
    ["anniv le 1er mai", { jour: 1, mois: 5 }],
    ["Née le 3 sept. 2004", { jour: 3, mois: 9 }],
    ["Son anniv, c’est le 15 août", { jour: 15, mois: 8 }],
    ["Anniversaire 07/12", { jour: 7, mois: 12 }],
    ["Né le 29.02.2004", { jour: 29, mois: 2 }],
    ["Son anniv tombe le 12 Février", { jour: 12, mois: 2 }],
  ])("« %s »", (texte, attendu) => expect(dateDAnniversaire(texte)).toEqual(attendu));

  it.each([
    "Son anniv est en mars",
    "Il aime le ciné, surtout le 23 mars",
    "Ciné samedi 12 avec ses potes",
    "Son anniv : le 31 avril",
    "anniv le 23",
    "Il ne le dit pas, le 2 juin",
  ])("« %s » : rien", (texte) => expect(dateDAnniversaire(texte)).toBeNull());

  it("le prochain, vu de Paris : dans combien de jours, et comment le dire", () => {
    /* Le lundi 19 octobre 2026, 23 h 30 à Paris (21 h 30 UTC) : le jeudi 22 est dans trois jours */
    const lundiSoir = new Date("2026-10-19T21:30:00Z");
    expect(prochainAnniversaire({ jour: 22, mois: 10 }, lundiSoir)).toEqual({ dans: 3, annee: 2026, jour: "jeudi", date: "jeudi 22" });
    /* Le mardi, minuit passé à Paris (22 h 30 UTC le lundi) : plus que deux jours */
    expect(prochainAnniversaire({ jour: 22, mois: 10 }, new Date("2026-10-19T22:30:00Z")).dans).toBe(2);
    /* Passé cette année : l’an prochain */
    expect(prochainAnniversaire({ jour: 1, mois: 1 }, lundiSoir)).toMatchObject({ annee: 2027, dans: 74 });
  });
});
