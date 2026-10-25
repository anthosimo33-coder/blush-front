import { describe, expect, it } from "vitest";
import {
  bullesDeLAvance,
  CATALOGUE,
  COUT_EN_BULLES,
  enEuros,
  FORMULE_CHOISIE,
  GRILLE_DU_23_OCTOBRE,
  PACKS_DE_BULLES,
  PASSAGES_EN_PREMIUM,
  prixDe,
  RAPPORT_D_AVANCE,
  TITRE_MAX_CHEZ_WHOP,
  titreChezWhop,
} from "@/contenu/offres";
import { DEBLOQUE, FEUILLE_FORMULE, OFFRE_PREMIUM_AJOUT, OFFRE_SUITE, PAYWALL, PIED_GRATUIT } from "@/contenu/paiement";
import { PACK_CONSEILLE, PACKS } from "@/contenu/recharge";
import { bullesDuLot } from "@/contenu/roue";
import { FORMULES, LOTS_DE_LA_ROUE, OFFRES } from "@/types";

/*
 * Le catalogue (src/contenu/offres.ts), tel que l’utilisateur l’a décidé (la grille du 23 octobre 2026, marge visée à
 * 80 %) : les prix TTC, les bulles que chaque offre donne, ce qui débloque une conv, les offres uniques. Le serveur fait
 * payer ces prix-là et rien d’autre : un prix qui change change ici d’abord.
 */
describe("le catalogue", () => {
  it.each<[string, number, number | null, number, boolean, string | null]>([
    ["rapport", 990, null, 3, true, null],
    ["premium", 1990, 2480, 25, true, null],
    ["suite", 690, 990, 3, true, "suite"],
    ["rapport_garde", 495, 990, 3, true, "garde_second"],
    ["passe_premium", 690, 1000, 22, false, "premium_ajout"],
    ["second", 495, 990, 0, false, "second_rapport"],
    ["pack10", 690, null, 10, false, null],
    ["pack25", 1490, null, 25, false, null],
    ["pack60", 3490, null, 60, false, null],
  ])("%s : %i centimes (barré %s), %i bulles, conv %s, offre unique %s", (id, centimes, barre, bulles, conv, unique) => {
    expect(CATALOGUE[id as keyof typeof CATALOGUE]).toMatchObject({ id, centimes, barre, bulles, conv, unique, enVente: true });
  });

  it("les prix barrés et ③ se tirent du rapport, du pack de 25 et de Premium", () => {
    expect(CATALOGUE.premium.barre).toBe(CATALOGUE.rapport.centimes + CATALOGUE.pack25.centimes);
    expect(CATALOGUE.passe_premium.barre).toBe(CATALOGUE.premium.centimes - CATALOGUE.rapport.centimes);
    expect(CATALOGUE.rapport.bulles + CATALOGUE.passe_premium.bulles).toBe(CATALOGUE.premium.bulles);
  });

  /* Les achats passés les portent : leur titre (Mon compte, /admin, le MCP), et une commande d’avant qui se livre */
  it.each<[string, number, number | null, number, string | null, string]>([
    ["premium_ajout", 500, 1390, 80, "premium_ajout", "80 bulles en plus"],
    ["pack30", 890, null, 30, null, "30 bulles"],
    ["pack80", 1390, null, 80, null, "80 bulles"],
    ["pack200", 2390, null, 200, null, "200 bulles"],
  ])("%s, retirée de la vente le 23 octobre, reste au catalogue telle qu’elle se vendait", (id, centimes, barre, bulles, unique, titre) => {
    expect(CATALOGUE[id as keyof typeof CATALOGUE]).toMatchObject({ id, centimes, barre, bulles, unique, titre, enVente: false });
  });

  it("les recharges en vente, le conseillé, et toutes celles qu’un achat peut porter", () => {
    expect([...PACKS]).toEqual(["pack10", "pack25", "pack60"]);
    expect(PACK_CONSEILLE).toBe("pack25");
    expect(PACKS.every((p) => CATALOGUE[p].enVente)).toBe(true);
    expect([...PACKS_DE_BULLES].sort()).toEqual(["pack10", "pack200", "pack25", "pack30", "pack60", "pack80"]);
    expect([...PASSAGES_EN_PREMIUM]).toEqual(["passe_premium", "premium_ajout"]);
  });

  it("chaque offre du vocabulaire est au catalogue, sous son id", () => {
    expect(Object.keys(CATALOGUE).sort()).toEqual([...OFFRES].sort());
  });

  it("une bulle par réponse écrite, deux en vocal, trois avec des captures ou un export", () => {
    expect(COUT_EN_BULLES).toEqual({ reponse: 1, vocal: 2, ajout: 3 });
  });

  it("les prix s’écrivent à la française, l’insécable avant €", () => {
    expect(enEuros(990)).toBe("9,90\u00a0€");
    expect(enEuros(500)).toBe("5,00\u00a0€");
    expect(prixDe("premium")).toBe("19,90\u00a0€");
  });

  it("la feuille « Ta formule » : le rapport seul, puis Premium, choisie d’avance", () => {
    expect([...FORMULES]).toEqual(["rapport", "premium"]);
    expect(FORMULE_CHOISIE).toBe("premium");
  });
});

/*
 * Les textes des écrans du paiement (src/contenu/paiement.ts) sont ceux du prototype validé des bulles, mot pour mot ;
 * leurs nombres et leurs prix sont tirés du catalogue. Un prix qui change les change : ce test dit lesquels relire.
 */
describe("les textes du paiement, tirés du catalogue", () => {
  it("le bas de l’aperçu gratuit", () => {
    expect(PIED_GRATUIT).toEqual({
      lire: "Lire la suite · 9,90\u00a0€",
      lireGarde: "Lire la suite · 4,95\u00a0€",
      lireAvance: "Lire la suite · 0\u00a0€",
      offertes: "3 bulles offertes avec ton rapport",
      regle: "1 bulle = 1 réponse de BLUSH, sur tout ce que tu veux",
    });
  });

  it("la feuille « Ta formule » : Premium, « 22 bulles + 3 offertes » (celles du rapport), et ce qu’elle fait économiser", () => {
    expect(FEUILLE_FORMULE.titre("Léa")).toBe("La suite parle de vous deux\u00a0: toi et Léa.");
    expect(FEUILLE_FORMULE.rapport).toMatchObject({ titre: "Le rapport", note: "+ 3 bulles offertes" });
    expect(FEUILLE_FORMULE.rapport.contenu(7)).toBe("7 chapitres, ton plan, ton vocal");
    expect(FEUILLE_FORMULE.premium).toMatchObject({
      badge: "Premium",
      titre: "Rapport + 22 bulles",
      offertes: "+3 offertes",
      note: "Soit 25 bulles en tout",
      bulles: "22 bulles",
      plus: "+ 3 bulles",
      barreOffertes: null,
      gratuit: "0\u00a0€",
      economie: "Économise 4,90\u00a0€ · la bulle à 0,45\u00a0€",
    });
    expect(FEUILLE_FORMULE.payer(prixDe("premium"))).toBe("Débloquer · 19,90\u00a0€");
    expect(FEUILLE_FORMULE.avance.note(RAPPORT_D_AVANCE.bulles)).toBe("Déjà payé · + 3 bulles offertes");
    expect(FEUILLE_FORMULE.avance.note(RAPPORT_D_AVANCE.bullesAvantLaGrille)).toBe("Déjà payé · + 10 bulles offertes");
  });

  it("le paywall : les réponses du rapport, et celles de Premium dont les offertes, sans prix barré", () => {
    expect(PAYWALL.rapport.note(3)).toBe("8 chapitres sur vous deux, ton vocal, 3 réponses de BLUSH");
    expect(PAYWALL.premium.offertes(CATALOGUE.premium.bulles)).toBe("25 réponses, dont 3 offertes");
    expect(PAYWALL.premium.barreOffertes).toBeNull();
  });

  it("l’offre ① : une offre unique sur le rapport, 3 € de moins, 3 bulles offertes", () => {
    expect(OFFRE_SUITE).toMatchObject({
      titre: "Offre unique sur ton rapport",
      sousTitre: "3\u00a0€ de moins, rien que pour toi. Dans 5\u00a0minutes, il repasse à 9,90\u00a0€.",
      fin: "Elle disparaît dans",
      prix: "6,90\u00a0€",
      barre: "9,90\u00a0€",
      economie: "−3\u00a0€",
      contenu: "3 bulles offertes",
      prendre: "Je le prends · 6,90\u00a0€",
    });
    expect(`${OFFRE_SUITE.remise}${OFFRE_SUITE.apres}`).toBe(OFFRE_SUITE.titre);
  });

  it("l’offre ③ (le passage en Premium, l’écart avec Premium dit dans le texte, sans prix barré) et « C’est débloqué »", () => {
    expect(OFFRE_PREMIUM_AJOUT).toMatchObject({
      titre: "Passe en Premium pour 6,90\u00a0€ de plus",
      texte: "22 bulles en plus, comme en Premium. Premium coûte 10\u00a0€ de plus que le rapport\u00a0: ici, 6,90\u00a0€.",
      prendre: "Ajouter 22 bulles · 6,90\u00a0€",
      plus: "+ 22",
    });
    expect(DEBLOQUE.phrase(8, 3)).toBe("Les 8 chapitres sont à toi. Et 3 bulles pour en parler avec BLUSH.");
  });
});

describe("le nom d’un achat chez Whop", () => {
  it("dit l’offre et les bulles figées dans l’achat, sans prénom ni conv", () => {
    expect(titreChezWhop("rapport", 3)).toBe("Le rapport complet + 3 bulles");
    expect(titreChezWhop("suite", 3)).toBe("Le rapport complet + 3 bulles");
    expect(titreChezWhop("premium", 25)).toBe("Premium\u00a0: rapport + 25 bulles");
    expect(titreChezWhop("passe_premium", 22)).toBe("Premium\u00a0: +22 bulles");
    expect(titreChezWhop("second", 0)).toBe("Ton 2e rapport, valable 1 an");
    expect(titreChezWhop("pack25", 25)).toBe("25 bulles");
    expect(titreChezWhop("pack10", 10)).toBe("10 bulles");
    /* Les offres retirées gardent leur nom : une commande d’avant, encore en attente, se paie sous lui */
    expect(titreChezWhop("premium_ajout", 80)).toBe("80 bulles en plus");
    expect(titreChezWhop("pack80", 120)).toBe("120 bulles");
  });

  it("tient dans ce que Whop accepte, pour chaque offre, avec le plus gros lot de bulles de la roue (et l’ancien bonus de la première recharge)", () => {
    const plusGrosLot = Math.max(...LOTS_DE_LA_ROUE.map(bullesDuLot));
    for (const offre of OFFRES) {
      const bulles = CATALOGUE[offre].bulles;
      for (const n of [bulles, bulles + plusGrosLot, bulles + 40]) expect(titreChezWhop(offre, n).length, offre).toBeLessThanOrEqual(TITRE_MAX_CHEZ_WHOP);
    }
  });
});

describe("le rapport d’avance (⑤), commandé avant ou après la grille du 23 octobre 2026", () => {
  it("donne à son usage les bulles que son billet promettait : 10 avant la mise en ligne de la grille, celles du rapport après", () => {
    const avant = new Date(GRILLE_DU_23_OCTOBRE.getTime() - 60_000);
    const apres = new Date(GRILLE_DU_23_OCTOBRE.getTime() + 60_000);
    expect(bullesDeLAvance(avant)).toBe(10);
    expect(bullesDeLAvance(GRILLE_DU_23_OCTOBRE)).toBe(CATALOGUE.rapport.bulles);
    expect(bullesDeLAvance(apres)).toBe(CATALOGUE.rapport.bulles);
    expect(RAPPORT_D_AVANCE.bulles).toBe(3);
  });
});
