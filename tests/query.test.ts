import { describe, expect, it } from "vitest";
import { depart, garderCeQuiNaPasChange, invalidate, lirePartage, renduFrais, setQueryData } from "@/lib/query";
import type { Fiche } from "@/types";

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
    const premiere = lirePartage("fiche:b", lire);
    invalidate("fiche:b");
    const seconde = lirePartage("fiche:b", lire);
    expect(await premiere).toBe(1);
    expect(await seconde).toBe(2);
  });

  it("une lecture qui échoue ne bloque pas la suivante", async () => {
    await expect(lirePartage("compte-c", () => Promise.reject(new Error("réseau")))).rejects.toThrow("réseau");
    await expect(lirePartage("compte-c", () => Promise.resolve(3))).resolves.toBe(3);
  });
});

describe("depart", () => {
  /* Une fiche que seul son résumé distingue (une version, puis une autre) */
  const fiche = (version: number): Fiche => ({
    person: { id: "p1", name: "Inès", initial: "I" },
    portrait: "",
    updatedLabel: "",
    facts: [],
    summary: `v${version}`,
    summaryShort: "",
  });

  it("le rendu serveur passe avant le cache, sauf si le cache a été écrit après lui", () => {
    setQueryData("fiche:a", fiche(2));
    /* Une page rendue avant la modification (préchargée) : on part du cache */
    expect(depart("fiche:a", fiche(1), Date.now() - 60_000)).toEqual({ valeur: fiche(2), duServeur: false });
    /* Rendue après : la page */
    expect(depart("fiche:a", fiche(3), Date.now() + 1000)).toEqual({ valeur: fiche(3), duServeur: true });
    /* Sans heure de rendu : la page, comme avant */
    expect(depart("fiche:a", fiche(1))).toEqual({ valeur: fiche(1), duServeur: true });
    /* Sans donnée du serveur : le cache */
    expect(depart("fiche:a", undefined)).toEqual({ valeur: fiche(2), duServeur: false });
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

  it("les écrans d’un même montage de page partagent le rendu ; un autre montage (la page revue) le relit", () => {
    const rendu = Date.now() - 500;
    const page = {};
    expect(renduFrais("compte-g", rendu, 10_000, page)).toBe(true);
    /* La coque et son écran, montés ensemble, lisent le même compte */
    expect(renduFrais("compte-g", rendu, 10_000, page)).toBe(true);
    /* La page revue par l’historique est montée de nouveau : un autre objet */
    expect(renduFrais("compte-g", rendu, 10_000, {})).toBe(false);
    /* Hors d’une page qui donne son montage : déjà vu, relu */
    expect(renduFrais("compte-g", rendu, 10_000)).toBe(false);
    /* Le même montage ne rend pas frais un rendu trop ancien */
    expect(renduFrais("compte-h", Date.now() - 20_000, 10_000, page)).toBe(false);
  });

  it("une invalidation après le rendu le rend périmé, même pour un écran du même montage", () => {
    const fiche: Fiche = { person: { id: "p1", name: "Inès", initial: "I" }, portrait: "", updatedLabel: "", facts: [], summary: "rendue", summaryShort: "" };
    const rendu = Date.now() - 500;
    const page = {};
    expect(renduFrais("fiche:i", rendu, 10_000, page)).toBe(true);
    /* Un geste a invalidé la donnée : un écran monté ensuite dans la même page la relit */
    invalidate("fiche:i");
    expect(depart("fiche:i", fiche, rendu)).toEqual({ valeur: fiche, duServeur: true });
    expect(renduFrais("fiche:i", rendu, 10_000, page)).toBe(false);
    /* Un rendu pris après l’invalidation, lui, est frais */
    expect(renduFrais("fiche:i", Date.now() + 1, 10_000, {})).toBe(true);
  });

  it("un rendu « dans le futur » (horloges décalées) n’est pas frais", () => {
    expect(renduFrais("rapport-e", Date.now() + 60_000, 10_000)).toBe(false);
    expect(renduFrais("rapport-f", Date.now() + 1000, 10_000)).toBe(true);
  });
});

describe("garderCeQuiNaPasChange", () => {
  it("la même réponse : l’objet d’avant lui-même (l’écran ne se re-rend pas) ; null, undefined et les valeurs simples comparés tels quels", () => {
    const a = { plan: "gratuit", chapitres: [1, 2] };
    expect(garderCeQuiNaPasChange(a, { plan: "gratuit", chapitres: [1, 2] })).toBe(a);
    expect(garderCeQuiNaPasChange(null, null)).toBeNull();
    expect(garderCeQuiNaPasChange(undefined, null)).toBeNull();
    expect(garderCeQuiNaPasChange(a, { plan: "gratuit" })).toEqual({ plan: "gratuit" });
    expect(garderCeQuiNaPasChange(a, undefined)).toBeUndefined();
  });

  it("un rapport relu pendant son écriture (PERF-3) : le temps qui reste change, les chapitres déjà écrits gardent leurs objets", () => {
    const chapitre = (n: number, texte: string) => ({ number: n, title: `Chapitre ${n}`, blocks: [{ kind: "texte", text: texte }] });
    const avant = { restant: 40, progres: 0.4, chapters: [chapitre(1, "a"), chapitre(2, "b")] };
    const apres = { restant: 30, progres: 0.6, chapters: [chapitre(1, "a"), chapitre(2, "b"), chapitre(3, "c")] };
    const r = garderCeQuiNaPasChange(avant, apres);
    expect(r).toEqual(apres);
    expect(r).not.toBe(avant);
    expect(r.chapters[0]).toBe(avant.chapters[0]);
    expect(r.chapters[1]).toBe(avant.chapters[1]);
    expect(r.chapters[2]).toBe(apres.chapters[2]);
    /* Un chapitre réécrit : neuf, ses voisins gardés */
    const reecrit = garderCeQuiNaPasChange(r, { ...apres, chapters: [chapitre(1, "a"), chapitre(2, "b2"), chapitre(3, "c")] });
    expect(reecrit.chapters[0]).toBe(r.chapters[0]);
    expect(reecrit.chapters[1]).not.toBe(r.chapters[1]);
    expect(reecrit.chapters[2]).toBe(r.chapters[2]);
    /* Une clé retirée change l’objet */
    expect(garderCeQuiNaPasChange(avant, { restant: 40, chapters: avant.chapters })).not.toBe(avant);
  });
});
