import { describe, expect, it } from "vitest";
import { aCoteDeLaMarge, aRegarder, margeProduit, meilleureSource, VISITEURS_D_UNE_SOURCE, type CarteARegarder } from "@/app/admin/a-regarder";
import { statsDExemple } from "@/app/apercu/admin/exemple";
import { CIBLE_DE_MARGE, margeApresIA } from "@/contenu/pilotage";
import type { Pilotage, StatsAdmin } from "@/server/stats";

/*
 * « À regarder », en haut du pilotage (src/app/admin/a-regarder.ts) : trois cartes au plus, ce qui coince d’abord, les
 * bonnes nouvelles ensuite, une carte neutre tant que les visites ne se comptent pas. Sur les chiffres de l’aperçu
 * (src/app/apercu/admin/exemple.ts), changés là où le test le dit.
 */

const NB = "\u00a0";

/** Des chiffres de l’aperçu, dont le pilotage est changé par `p`. */
function stats(p: Partial<Pilotage> = {}, s: Partial<StatsAdmin> = {}): StatsAdmin {
  const base = statsDExemple(7, { calme: true });
  return { ...base, ...s, pilotage: { ...base.pilotage, ...p } };
}

/** Des chiffres où rien ne se passe : ni visite, ni vente, ni souci. */
function vide(p: Partial<Pilotage> = {}): StatsAdmin {
  const zero = { valeur: 0, avant: 0 };
  const rien = { n: 0, centimes: 0 };
  return stats({
    cases: [],
    net: zero,
    netProduit: zero,
    acheteursProduit: zero,
    payes: rien,
    rembourses: rien,
    contestes: rien,
    visiteurs: zero,
    acheteurs: zero,
    centimesPayes: zero,
    dollars: zero,
    tunnel: { visiteurs: 0, imports: 0, paywall: 0, acheteurs: 0, racheteurs: 0 },
    sources: [],
    mix: [],
    sante: { echecs: 0, bloquees: 0, paiementsEchoues: 0, alertes: 0, pannes: 0, pannesDuJour: 0 },
    suiviDepuis: "2026-09-01",
    ...p,
  });
}

/** Ce qu’a coûté l’IA : `produit` pour le produit, `tests` pour les tests, `nonClasse` sans population, sans poste à nommer. */
const couts = (produit: number, tests = 0, nonClasse = 0): StatsAdmin["couts"] => ({
  total: produit + tests + nonClasse,
  avant: 0,
  produit: { valeur: produit, avant: 0 },
  tests: { valeur: tests, avant: 0 },
  populations: [
    { population: "client", dollars: produit, appels: 1 },
    { population: "equipe", dollars: tests, appels: 1 },
    { population: "inconnu", dollars: nonClasse, appels: 1 },
  ],
  parRapport: null,
  parVerdict: null,
  postes: [],
});

const titres = (c: CarteARegarder[]) => c.map((x) => x.titre);
/** Aucune carte n’écrit NaN, Infinity ou undefined. */
const propres = (c: CarteARegarder[]) => c.every((x) => !/NaN|Infinity|undefined|null/.test(`${x.titre} ${x.texte}`));

describe("« À regarder »", () => {
  it("l’aperçu calme : la fuite et la marge sous la cible d’abord, puis la source qui achète le mieux", () => {
    const s = stats();
    const cartes = aRegarder(s);
    expect(cartes.map((c) => c.ton)).toEqual(["mal", "mal", "bon"]);
    expect(cartes[0]).toMatchObject({ titre: `85${NB}% des visiteurs repartent sans importer`, lien: { ancre: "tunnel" } });
    /* La marge produit : les ventes des vrais clients face à l’IA du produit, les tests nommés à part */
    const marge = margeApresIA(s.pilotage.netProduit.valeur, s.couts.produit.valeur)!;
    expect(marge).toBeLessThan(CIBLE_DE_MARGE);
    expect(cartes[1]).toMatchObject({ titre: `Marge produit${NB}: ${Math.round(marge)}${NB}%, sous ta cible de 80${NB}%`, lien: { ancre: "couts" } });
    expect(cartes[1]?.texte).toMatch(
      /^Le poste «\u00a0Chat\u00a0» fait 46\u00a0% de l’IA du produit \(.+\)\. Les tests \([\d,]+\u00a0\$\) n’y comptent pas\. L’IA non classée \([\d,]+\u00a0\$\) n’y compte pas\u00a0: comptée dans le produit, la marge serait de \d+\u00a0%\.$/,
    );
    expect(cartes[2]).toMatchObject({ lien: { ancre: "sources" } });
    expect(cartes[2]?.titre).toMatch(/^Verdicts partagés achète le mieux\u00a0: 5,\d\u00a0%$/);
    expect(propres(cartes)).toBe(true);
  });

  it("ce qui coince passe d’abord : la santé, avec ses lignes non nulles", () => {
    const cartes = aRegarder(stats({ sante: { echecs: 3, bloquees: 1, paiementsEchoues: 2, alertes: 5, pannes: 0, pannesDuJour: 0 } }));
    expect(cartes).toHaveLength(3);
    expect(cartes[0]).toMatchObject({ ton: "mal", titre: `3${NB}tâches en échec, 1${NB}tâche bloquée et 2${NB}paiements refusés`, lien: { ancre: "sante" } });
    /* Trois soucis : la bonne nouvelle ne tient plus */
    expect(cartes.every((c) => c.ton === "mal")).toBe(true);
    expect(aRegarder(stats({ sante: { echecs: 0, bloquees: 0, paiementsEchoues: 1, alertes: 0, pannes: 0, pannesDuJour: 0 } }))[0]?.titre).toBe(`1${NB}paiement refusé`);
    /* Les alertes danger seules ne sont pas une panne : la carte Santé les montre, « À regarder » non */
    expect(titres(aRegarder(stats({ sante: { echecs: 0, bloquees: 0, paiementsEchoues: 0, alertes: 4, pannes: 0, pannesDuJour: 0 } })))).not.toContainEqual(
      expect.stringMatching(/alerte/),
    );
    /* Les pannes du serveur (une route /api, une page) : de la santé, comptées sur la période */
    expect(aRegarder(stats({ sante: { echecs: 0, bloquees: 0, paiementsEchoues: 0, alertes: 0, pannes: 3, pannesDuJour: 1 } }))[0]).toMatchObject({
      ton: "mal",
      titre: `3${NB}pannes du serveur`,
      lien: { ancre: "sante" },
    });
    expect(aRegarder(stats({ sante: { echecs: 1, bloquees: 0, paiementsEchoues: 0, alertes: 0, pannes: 1, pannesDuJour: 0 } }))[0]?.titre).toBe(
      `1${NB}tâche en échec et 1${NB}panne du serveur`,
    );
  });

  it("les remboursements au-delà de 5 % du payé", () => {
    const payes = { n: 100, centimes: 100000 };
    const avec = (centimes: number) => aRegarder(stats({ payes, rembourses: { n: 4, centimes } }));
    expect(titres(avec(5000))).not.toContainEqual(expect.stringMatching(/remboursé/));
    const cartes = avec(6000);
    const carte = cartes.find((c) => c.titre.includes("remboursé"));
    expect(carte).toMatchObject({ ton: "mal", titre: `6${NB}% du payé remboursé`, lien: { ancre: "chiffre-d-affaires" } });
    expect(carte?.texte).toContain(`4${NB}remboursements pour 60,00${NB}€`);
  });

  it("la marge au-dessus de la cible est une bonne nouvelle", () => {
    const cartes = aRegarder(stats({ netProduit: { valeur: 120000, avant: 100000 } }, { couts: couts(10) }));
    const marge = cartes.find((c) => c.titre.startsWith("Marge"));
    expect(marge).toMatchObject({ ton: "bon", lien: { ancre: "couts" } });
    expect(marge?.texte).toContain(`Au-dessus de ta cible de 80${NB}%`);
  });

  it("la meilleure source : au moins 30 visiteurs et un acheteur, jamais « Avant le suivi »", () => {
    const sources: Pilotage["sources"] = [
      { source: "tiktok", visiteurs: 1000, acheteurs: 20, centimes: 28000 },
      { source: "instagram", visiteurs: VISITEURS_D_UNE_SOURCE - 1, acheteurs: 10, centimes: 14000 },
      { source: "google", visiteurs: VISITEURS_D_UNE_SOURCE, acheteurs: 3, centimes: 4000 },
      { source: null, visiteurs: 0, acheteurs: 5, centimes: 7000 },
    ];
    expect(meilleureSource(sources)).toEqual({ source: "google", taux: 0.1, visiteurs: 30, acheteurs: 3 });
    expect(meilleureSource([{ source: "snapchat", visiteurs: 500, acheteurs: 0, centimes: 0 }])).toBeNull();
    expect(meilleureSource([])).toBeNull();
  });

  it("sans visites comptées : une carte neutre, et rien de ce qui dépend des visiteurs", () => {
    const s = statsDExemple(7, { calme: true, suivi: false });
    const cartes = aRegarder(s);
    expect(cartes).toContainEqual(expect.objectContaining({ ton: "neutre", titre: "Les visiteurs se comptent depuis la mise en ligne de ce tableau de bord", lien: null }));
    expect(titres(cartes)).not.toContainEqual(expect.stringMatching(/visiteurs repartent|achète le mieux/));
    expect(propres(cartes)).toBe(true);
  });

  it("au plus trois cartes, dans l’ordre : ce qui coince, la remarque, les bonnes nouvelles", () => {
    const sansSuivi = vide({ suiviDepuis: null, net: { valeur: 120000, avant: 0 }, netProduit: { valeur: 120000, avant: 0 }, payes: { n: 10, centimes: 120000 } });
    const cartes = aRegarder({ ...sansSuivi, couts: couts(10) });
    expect(cartes.map((c) => c.ton)).toEqual(["neutre", "bon"]);
    const pleines = aRegarder(
      vide({
        sante: { echecs: 1, bloquees: 1, paiementsEchoues: 1, alertes: 0, pannes: 0, pannesDuJour: 0 },
        tunnel: { visiteurs: 1000, imports: 100, paywall: 90, acheteurs: 20, racheteurs: 0 },
        suiviDepuis: null,
      }),
    );
    expect(pleines).toHaveLength(3);
    expect(pleines.map((c) => c.ton)).toEqual(["mal", "mal", "neutre"]);
    /* Des visiteurs sans suivi (impossible, sauf en cas de bug) ne font pas une fuite à l’arrivée */
    expect(pleines[1]?.titre).toBe(`78${NB}% de ceux qui voient le paywall n’achètent pas`);
  });

  it("une fuite sur trop peu de monde ne se signale pas", () => {
    const cartes = aRegarder(vide({ visiteurs: { valeur: 1, avant: 0 }, tunnel: { visiteurs: 1, imports: 0, paywall: 0, acheteurs: 0, racheteurs: 0 } }));
    expect(cartes.some((c) => c.titre.includes("repartent"))).toBe(false);
  });

  it("rien du tout : une carte calme, sans NaN ni division par zéro", () => {
    const cartes = aRegarder(vide());
    expect(cartes).toEqual([expect.objectContaining({ ton: "neutre", titre: "Rien à signaler", lien: null })]);
    expect(cartes[0]?.texte).toContain(`0${NB}visiteur, 0,00${NB}€`);
    expect(propres(cartes)).toBe(true);
  });

  it("une marge sans chiffre d’affaires (l’IA a coûté, rien n’est vendu) ne se calcule pas", () => {
    const s = vide({ dollars: { valeur: 12, avant: 0 } });
    expect(titres(aRegarder({ ...s, couts: couts(12) }))).not.toContainEqual(expect.stringMatching(/Marge/));
  });

  it("la marge produit sous la cible, sans poste de coût à nommer : l’IA du produit et le chiffre d’affaires des vrais clients, les tests à part", () => {
    const marge = (c: StatsAdmin["couts"]) => aRegarder(stats({ netProduit: { valeur: 1200, avant: 0 } }, { couts: c })).find((x) => x.titre.startsWith("Marge"));
    expect(marge(couts(10))?.texte).toBe(`L’IA du produit a coûté 10,00${NB}$ pour 12,00${NB}€ de chiffre d’affaires net des vrais clients.`);
    /* Les tests ne touchent pas la marge : 10 $ de produit sous la cible, que les tests coûtent 0 ou 40 $ */
    expect(marge(couts(10, 40))?.titre).toBe(marge(couts(10))?.titre);
    expect(marge(couts(10, 40))?.texte).toBe(
      `L’IA du produit a coûté 10,00${NB}$ pour 12,00${NB}€ de chiffre d’affaires net des vrais clients. Les tests (40,00${NB}$) n’y comptent pas.`,
    );
    /* Au-dessus de la cible : la bonne nouvelle, avec les tests nommés aussi */
    const haute = aRegarder(stats({ netProduit: { valeur: 12_000, avant: 0 } }, { couts: couts(10, 40) })).find((x) => x.titre.startsWith("Marge"));
    expect(haute).toMatchObject({ ton: "bon", titre: `Marge produit${NB}: 91${NB}%` });
    expect(haute?.texte).toContain(`Les tests (40,00${NB}$) n’y comptent pas.`);
  });

  it("la marge produit au-dessus de la cible que le non classé pourrait faire passer dessous : à confirmer, avec la marge au pire", () => {
    const carte = (c: StatsAdmin["couts"]) => aRegarder(stats({ netProduit: { valeur: 12_000, avant: 0 } }, { couts: c })).find((x) => x.titre.startsWith("Marge"));
    /* 10 $ d’IA du produit pour 100 € HT : 91 % ; avec 15 $ de non classé, au pire 79 % (78,5 %) */
    expect(carte(couts(10, 0, 15))).toMatchObject({ ton: "neutre", titre: `Marge produit${NB}: 91${NB}%, à confirmer`, lien: { ancre: "couts" } });
    expect(carte(couts(10, 0, 15))?.texte).toContain(`mais 15,00${NB}$ d’IA non classée`);
    expect(carte(couts(10, 0, 15))?.texte).toContain(`la ramèneraient à 79${NB}% si elle était du produit`);
    /* Un peu de non classé, qui ne la fait pas passer dessous : la bonne nouvelle, qui le dit */
    expect(carte(couts(10, 0, 1))).toMatchObject({ ton: "bon", titre: `Marge produit${NB}: 91${NB}%` });
    expect(carte(couts(10, 0, 1))?.texte).toContain(`L’IA non classée (1,00${NB}$) n’y compte pas${NB}: comptée dans le produit, la marge serait de 91${NB}%.`);
  });

  it("à côté de la marge : les tests à part, puis le non classé et la marge au pire, s’il y en a", () => {
    const avec = (c: StatsAdmin["couts"], net = 12_000) => aCoteDeLaMarge(margeProduit(stats({ netProduit: { valeur: net, avant: 0 } }, { couts: c })));
    expect(avec(couts(10, 40))).toBe(`tests${NB}: 40,00${NB}$ à part`);
    expect(avec(couts(10, 40, 15))).toBe(`tests${NB}: 40,00${NB}$ à part · non classé${NB}: 15,00${NB}$ (au pire 79${NB}%)`);
    /* Sans vente, pas de marge au pire */
    expect(avec(couts(10, 0, 15), 0)).toBe(`tests${NB}: 0,00${NB}$ à part · non classé${NB}: 15,00${NB}$`);
  });
});
