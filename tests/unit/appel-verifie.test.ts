import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
/* L’appel au modèle, simulé : chaque test dit ce que rendent ses essais, l’un après l’autre */
vi.mock("@/server/ia/claude", () => ({ appeler: vi.fn() }));
import type { Requete } from "@prompts/lib/contextes";
import { avecEcheance } from "@/server/echeance";
import { ErreurTache } from "@/server/erreurs";
import { appelVerifie, exigerSortie, TEMPS_RELANCE, type OptionsVerifie } from "@/server/ia/appel-verifie";
import { appeler, type Appel, type Avance } from "@/server/ia/claude";

/*
 * appelVerifie et exigerSortie (src/server/ia/appel-verifie.ts), sans base ni modèle : quand un appel se rejoue (une
 * preuve introuvable, une sortie illisible ou incomplète), quand il ne se rejoue pas (le second essai, plus le temps,
 * une bulle déjà montrée), et un refus qui n’est jamais pris pour une sortie vide.
 */

const Format = z.object({ texte: z.string(), preuves: z.array(z.string()) });
type Sortie = z.infer<typeof Format>;
const REQ: Requete = { tache: "10-chat", blocs: [{ texte: "salut" }] };
const LIGNES = new Map([["m0001", "m0001 2026-09-01 mar. 20:10 Inès : salut"]]);

const appels = vi.mocked(appeler);
const sortie = (preuves: string[], texte = "ok"): Appel<Sortie> => ({ sortie: { texte, preuves }, refus: false, stop: "end_turn", cout: 0 });
const illisible: Appel<Sortie> = { sortie: null, refus: false, stop: "end_turn", cout: 0 };
const refus = (categorie: string | null): Appel<Sortie> => ({ sortie: null, refus: true, stop: "refusal", cout: 0, categorie });
/** Les essais, rendus l’un après l’autre. */
const essais = (...a: Appel<Sortie>[]) => a.forEach((x) => appels.mockResolvedValueOnce(x));

const options = (o: Partial<OptionsVerifie<Sortie>> = {}): OptionsVerifie<Sortie> => ({ preuves: (s) => s.preuves, lignes: LIGNES, storyId: "histoire", etiquette: "chat", ...o });
const verifie = (o?: Partial<OptionsVerifie<Sortie>>) => appelVerifie(REQ, Format, options(o));

beforeEach(() => appels.mockReset());

describe("appelVerifie : le second essai", () => {
  it("une preuve introuvable : l’appel est rejoué, et c’est le second qui compte", async () => {
    essais(sortie(["m9999"], "premier"), sortie(["m0001"], "second"));
    expect(await verifie()).toEqual({ texte: "second", preuves: ["m0001"] });
    expect(appels).toHaveBeenCalledTimes(2);
  });

  it("introuvable encore au second essai : rendue telle quelle (la preuve est ignorée à l’affichage)", async () => {
    essais(sortie(["m9999"]), sortie(["m8888"], "second"));
    expect((await verifie()).texte).toBe("second");
  });

  it("plus le temps de rejouer (moins de TEMPS_RELANCE avant l’échéance) : la première sortie, sans second appel", async () => {
    essais(sortie(["m9999"], "premier"));
    expect((await avecEcheance(TEMPS_RELANCE - 10_000, verifie)).texte).toBe("premier");
    expect(appels).toHaveBeenCalledTimes(1);
  });

  it("une sortie illisible se rejoue toujours, même sans le temps ; deux, et l’étape échoue", async () => {
    essais(illisible, sortie(["m0001"]));
    expect((await avecEcheance(TEMPS_RELANCE - 10_000, verifie)).texte).toBe("ok");
    essais(illisible, illisible);
    await expect(verifie()).rejects.toMatchObject({ code: "sortie_illisible" } satisfies Partial<ErreurTache>);
  });

  it("incomplète (`complet`) : rejouée une fois, puis rendue telle quelle", async () => {
    const complet = (s: Sortie) => s.texte === "complet";
    essais(sortie([], "partiel"), sortie([], "complet"));
    expect((await verifie({ complet })).texte).toBe("complet");
    essais(sortie([], "partiel"), sortie([], "encore partiel"));
    expect((await verifie({ complet })).texte).toBe("encore partiel");
    expect(appels).toHaveBeenCalledTimes(4);
  });

  it("un refus lève son erreur tout de suite, sa catégorie dans le code, sans second essai", async () => {
    essais(refus("cyber"));
    await expect(verifie()).rejects.toMatchObject({ code: "refus:cyber" });
    essais(refus(null));
    await expect(verifie()).rejects.toMatchObject({ code: "refus" });
    expect(appels).toHaveBeenCalledTimes(2);
  });

  it("passe à appeler ses options nommées : la conv, l’étiquette, l’étape, le suivi, le signal", async () => {
    essais(sortie(["m0001"]));
    const surAvance = () => {};
    const signal = new AbortController().signal;
    await verifie({ etape: "plan", surAvance, signal });
    expect(appels).toHaveBeenCalledWith(REQ, Format, { storyId: "histoire", etiquette: "chat", etape: "plan", surAvance, signal });
  });
});

describe("appelVerifie : un suivi par essai (le chat)", () => {
  /** Le suivi d’un essai : ce qu’il a vu passer, et s’il a montré une bulle. */
  function suivis(montre: boolean[]) {
    const vus: Avance[][] = [];
    const parEssai = () => {
      const k = vus.length;
      const vu: Avance[] = [];
      vus.push(vu);
      return { surAvance: (a: Avance) => vu.push(a), rejouable: () => !montre[k] };
    };
    return { vus, parEssai };
  }

  it("rien de montré au premier essai : rejoué, avec un suivi neuf", async () => {
    const { vus, parEssai } = suivis([false, false]);
    essais(sortie(["m9999"]), sortie(["m0001"], "second"));
    expect((await verifie({ parEssai })).texte).toBe("second");
    expect(vus).toHaveLength(2);
    expect(appels.mock.calls.map((c) => c[2]?.surAvance)).toHaveLength(2);
    expect(appels.mock.calls[0][2]?.surAvance).not.toBe(appels.mock.calls[1][2]?.surAvance);
  });

  it("une bulle déjà montrée : pas de second essai, la sortie telle quelle ; illisible, l’étape échoue", async () => {
    essais(sortie(["m9999"], "premier"));
    expect((await verifie({ parEssai: suivis([true]).parEssai })).texte).toBe("premier");
    essais(illisible);
    await expect(verifie({ parEssai: suivis([true]).parEssai })).rejects.toMatchObject({ code: "sortie_illisible" });
    expect(appels).toHaveBeenCalledTimes(2);
  });
});

describe("exigerSortie : un appel fait une fois", () => {
  it("rend la sortie ; illisible, l’erreur que la route sait dire ; un refus, son ErreurTache", () => {
    const sinon = new Error("capture");
    expect(exigerSortie(sortie(["m0001"]), sinon).texte).toBe("ok");
    expect(() => exigerSortie(illisible, sinon)).toThrow(sinon);
    expect(() => exigerSortie(refus("cyber"), sinon)).toThrow(expect.objectContaining({ code: "refus:cyber" }));
    expect(() => exigerSortie(refus(null), sinon)).toThrow(ErreurTache);
  });
});
