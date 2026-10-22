import { describe, expect, it } from "vitest";
import { choisirLaVente, groupeDeVente, SEUILS_DE_VENTE, type SituationDeVente } from "@/server/vente";

/*
 * La règle de la vente dans le chat (choisirLaVente, src/server/vente.ts) : quelle carte poser sous la réponse de BLUSH,
 * ou aucune, d’après le moment que le modèle a vu et ce que le code sait de la personne. Une situation de départ où rien
 * ne se propose, que chaque cas change.
 */
const calme: SituationDeVente = {
  moment: "aucun",
  prenomAutre: null,
  memePersonne: false,
  alerte: false,
  sobre: false,
  ancienSobre: false,
  verrouillee: false,
  rapportSeul: false,
  messages48h: 4,
  ageDuRapport: 3,
  ajout: false,
  spontaneeRecente: false,
  refusees: new Set(),
  autreDejaProposee: false,
  aJourRecente: false,
  groupe: "avec",
};
const avec = (s: Partial<SituationDeVente>) => choisirLaVente({ ...calme, ...s });

describe("la vente dans le chat : quelle carte, et quand", () => {
  it("une conv ordinaire, sans moment : rien", () => {
    expect(avec({})).toBeNull();
  });

  it("il demande à acheter : la recharge, Premium à qui a pris le rapport seul, l’autre conv s’il nomme quelqu’un", () => {
    expect(avec({ moment: "demande_achat" })).toEqual({ genre: "bulles", spontanee: false });
    expect(avec({ moment: "demande_achat", rapportSeul: true })).toEqual({ genre: "premium", spontanee: false });
    expect(avec({ moment: "demande_achat", prenomAutre: "Léa" })).toEqual({ genre: "autre", spontanee: false });
  });

  it("il demande un autre rapport : l’autre conv (nommée ou non), ou le rapport à jour s’il parle de la même personne", () => {
    expect(avec({ moment: "demande_rapport", prenomAutre: "Inès" })).toEqual({ genre: "autre", spontanee: false });
    expect(avec({ moment: "demande_rapport" })).toEqual({ genre: "autre", spontanee: false });
    expect(avec({ moment: "demande_rapport", memePersonne: true })).toEqual({ genre: "a_jour", spontanee: false });
    expect(avec({ moment: "demande_rapport", groupe: "sans", spontaneeRecente: true, refusees: new Set(["autre"]) })).toEqual({ genre: "autre", spontanee: false });
  });

  it("ce qu’il demande passe toujours : malgré une alerte, une spontanée du jour, un refus, ou la moitié « sans »", () => {
    const bloquee: Partial<SituationDeVente> = { alerte: true, spontaneeRecente: true, refusees: new Set(["bulles"]), groupe: "sans" };
    expect(avec({ ...bloquee, moment: "demande_achat" })).toEqual({ genre: "bulles", spontanee: false });
  });

  it("sa réponse attend à zéro bulle : la recharge (ou Premium), même en alerte et pour la moitié « sans »", () => {
    expect(avec({ verrouillee: true, alerte: true, groupe: "sans" })).toEqual({ genre: "bulles", spontanee: false });
    expect(avec({ verrouillee: true, rapportSeul: true })).toEqual({ genre: "premium", spontanee: false });
  });

  it("un rapport doux : rien, même demandé ; un ancien doux « danger » ou « détresse » : le réimport, seulement s’il le demande", () => {
    expect(avec({ sobre: true, moment: "demande_achat" })).toBeNull();
    expect(avec({ sobre: true, verrouillee: true })).toBeNull();
    expect(avec({ sobre: true, ancienSobre: true, moment: "demande_achat" })).toEqual({ genre: "reimport", spontanee: false });
    expect(avec({ sobre: true, ancienSobre: true, moment: "demande_rapport", prenomAutre: "Inès" })).toEqual({ genre: "reimport", spontanee: false });
    expect(avec({ sobre: true, moment: "demande_rapport" })).toBeNull();
    expect(avec({ sobre: true, ancienSobre: true, moment: "autre_personne", prenomAutre: "Léa" })).toBeNull();
  });

  it("il parle de quelqu’un d’autre : l’autre conv, spontanée, une fois par prénom", () => {
    expect(avec({ moment: "autre_personne", prenomAutre: "Léa" })).toEqual({ genre: "autre", spontanee: true });
    expect(avec({ moment: "autre_personne", prenomAutre: "Léa", autreDejaProposee: true })).toBeNull();
    expect(avec({ moment: "autre_personne", prenomAutre: null })).toBeNull();
  });

  it("du neuf (un récit, des captures) sur un rapport ancien : le rapport à jour, une fois par mois", () => {
    const ancien = SEUILS_DE_VENTE.rapportAncien;
    expect(avec({ moment: "nouveau", ageDuRapport: ancien })).toEqual({ genre: "a_jour", spontanee: true });
    expect(avec({ ajout: true, ageDuRapport: ancien + 10 })).toEqual({ genre: "a_jour", spontanee: true });
    expect(avec({ moment: "nouveau", ageDuRapport: ancien - 1 })).toBeNull();
    expect(avec({ moment: "nouveau", ageDuRapport: null })).toBeNull();
    expect(avec({ moment: "nouveau", ageDuRapport: ancien, aJourRecente: true })).toBeNull();
  });

  it("le rapport seul et beaucoup de messages : Premium, spontané ; en dessous du seuil, rien", () => {
    expect(avec({ rapportSeul: true, messages48h: SEUILS_DE_VENTE.parleBeaucoup })).toEqual({ genre: "premium", spontanee: true });
    expect(avec({ rapportSeul: true, messages48h: SEUILS_DE_VENTE.parleBeaucoup - 1 })).toBeNull();
  });

  it("jamais la recharge spontanée, même à 1 bulle en pleine conv : le bandeau des bulles le dit déjà", () => {
    expect(avec({ messages48h: 40 })).toBeNull();
  });

  it("rien de spontané quand il va mal, après une spontanée du jour, pour la moitié « sans », ni pendant un refus", () => {
    const beaucoup: Partial<SituationDeVente> = { rapportSeul: true, messages48h: 20 };
    expect(avec(beaucoup)).toEqual({ genre: "premium", spontanee: true });
    expect(avec({ ...beaucoup, alerte: true })).toBeNull();
    expect(avec({ ...beaucoup, spontaneeRecente: true })).toBeNull();
    expect(avec({ ...beaucoup, groupe: "sans" })).toBeNull();
    expect(avec({ ...beaucoup, refusees: new Set(["premium"]) })).toBeNull();
    /* Un refus n’écarte que son offre : l’autre conv se propose encore */
    expect(avec({ ...beaucoup, moment: "autre_personne", prenomAutre: "Léa", refusees: new Set(["premium"]) })).toEqual({ genre: "autre", spontanee: true });
  });

  it("dans l’ordre : l’autre conv, puis le rapport à jour, puis Premium", () => {
    const tout: Partial<SituationDeVente> = { moment: "autre_personne", prenomAutre: "Léa", ajout: true, ageDuRapport: 30, rapportSeul: true, messages48h: 20 };
    expect(avec(tout)?.genre).toBe("autre");
    expect(avec({ ...tout, moment: "aucun" })?.genre).toBe("a_jour");
    expect(avec({ ...tout, moment: "aucun", ajout: false })?.genre).toBe("premium");
    expect(avec({ ...tout, moment: "aucun", ajout: false, rapportSeul: false })).toBeNull();
  });

  it("les deux moitiés du test A/B : stables, et à peu près égales", () => {
    const ids = Array.from({ length: 400 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(ids.map(groupeDeVente)).toEqual(ids.map(groupeDeVente));
    const n = ids.filter((id) => groupeDeVente(id) === "avec").length;
    expect(n).toBeGreaterThan(150);
    expect(n).toBeLessThan(250);
  });
});
