import { describe, expect, it } from "vitest";
import { bullesDe, CATALOGUE, COUT_EN_BULLES, enEuros, FORMULE_CHOISIE, PREMIERE_RECHARGE, prixDe, TITRE_MAX_CHEZ_WHOP, titreChezWhop } from "@/contenu/offres";
import { DEBLOQUE, FEUILLE_FORMULE, OFFRE_PREMIUM_AJOUT, OFFRE_SUITE, PIED_GRATUIT } from "@/contenu/paiement";
import { FORMULES, OFFRES } from "@/types";

/*
 * Le catalogue (src/contenu/offres.ts), tel que l’utilisateur l’a décidé le 12 octobre : les prix TTC, les bulles que
 * chaque offre donne, ce qui débloque une conv, les offres uniques. Le serveur fait payer ces prix-là et rien d’autre :
 * un prix qui change change ici d’abord.
 */
describe("le catalogue", () => {
  it.each<[string, number, number | null, number, boolean, string | null]>([
    ["rapport", 990, null, 10, true, null],
    ["premium", 1490, 2380, 90, true, null],
    ["suite", 690, 990, 10, true, "suite"],
    ["premium_ajout", 500, 1390, 80, false, "premium_ajout"],
    ["pack30", 890, null, 30, false, null],
    ["pack80", 1390, null, 80, false, null],
    ["pack200", 2390, null, 200, false, null],
  ])("%s : %i centimes (barré %s), %i bulles, conv %s, offre unique %s", (id, centimes, barre, bulles, conv, unique) => {
    expect(CATALOGUE[id as keyof typeof CATALOGUE]).toMatchObject({ id, centimes, barre, bulles, conv, unique });
  });

  it("chaque offre du vocabulaire est au catalogue, sous son id", () => {
    expect(Object.keys(CATALOGUE).sort()).toEqual([...OFFRES].sort());
  });

  it("la première recharge : +40 bulles sur le pack conseillé, et sur lui seul", () => {
    expect(bullesDe("pack80", { premiereRecharge: true })).toBe(120);
    expect(bullesDe("pack80")).toBe(80);
    expect(bullesDe("pack200", { premiereRecharge: true })).toBe(200);
    expect(PREMIERE_RECHARGE).toEqual({ offre: "pack80", bonus: 40 });
  });

  it("une bulle par réponse écrite, deux en vocal, trois avec des captures ou un export", () => {
    expect(COUT_EN_BULLES).toEqual({ reponse: 1, vocal: 2, ajout: 3 });
  });

  it("les prix s’écrivent à la française, l’insécable avant €", () => {
    expect(enEuros(990)).toBe("9,90\u00a0€");
    expect(enEuros(500)).toBe("5,00\u00a0€");
    expect(prixDe("premium")).toBe("14,90\u00a0€");
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
      offertes: "10 bulles offertes avec ton rapport",
      regle: "1 bulle = 1 réponse de BLUSH, sur tout ce que tu veux",
    });
  });

  it("la feuille « Ta formule » : Premium, « 60 bulles + 30 offertes », et ce qu’elle fait économiser", () => {
    expect(FEUILLE_FORMULE.titre("Léa")).toBe("La suite parle de vous deux\u00a0: toi et Léa.");
    expect(FEUILLE_FORMULE.rapport).toMatchObject({ titre: "Le rapport", note: "+ 10 bulles offertes" });
    expect(FEUILLE_FORMULE.rapport.contenu(7)).toBe("7 chapitres, ton plan, ton vocal");
    expect(FEUILLE_FORMULE.premium).toMatchObject({
      badge: "Premium",
      titre: "Rapport + 60 bulles",
      offertes: "+30 offertes",
      note: "Soit 90 bulles en tout",
      bulles: "60 bulles",
      plus: "+ 30 bulles",
      barreOffertes: "8,90\u00a0€",
      gratuit: "0\u00a0€",
      economie: "Économise 8,90\u00a0€ · la bulle à 0,06\u00a0€",
    });
    expect(FEUILLE_FORMULE.payer(prixDe("premium"))).toBe("Débloquer · 14,90\u00a0€");
  });

  it("l’offre ① : une offre unique sur le rapport, 3 € de moins, 10 bulles offertes", () => {
    expect(OFFRE_SUITE).toMatchObject({
      titre: "Offre unique sur ton rapport",
      sousTitre: "3\u00a0€ de moins, rien que pour toi. Dans 5\u00a0minutes, il repasse à 9,90\u00a0€.",
      fin: "Elle disparaît dans",
      prix: "6,90\u00a0€",
      barre: "9,90\u00a0€",
      economie: "−3\u00a0€",
      contenu: "10 bulles offertes",
      prendre: "Je le prends · 6,90\u00a0€",
    });
    expect(`${OFFRE_SUITE.remise}${OFFRE_SUITE.apres}`).toBe(OFFRE_SUITE.titre);
  });

  it("l’offre ③ et « C’est débloqué »", () => {
    expect(OFFRE_PREMIUM_AJOUT).toMatchObject({
      titre: "Passe en Premium pour 5\u00a0€ de plus",
      texte: "80 bulles en plus, comme en Premium. Seules, elles coûtent 13,90\u00a0€.",
      prendre: "Ajouter 80 bulles · 5\u00a0€",
      plus: "+ 80",
    });
    expect(DEBLOQUE.phrase(8, 10)).toBe("Les 8 chapitres sont à toi. Et 10 bulles pour en parler avec BLUSH.");
  });
});

describe("le nom d’un achat chez Whop", () => {
  it("dit l’offre et les bulles figées dans l’achat, sans prénom ni conv", () => {
    expect(titreChezWhop("rapport", 10)).toBe("Le rapport complet + 10 bulles");
    expect(titreChezWhop("suite", 10)).toBe("Le rapport complet + 10 bulles");
    expect(titreChezWhop("premium", 90)).toBe("Premium\u00a0: rapport + 90 bulles");
    expect(titreChezWhop("premium_ajout", 80)).toBe("80 bulles en plus");
    expect(titreChezWhop("second", 0)).toBe("Ton 2e rapport, valable 1 an");
    expect(titreChezWhop("pack80", 120)).toBe("120 bulles");
    expect(titreChezWhop("pack30", 30)).toBe("30 bulles");
  });

  it("tient dans ce que Whop accepte, pour chaque offre, bonus de la première recharge compris", () => {
    for (const offre of OFFRES)
      for (const premiereRecharge of [false, true]) expect(titreChezWhop(offre, bullesDe(offre, { premiereRecharge })).length, offre).toBeLessThanOrEqual(TITRE_MAX_CHEZ_WHOP);
  });
});
