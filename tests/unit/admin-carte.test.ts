import { describe, expect, it } from "vitest";
import { BELGIQUE, CORSE, dedans, diametreDe, FRANCE, HAUTEUR, LARGEUR, placerLesVilles, pointsDeLaCarte, projeter, SUISSE } from "@/app/admin/carte-de-france";
import { directDExemple } from "@/app/apercu/admin/exemple";
import type { Direct } from "@/types/api";

/*
 * La carte d’/admin en direct (src/app/admin/carte-de-france.ts) : la projection et son cadre, les pays en points, et
 * les villes posées dessus (les bulles, leurs étiquettes, « Hors carte »).
 */

/** Une ville du direct. */
const ville = (nom: string | null, lat: number | null, lon: number | null, n = 1): Direct["villes"][number] => ({ ville: nom, pays: null, lat, lon, n });
/** Si une longitude et une latitude tombent dans la boîte de la carte. */
const dansLeCadre = (lon: number, lat: number) => {
  const [x, y] = projeter(lon, lat);
  return x >= 0 && x <= LARGEUR && y >= 0 && y <= HAUTEUR;
};

describe("la projection et les pays", () => {
  it("le coin haut gauche de la carte est à 5,2° ouest et 51,6° nord ; les longitudes sont resserrées", () => {
    expect(projeter(-5.2, 51.6)).toEqual([0, 0]);
    const [x, y] = projeter(2.35, 48.86);
    expect(x).toBeCloseTo(5.217, 2);
    expect(y).toBeCloseTo(2.74, 2);
  });

  it("la France, la Corse, Bruxelles et Genève sont dans le cadre ; Montréal, Rome et Lisbonne non", () => {
    for (const [lon, lat] of [
      [2.35, 48.86],
      [9.15, 42.15],
      [-4.48, 48.39],
      [7.26, 43.7],
      [4.35, 50.85],
      [6.14, 46.2],
    ] as const)
      expect(dansLeCadre(lon, lat), `${lon}, ${lat}`).toBe(true);
    for (const [lon, lat] of [
      [-73.57, 45.5],
      [12.5, 41.9],
      [-9.14, 38.72],
    ] as const)
      expect(dansLeCadre(lon, lat), `${lon}, ${lat}`).toBe(false);
  });

  it("un point est dans son pays, et pas dans celui d’à côté", () => {
    expect(dedans(FRANCE, 2.35, 48.86)).toBe(true);
    expect(dedans(FRANCE, 4.35, 50.85)).toBe(false);
    expect(dedans(BELGIQUE, 4.35, 50.85)).toBe(true);
    expect(dedans(SUISSE, 7.45, 46.95)).toBe(true);
    expect(dedans(CORSE, 9.0, 42.1)).toBe(true);
    expect(dedans(FRANCE, -3, 45)).toBe(false);
    expect(dedans([], 0, 0)).toBe(false);
  });

  it("les points de la carte : des centaines pour la France, moins pour ses voisins, calculés une fois", () => {
    const carte = pointsDeLaCarte();
    expect(carte.points.france).toBeGreaterThan(500);
    expect(carte.points.voisins).toBeGreaterThan(30);
    expect(carte.points.voisins).toBeLessThan(carte.points.france);
    /* Un point : un trait de longueur nulle, dans la boîte */
    expect(carte.france.match(/M/g)).toHaveLength(carte.points.france);
    for (const [, x, y] of carte.france.matchAll(/M([\d.]+) ([\d.]+)h0/g)) {
      expect(Number(x)).toBeLessThanOrEqual(LARGEUR);
      expect(Number(y)).toBeLessThanOrEqual(HAUTEUR);
    }
    expect(pointsDeLaCarte()).toBe(carte);
  });
});

describe("les villes sur la carte", () => {
  it("l’exemple du direct : dix villes sur la carte, Montréal hors carte", () => {
    const { placees, horsCarte } = placerLesVilles(directDExemple().villes);
    expect(placees.map((v) => v.nom)).toEqual(["Paris", "Lyon", "Marseille", "Bordeaux", "Lille", "Toulouse", "Bruxelles", "Nantes", "Genève", "Nice"]);
    expect(horsCarte).toEqual([{ nom: "Montréal", n: 1 }]);
    for (const v of placees) {
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.x).toBeLessThanOrEqual(100);
      expect(v.y).toBeGreaterThanOrEqual(0);
      expect(v.y).toBeLessThanOrEqual(100);
    }
  });

  it("une ville sans coordonnées, ou inconnue, va dans « Hors carte » ; une ville inconnue s’appelle « Ville inconnue »", () => {
    const { placees, horsCarte } = placerLesVilles([ville(null, null, null, 3), ville("Quelque part", null, 2), ville("Paris", 48.86, 2.35, 2)]);
    expect(horsCarte).toEqual([
      { nom: "Ville inconnue", n: 3 },
      { nom: "Quelque part", n: 1 },
    ]);
    expect(placees.map((v) => v.nom)).toEqual(["Paris"]);
  });

  it("la bulle grossit avec le nombre ; l’étiquette, à partir de deux personnes", () => {
    expect(diametreDe(1)).toBe(13);
    expect(diametreDe(4)).toBe(18);
    expect(diametreDe(0)).toBe(13);
    const { placees } = placerLesVilles([ville("Paris", 48.86, 2.35, 9), ville("Nantes", 47.22, -1.55, 1)]);
    expect(placees.map((v) => [v.nom, v.diametre, v.etiquette])).toEqual([
      ["Paris", 23, true],
      ["Nantes", 13, false],
    ]);
  });

  it("une étiquette va à droite, à gauche dans l’est de la carte", () => {
    expect(placerLesVilles([ville("Brest", 48.39, -4.48, 2)]).placees[0]?.cote).toBe("d");
    expect(placerLesVilles([ville("Strasbourg", 48.58, 7.75, 2)]).placees[0]?.cote).toBe("g");
  });

  it("deux villes proches : la seconde étiquette change de côté plutôt que de cacher la première", () => {
    /* Paris d’abord (la plus grosse) à droite ; Versailles, juste à l’ouest, ne peut pas aller à droite sans la couvrir */
    const { placees } = placerLesVilles([ville("Paris", 48.86, 2.35, 6), ville("Versailles", 48.8, 2.13, 2)], 620);
    expect(placees.find((v) => v.nom === "Paris")?.cote).toBe("d");
    expect(placees.find((v) => v.nom === "Versailles")?.cote).not.toBe("d");
    expect(placees.every((v) => v.etiquette)).toBe(true);
  });

  it("sur une carte étroite, une étiquette qui en cacherait une autre se tait (la bulle reste)", () => {
    const serrees = [
      ville("Paris", 48.86, 2.35, 6),
      ville("Saint-Denis", 48.94, 2.36, 3),
      ville("Montreuil", 48.86, 2.44, 3),
      ville("Boulogne", 48.84, 2.24, 3),
      ville("Vincennes", 48.85, 2.44, 2),
    ];
    const { placees } = placerLesVilles(serrees, 300);
    expect(placees).toHaveLength(5);
    expect(placees.find((v) => v.nom === "Paris")?.etiquette).toBe(true);
    expect(placees.some((v) => !v.etiquette)).toBe(true);
  });
});
