import { describe, expect, it } from "vitest";
import { aDecider, soucisDeSante } from "@/app/admin/a-decider";
import { statsDExemple } from "@/app/apercu/admin/exemple";
import type { Pilotage, StatsAdmin } from "@/server/stats";

/*
 * « À décider », en haut du résumé d’/admin (src/app/admin/a-decider.ts) : cinq lignes au plus, ce qui coince d’abord ;
 * un canal qui amène du monde sans vendre, un trafic qui monte sans que les acheteurs suivent, puis ce que dit « À
 * regarder », sans la santé (son bandeau la dit). Sur les chiffres de l’aperçu, changés là où le test le dit.
 */

/** Des chiffres de l’aperçu (sans souci de santé), dont le pilotage est changé par `p`. */
function stats(p: Partial<Pilotage> = {}): StatsAdmin {
  const base = statsDExemple(7, { calme: true });
  return { ...base, pilotage: { ...base.pilotage, ...p } };
}

/** Un canal : ses visiteurs, ceux qui importent, ses acheteurs. */
const canal = (source: NonNullable<Pilotage["sources"][number]["source"]>, visiteurs: number, importent: number, acheteurs: number) => ({
  source,
  visiteurs,
  importent,
  comptes: importent,
  paywall: importent,
  acheteurs,
  centimes: acheteurs * 990,
});

const titres = (s: StatsAdmin) => aDecider(s).map((l) => l.titre.replace(/\s/g, " "));

describe("le canal qui amène du monde sans vendre", () => {
  const sources = [canal("google", 150, 50, 5), canal("facebook", 600, 30, 0), canal("instagram", 300, 12, 0)];

  it("le plus gros des canaux sans acheteur passe en tête, avec sa part du trafic et le canal qui achète le mieux", () => {
    const s = stats({ sources, visiteurs: { valeur: 1050, avant: 1000 }, acheteurs: { valeur: 5, avant: 5 } });
    const [premiere] = aDecider(s);
    expect(premiere?.ton).toBe("mal");
    expect(premiere?.titre.replace(/\s/g, " ")).toBe("Facebook : 600 visiteurs, aucun acheteur");
    expect(premiere?.texte.replace(/\s/g, " ")).toContain("57 % du trafic de la période. 30 importent (5 %), contre 33 % pour Google.");
    expect(premiere?.lien).toEqual({ texte: "Voir l’acquisition", vue: "acquisition", ancre: "sources" });
  });

  it("sous 100 visiteurs, un canal sans acheteur ne dit rien ; ni tant que les visites ne se comptent pas", () => {
    const petits = [canal("google", 150, 50, 5), canal("facebook", 99, 4, 0)];
    expect(titres(stats({ sources: petits })).some((t) => t.includes("aucun acheteur"))).toBe(false);
    expect(titres(stats({ sources, suiviDepuis: null })).some((t) => t.includes("aucun acheteur"))).toBe(false);
  });
});

describe("le trafic qui monte sans que les acheteurs suivent", () => {
  it("à partir de +50 % de visiteurs et d’un taux d’achat qui baisse : par combien chacun a été multiplié", () => {
    const s = stats({ visiteurs: { valeur: 1600, avant: 200 }, acheteurs: { valeur: 10, avant: 6 } });
    const ligne = aDecider(s).find((l) => l.titre.startsWith("Le trafic a fait"));
    expect(ligne?.ton).toBe("neutre");
    expect(ligne?.titre).toBe("Le trafic a fait ×8, les acheteurs ×1,7");
    expect(ligne?.texte.replace(/\s/g, " ")).toContain("le taux d’achat passe de 3,0 % à 0,6 %");
  });

  it("un trafic qui monte avec ses acheteurs, ou qui monte peu, ne dit rien", () => {
    expect(titres(stats({ visiteurs: { valeur: 1600, avant: 200 }, acheteurs: { valeur: 80, avant: 6 } })).some((t) => t.startsWith("Le trafic a fait"))).toBe(false);
    expect(titres(stats({ visiteurs: { valeur: 240, avant: 200 }, acheteurs: { valeur: 5, avant: 6 } })).some((t) => t.startsWith("Le trafic a fait"))).toBe(false);
  });
});

describe("la liste", () => {
  it("cinq lignes au plus, ce qui coince avant ce qui est à savoir, avant ce qui marche", () => {
    const s = stats({ sources: [canal("google", 150, 50, 5), canal("facebook", 600, 30, 0)], visiteurs: { valeur: 1600, avant: 200 }, acheteurs: { valeur: 10, avant: 6 } });
    const tons = aDecider(s).map((l) => l.ton);
    expect(tons.length).toBeGreaterThan(0);
    expect(tons.length).toBeLessThanOrEqual(5);
    const rang = { mal: 0, neutre: 1, bon: 2 };
    expect(tons.map((t) => rang[t])).toEqual([...tons.map((t) => rang[t])].sort((a, b) => a - b));
  });

  it("la santé n’y prend pas de place : son bandeau la dit", () => {
    const s = stats({ sante: { echecs: 3, bloquees: 1, paiementsEchoues: 2, alertes: 1, pannes: 4, pannesDuJour: 1 } });
    expect(aDecider(s).some((l) => l.lien?.vue === "sante")).toBe(false);
    expect(soucisDeSante(s).map((t) => t.replace(/\s/g, " "))).toEqual(["3 tâches en échec", "1 tâche bloquée", "2 paiements refusés", "4 pannes du serveur"]);
  });

  it("sans souci, le bandeau de la santé n’a rien à dire", () => {
    expect(soucisDeSante(stats())).toEqual([]);
  });
});
