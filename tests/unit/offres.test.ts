import { describe, expect, it } from "vitest";
import { bullesDe, CATALOGUE, COUT_EN_BULLES, enEuros, FORMULE_CHOISIE, PREMIERE_RECHARGE, prixDe } from "@/contenu/offres";
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
    ["premium", 1490, 1980, 90, true, null],
    ["suite", 690, 990, 10, true, "suite"],
    ["premium_ajout", 500, 990, 80, false, "premium_ajout"],
    ["pack30", 490, null, 30, false, null],
    ["pack80", 990, null, 80, false, null],
    ["pack200", 1990, null, 200, false, null],
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
      barreOffertes: "4,90\u00a0€",
      gratuit: "0\u00a0€",
      economie: "Économise 4,90\u00a0€ · la bulle à 0,06\u00a0€",
    });
    expect(FEUILLE_FORMULE.payer(prixDe("premium"))).toBe("Débloquer · 14,90\u00a0€");
  });

  it("l’offre ① : la suite à −30 %, 3 € de moins, 10 bulles offertes", () => {
    expect(OFFRE_SUITE).toMatchObject({
      titre: "Ta suite à −30\u00a0%",
      prix: "6,90\u00a0€",
      barre: "9,90\u00a0€",
      economie: "−3\u00a0€",
      contenu: "10 bulles offertes",
      prendre: "Je la prends · 6,90\u00a0€",
    });
    expect(`${OFFRE_SUITE.avant}${OFFRE_SUITE.remise}`).toBe(OFFRE_SUITE.titre);
  });

  it("l’offre ③ et « C’est débloqué »", () => {
    expect(OFFRE_PREMIUM_AJOUT).toMatchObject({
      titre: "Passe en Premium pour 5\u00a0€ de plus",
      texte: "80 bulles en plus, comme en Premium. Seules, elles coûtent 9,90\u00a0€.",
      prendre: "Ajouter 80 bulles · 5\u00a0€",
      plus: "+ 80",
    });
    expect(DEBLOQUE.phrase(8, 10)).toBe("Les 8 chapitres sont à toi, pour toujours. Et 10 bulles pour en parler avec BLUSH.");
  });
});
