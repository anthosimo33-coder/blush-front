import { describe, expect, it } from "vitest";
import { joursCouverts } from "@/server/temps";

/*
 * La durée d’une conv (joursCouverts, src/server/temps.ts) : les jours de son calendrier, du premier au dernier compris.
 * La lecture et le verdict la disent tous deux : avant, l’un comptait « 4 jours » et l’autre « 3 » pour la même conv.
 */
describe("les jours qu’une conv couvre", () => {
  it("compte le premier et le dernier jour", () => {
    expect(joursCouverts("2026-09-04", "2026-09-07")).toBe(4);
    expect(joursCouverts("2026-09-04", "2026-09-05")).toBe(2);
    expect(joursCouverts("2026-09-04", "2026-09-04")).toBe(1);
  });

  it("passe les mois, les années, et le changement d’heure sans perdre ni gagner de jour", () => {
    expect(joursCouverts("2026-08-30", "2026-09-02")).toBe(4);
    expect(joursCouverts("2025-12-31", "2026-01-01")).toBe(2);
    /* Le passage à l’heure d’hiver (le 25 octobre 2026) : un jour de 25 heures à Paris, un jour comme un autre ici */
    expect(joursCouverts("2026-10-24", "2026-10-26")).toBe(3);
    expect(joursCouverts("2026-03-28", "2026-03-30")).toBe(3);
    expect(joursCouverts("2024-02-28", "2024-03-01")).toBe(3);
  });

  it("lit un moment entier par son jour, et ne rend jamais moins d’un jour", () => {
    expect(joursCouverts("2026-09-04T23:59:00.000Z", "2026-09-05T00:01:00.000Z")).toBe(2);
    /* Dans le désordre, ou illisible : un jour, plutôt qu’une durée négative ou NaN à l’écran */
    expect(joursCouverts("2026-09-07", "2026-09-04")).toBe(1);
    expect(joursCouverts("", "2026-09-04")).toBe(1);
  });
});
