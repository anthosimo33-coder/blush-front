import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NB_CHAPITRES } from "@/contenu/chapitres";
import { FEUILLE_CONFIDENTIALITE, PROMESSE_CONV } from "@/contenu/confidentialite";
import { FAITS_LANDING } from "@/contenu/landing";

/*
 * Les promesses courtes ne disent rien que la page Confidentialité (src/app/confidentialite/ConfidentialiteScreen.tsx),
 * qui fait foi, ne dise : les faits de la landing (FAITS_LANDING) et la feuille « En savoir plus » du rapport
 * (FEUILLE_CONFIDENTIALITE). La page est lue dans sa source : les titres de ses lignes (`titre="…"`).
 */
const PAGE = readFileSync(new URL("../../src/app/confidentialite/ConfidentialiteScreen.tsx", import.meta.url), "utf8");
const TITRES_DE_LA_PAGE = [...PAGE.matchAll(/titre="([^"]+)"/g)].map((m) => m[1]);

const fait = (libelle: string) => FAITS_LANDING.find((f) => f.libelle.includes(libelle));

describe("les faits de la landing", () => {
  it("le nombre de chapitres est celui de la règle (NB_CHAPITRES)", () => {
    expect(fait("chapitres")?.valeur).toBe(String(NB_CHAPITRES));
  });

  it("ce qui est effacé après le rapport, c’est la conv brute, comme le disent la page et PROMESSE_CONV", () => {
    expect(fait("gardée après ton rapport")).toEqual({ valeur: "0", libelle: "conv brute gardée après ton rapport" });
    expect(TITRES_DE_LA_PAGE).toContain("La conv brute, effacée après ton rapport");
    expect(PROMESSE_CONV).toContain("effacée après ton rapport");
    /* Le rapport, sa fiche et le chat restent (« Ce qui reste, tant que tu le gardes ») : jamais « 0 message » */
    expect(FAITS_LANDING.map((f) => f.libelle).join(" ")).not.toMatch(/message/);
  });
});

describe("la feuille « En savoir plus » du rapport", () => {
  const lignes = [FEUILLE_CONFIDENTIALITE.chiffree, FEUILLE_CONFIDENTIALITE.effacee, FEUILLE_CONFIDENTIALITE.partage];

  it("chaque titre de la feuille se lit aussi sur la page, dans le titre de la ligne qu’il résume", () => {
    expect(TITRES_DE_LA_PAGE.length).toBeGreaterThan(5);
    for (const l of lignes) {
      expect(TITRES_DE_LA_PAGE, l.titre).toContain(l.page);
      /* « Chiffrée, lue seulement par BLUSH » : « Chiffrée » ; la suite redit « BLUSH, et seulement lui » */
      expect(l.page.toLowerCase(), l.titre).toContain(l.titre.split(",")[0]!.toLowerCase());
    }
    expect(TITRES_DE_LA_PAGE).toContain("BLUSH, et seulement lui");
  });

  it("le partage dit le lien comme l’image, et ne dit plus « seul ton verdict part » ; l’image dit ta question", () => {
    const { detail } = FEUILLE_CONFIDENTIALITE.partage;
    expect(detail).not.toContain("seul ton verdict part");
    expect(detail).toContain("ton verdict");
    expect(detail).toContain("en image");
    /* L’image d’une réponse montre aussi ta question (src/server/partages.ts), comme le dit la page */
    expect(detail).toContain("(avec ta question)");
    expect(detail).toContain("initiale");
  });
});
