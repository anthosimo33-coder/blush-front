import { describe, expect, it } from "vitest";
import { detresseProbable } from "@/lib/detresse";

/*
 * Le filet des numéros d’urgence pour un message refusé faute de bulles (src/lib/detresse.ts) : ce qui fait penser à un
 * danger ou à une détresse les montre, accents, majuscules et apostrophe courbe ou pas ; les hyperboles de tous les
 * jours (celles qui faisaient des numéros sans rapport) ne les montrent pas. Les exemples sont inventés.
 */

describe("detresseProbable", () => {
  it.each([
    "j’ai envie de mourir",
    "je pense au suicide depuis hier",
    "Je veux en finir",
    "j'ai plus envie de vivre",
    "je vais me faire du mal",
    "je me scarifie encore",
    "je vais vraiment mal",
    "je fais une dépression",
    "il m’a frappée hier soir",
    "il m'a giflé devant ses potes",
    "il est violent quand il boit",
    "elle m’a violée",
    "il me menace de publier mes photos",
    "il me harcèle depuis que je l’ai bloqué",
    "il me fait peur",
    "j’ai peur de lui",
    "je suis en danger",
    "AU SECOURS",
    "je vais appeler la police",
    "i want to kill myself",
  ])("« %s » : les numéros", (texte) => {
    expect(detresseProbable(texte)).toBe(true);
  });

  it.each([
    "je meurs 😭",
    "ça me tue ce mec",
    "tu me tues mdr",
    "il va me jeter c’est sûr",
    "j’ai peur qu’il me ghoste",
    "je suis morte de rire",
    "elle avait une robe violette",
    "il joue du violon",
    "il m’a mis un vent",
    "et maintenant ?",
    "il m’a dit on verra pour dimanche, ça veut dire non ?",
    "son « BONNE NUITTTTT » en majuscules, c’était pour moi ?",
    "",
  ])("« %s » : pas de numéros", (texte) => {
    expect(detresseProbable(texte)).toBe(false);
  });
});
