import { describe, expect, it } from "vitest";
import { depart, invalidate, lirePartage, memeValeur, renduFrais, setQueryData } from "@/lib/query";

/* Le petit cache de lecture du navigateur (src/lib/query.ts) : ce qui se décide hors de React */

describe("lirePartage", () => {
  it("deux lectures de la même clé en même temps ne partent qu’une fois", async () => {
    let appels = 0;
    const lire = () => new Promise<number>((r) => setTimeout(() => r(++appels), 5));
    const [a, b] = await Promise.all([lirePartage("compte-a", lire), lirePartage("compte-a", lire)]);
    expect(appels).toBe(1);
    expect(a).toBe(b);
    /* Une fois revenue, la lecture suivante repart */
    await lirePartage("compte-a", lire);
    expect(appels).toBe(2);
  });

  it("une invalidation pendant la lecture fait repartir la suivante du serveur", async () => {
    let appels = 0;
    const lire = () => new Promise<number>((r) => setTimeout(() => r(++appels), 5));
    const premiere = lirePartage("compte-b", lire);
    invalidate("compte-b");
    const seconde = lirePartage("compte-b", lire);
    expect(await premiere).toBe(1);
    expect(await seconde).toBe(2);
  });

  it("une lecture qui échoue ne bloque pas la suivante", async () => {
    await expect(lirePartage("compte-c", () => Promise.reject(new Error("réseau")))).rejects.toThrow("réseau");
    await expect(lirePartage("compte-c", () => Promise.resolve(3))).resolves.toBe(3);
  });
});

describe("depart", () => {
  it("le rendu serveur passe avant le cache, sauf si le cache a été écrit après lui", () => {
    setQueryData("fiche-a", { faits: 2 });
    /* Une page rendue avant la modification (préchargée) : on part du cache */
    expect(depart("fiche-a", { faits: 1 }, Date.now() - 60_000)).toEqual({ valeur: { faits: 2 }, duServeur: false });
    /* Rendue après : la page */
    expect(depart("fiche-a", { faits: 3 }, Date.now() + 1000)).toEqual({ valeur: { faits: 3 }, duServeur: true });
    /* Sans heure de rendu : la page, comme avant */
    expect(depart("fiche-a", { faits: 1 })).toEqual({ valeur: { faits: 1 }, duServeur: true });
    /* Sans donnée du serveur : le cache */
    expect(depart("fiche-a", undefined)).toEqual({ valeur: { faits: 2 }, duServeur: false });
    expect(depart("fiche-inconnue", undefined)).toEqual({ valeur: undefined, duServeur: false });
  });
});

describe("renduFrais", () => {
  it("un rendu de moins de `frais` ms dispense de relire, une seule fois", () => {
    const rendu = Date.now() - 500;
    expect(renduFrais("rapport-a", rendu, 10_000)).toBe(true);
    /* Le même rendu revu (retour par l’historique) : relu */
    expect(renduFrais("rapport-a", rendu, 10_000)).toBe(false);
  });

  it("un rendu ancien, sans heure, ou sans fraîcheur demandée est relu", () => {
    expect(renduFrais("rapport-b", Date.now() - 20_000, 10_000)).toBe(false);
    expect(renduFrais("rapport-c", undefined, 10_000)).toBe(false);
    expect(renduFrais("rapport-d", Date.now(), 0)).toBe(false);
  });

  it("un rendu « dans le futur » (horloges décalées) n’est pas frais", () => {
    expect(renduFrais("rapport-e", Date.now() + 60_000, 10_000)).toBe(false);
    expect(renduFrais("rapport-f", Date.now() + 1000, 10_000)).toBe(true);
  });
});

describe("memeValeur", () => {
  it("compare le contenu, pas l’objet", () => {
    const a = { plan: "gratuit", chapitres: [1, 2] };
    expect(memeValeur(a, { plan: "gratuit", chapitres: [1, 2] })).toBe(true);
    expect(memeValeur(a, { plan: "rapport", chapitres: [1, 2] })).toBe(false);
    expect(memeValeur(null, null)).toBe(true);
    expect(memeValeur(undefined, null)).toBe(false);
    expect(memeValeur(a, undefined)).toBe(false);
  });
});
