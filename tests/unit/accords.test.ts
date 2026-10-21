import { describe, expect, it } from "vitest";
import { pronomDeLAutre, pronomsLus } from "@/server/accords";
import { storyAffichee } from "@/server/conv-affichee";
import { histoireDe, type Meta, type Participant } from "@/server/histoires";

/*
 * Le pronom que la conv laisse lire (src/server/accords.ts), sur des messages inventés : Léa écrit en « toi » (le premier
 * participant de l’import), l’autre en « autre ». Jamais une vraie conv.
 */
type Ligne = { role: "toi" | "autre" | "inconnu"; texte: string };
const toi = (texte: string): Ligne => ({ role: "toi", texte });
const autre = (texte: string): Ligne => ({ role: "autre", texte });

describe("le pronom que la conv laisse lire (pronomsLus)", () => {
  it("deux filles : chacune se dit au féminin, et l’autre lui parle au féminin", () => {
    const conv = [
      toi("je suis trop contente de te voir demain"),
      autre("moi aussi !! jsuis rentrée tard hier par contre"),
      toi("t’es prête ? j’arrive dans 10 min"),
      autre("désolée j’avais pas vu ton message"),
      toi("coucou ma belle"),
      autre("je me suis endormie devant le film mdr"),
      toi("je suis crevée mais ça vaut le coup"),
      autre("T’ES RENTRÉE ?"),
    ];
    expect(pronomsLus(conv)).toEqual({ toi: "elle", autre: "elle" });
  });

  it("une fille et un garçon : elle au féminin, lui par des accords forts (« beau », « jaloux », « mon chéri »)", () => {
    const conv = [
      toi("je suis contente que tu sois venu"),
      autre("je suis jaloux de ton chat franchement"),
      toi("t’es beau sur cette photo"),
      autre("désolé j’étais au sport"),
      toi("bonne nuit mon chéri"),
      autre("je suis trop heureux ce soir"),
      autre("t’es trop belle"),
      toi("je suis rentrée, je suis morte"),
    ];
    expect(pronomsLus(conv)).toEqual({ toi: "elle", autre: "il" });
  });

  it("un masculin qui peut venir d’un e oublié (« je suis rentré », « désolé ») ne dit jamais « il »", () => {
    const conv = [autre("je suis rentré"), autre("désolé j’ai pas vu"), autre("je suis prêt"), autre("je suis crevé"), autre("je suis content")];
    expect(pronomsLus(conv)).toEqual({});
  });

  it("un seul accord fort dit « il » avec au moins quatre messages au masculin", () => {
    const faibles = [autre("jsuis enfin sorti du taf"), autre("je suis nul en vélo"), toi("t’es réveillé ?"), toi("t’es arrivé ?")];
    expect(pronomsLus([autre("jsuis jaloux"), ...faibles.slice(0, 2)])).toEqual({});
    expect(pronomsLus([autre("jsuis jaloux"), ...faibles])).toEqual({ autre: "il" });
  });

  it("« il » ne se lit pas quand la conv a un féminin pour lui (une vanne, une citation)", () => {
    const conv = [autre("je suis jaloux"), autre("je suis trop heureux"), autre("je suis morte de rire")];
    expect(pronomsLus(conv)).toEqual({});
  });

  it("« elle » demande trois messages au féminin, et trois fois plus qu’au masculin", () => {
    expect(pronomsLus([autre("je suis rentrée"), autre("je suis prête")])).toEqual({});
    expect(pronomsLus([autre("je suis rentrée"), autre("je suis prête"), autre("je suis vraiment désolée")])).toEqual({ autre: "elle" });
    /* Deux masculins : il en faut six au féminin */
    const masculins = [autre("je suis rentré"), autre("je suis chaud")];
    const feminins = ["choquée", "morte", "vexée", "désolée", "prête", "contente"].map((mot) => autre(`je suis ${mot}`));
    expect(pronomsLus([...masculins, ...feminins.slice(0, 5)])).toEqual({});
    expect(pronomsLus([...masculins, ...feminins])).toEqual({ autre: "elle" });
  });

  it("un message compte une fois par personne et par pronom", () => {
    expect(pronomsLus([autre("désolée désolée je suis désolée"), autre("je suis contente")])).toEqual({});
  });

  it("ce qu’on lit à l’autre lui revient : « t’es prête ? » de Léa parle de celle qui lit", () => {
    expect(pronomsLus([toi("t’es prête ?"), toi("tu t’es endormie ?"), toi("t’as l’air fatiguée")])).toEqual({ autre: "elle" });
    expect(pronomsLus([autre("t’es prête ?"), autre("tes trop belle"), autre("ma chérie tu viens ?")])).toEqual({ toi: "elle" });
  });

  it("n’y voit pas d’accord : « ma belle-sœur », « ma belle robe », « tes beaux-parents », une autre personne, un média", () => {
    const conv = [
      autre("ma belle-sœur arrive ce soir"),
      autre("j’ai mis ma belle robe"),
      autre("tes beaux-parents sont là ?"),
      autre("elle est rentrée tard"),
      { role: "inconnu" as const, texte: "je suis rentrée" },
      autre(""),
      toi("ma belle-mère est relou"),
      toi("elle s’est endormie"),
    ];
    expect(pronomsLus(conv)).toEqual({});
  });
});

/* Inès (p0) et Léa (p1), inventées */
const participant = (prenom: string, pronomLu?: "il" | "elle"): Participant => ({ nom: prenom, prenom, messages: 40, ...(pronomLu ? { pronomLu } : {}) });
const meta = (lus: ["il" | "elle" | undefined, "il" | "elle" | undefined], plus: Partial<Meta> = {}): Meta => ({
  appli: "whatsapp",
  format: "whatsapp-ios",
  fichier: "conv.txt",
  participants: [participant("Inès", lus[0]), participant("Léa", lus[1])],
  resume: { debut: "2026-09-01", fin: "2026-10-01", total: 80, vocaux: 0 },
  moi: 1,
  pronom: "elle",
  devinette: "vus",
  objectif: "ensemble",
  ...plus,
});

describe("le pronom de l’autre (pronomDeLAutre)", () => {
  const de = (m: Meta) => pronomDeLAutre(m, { moi: m.participants[m.moi!], autre: m.participants[m.moi === 1 ? 0 : 1] });

  it("sans rien de la conv ni de sa fiche : l’opposé du tien", () => {
    expect(de(meta([undefined, undefined]))).toBe("il");
    expect(de(meta([undefined, undefined], { pronom: "il" }))).toBe("elle");
  });

  it("celui que la conv laisse lire passe devant l’opposé : deux filles", () => {
    expect(de(meta(["elle", undefined]))).toBe("elle");
    expect(de(meta(["elle", "elle"]))).toBe("elle");
  });

  it("la conv n’est pas crue sur l’autre quand elle se trompe sur toi", () => {
    expect(de(meta(["elle", "il"]))).toBe("il");
  });

  it("celui de sa fiche passe devant tout", () => {
    expect(de(meta(["elle", "elle"], { pronomAutre: "il" }))).toBe("il");
    expect(de(meta([undefined, undefined], { pronomAutre: "elle" }))).toBe("elle");
  });

  it("l’histoire des prompts (histoireDe) et celle des écrans (storyAffichee) le suivent", () => {
    const deuxFilles = meta(["elle", "elle"]);
    expect(histoireDe(deuxFilles).autre.pronom).toBe("elle");
    expect(histoireDe(deuxFilles).utilisateur.pronom).toBe("elle");
    expect(storyAffichee("id", deuxFilles).participants.map((p) => p.pronoun)).toEqual(["elle", "elle"]);
    const corrige = meta(["elle", "elle"], { pronomAutre: "il" });
    expect(histoireDe(corrige).autre.pronom).toBe("il");
    expect(storyAffichee("id", corrige).participants.map((p) => p.pronoun)).toEqual(["il", "elle"]);
  });
});
