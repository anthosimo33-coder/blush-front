import { describe, expect, it } from "vitest";
import { aRegarder, meilleureSource, VISITEURS_D_UNE_SOURCE, type CarteARegarder } from "@/app/admin/a-regarder";
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

const titres = (c: CarteARegarder[]) => c.map((x) => x.titre);
/** Aucune carte n’écrit NaN, Infinity ou undefined. */
const propres = (c: CarteARegarder[]) => c.every((x) => !/NaN|Infinity|undefined|null/.test(`${x.titre} ${x.texte}`));

describe("« À regarder »", () => {
  it("l’aperçu calme : la fuite et la marge sous la cible d’abord, puis la source qui achète le mieux", () => {
    const s = stats();
    const cartes = aRegarder(s);
    expect(cartes.map((c) => c.ton)).toEqual(["mal", "mal", "bon"]);
    expect(cartes[0]).toMatchObject({ titre: `85${NB}% des visiteurs repartent sans importer`, lien: { ancre: "tunnel" } });
    const marge = margeApresIA(s.pilotage.net.valeur, s.pilotage.dollars.valeur)!;
    expect(marge).toBeLessThan(CIBLE_DE_MARGE);
    expect(cartes[1]).toMatchObject({ titre: `Marge après IA${NB}: ${Math.round(marge)}${NB}%, sous ta cible de 80${NB}%`, lien: { ancre: "couts" } });
    expect(cartes[1]?.texte).toMatch(/^Le poste «\u00a0Chat\u00a0» fait 46\u00a0% de ce que coûte l’IA/);
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
    const cartes = aRegarder(stats({ net: { valeur: 120000, avant: 100000 }, dollars: { valeur: 10, avant: 10 } }));
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
    const cartes = aRegarder(vide({ suiviDepuis: null, net: { valeur: 120000, avant: 0 }, payes: { n: 10, centimes: 120000 }, dollars: { valeur: 10, avant: 0 } }));
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
    const cartes = aRegarder(vide({ dollars: { valeur: 12, avant: 0 } }));
    expect(titres(cartes)).not.toContainEqual(expect.stringMatching(/Marge/));
  });

  it("la marge sous la cible, sans poste de coût à nommer : le coût et le chiffre d’affaires", () => {
    const cartes = aRegarder(
      stats({ net: { valeur: 1200, avant: 0 }, dollars: { valeur: 10, avant: 0 } }, { couts: { total: 10, avant: 0, parRapport: null, parVerdict: null, postes: [] } }),
    );
    expect(cartes.find((c) => c.titre.startsWith("Marge"))?.texte).toBe(`L’IA a coûté 10,00${NB}$ pour 12,00${NB}€ de chiffre d’affaires net.`);
  });
});
