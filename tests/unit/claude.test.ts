import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/*
 * Le vrai chemin d’un appel au modèle (src/server/ia/claude.ts), sans base ni prestataire : le mode factice éteint, le
 * prestataire remplacé par un faux (definirFournisseur) qui rend la réponse que le test lui donne. Le budget, le suivi
 * des coûts, les alertes et le journal sont simulés : on regarde ce qu’ils reçoivent.
 */
vi.mock("@/server/env", async (original) => {
  const o = await original<typeof import("@/server/env")>();
  return { ...o, env: () => ({ ...o.env(), BLUSH_IA_FACTICE: false, ANTHROPIC_API_KEY: "cle-fictive" }) };
});
vi.mock("@/server/budget", () => ({ controlerBudget: vi.fn(async () => "payeur") }));
vi.mock("@/server/ia/usage", () => ({ noterCout: vi.fn(async () => {}) }));
vi.mock("@/server/alertes", () => ({ alerter: vi.fn(async () => {}) }));
vi.mock("@/server/journal", async (original) => ({ ...(await original<typeof import("@/server/journal")>()), journal: vi.fn() }));

import type { Requete } from "@prompts/lib/contextes";
import { alerter } from "@/server/alertes";
import { controlerBudget } from "@/server/budget";
import { avecEcheance } from "@/server/echeance";
import { ErreurTache } from "@/server/erreurs";
import { journal } from "@/server/journal";
import { appeler, definirFournisseur, type Avance, type Fournisseur, type MessageRecu } from "@/server/ia/claude";
import { noterCout } from "@/server/ia/usage";

const Format = z.object({ ok: z.boolean() });
const VERDICT: Requete = { tache: "04-verdict", blocs: [{ texte: "la conv" }] };
const USAGE = { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

/** Une réponse du modèle : ses blocs, et comment il s’est arrêté. */
const message = (content: MessageRecu["content"], autres: Partial<MessageRecu> = {}): MessageRecu => ({ content, usage: USAGE, model: "modele-de-test", stop_reason: "end_turn", ...autres });
const texte = (t: string) => ({ type: "text", text: t });
const repli = { type: "fallback", from: { model: "premier" }, to: { model: "second" }, trigger: { category: "cyber" } };

type Envoi = Parameters<Fournisseur["envoyer"]>;
/** Le faux prestataire : ce qu’il reçoit, et ce qu’il fait de chaque envoi (rendre un message, lever une erreur, écrire en flux). */
function faux(...reponses: ((...envoi: Envoi) => Promise<MessageRecu>)[]) {
  const envois: Envoi[] = [];
  definirFournisseur({ envoyer: async (...envoi) => (envois.push(envoi), reponses[envois.length - 1](...envoi)) });
  return envois;
}
const rend = (m: MessageRecu) => async () => m;

beforeEach(() => vi.clearAllMocks());
afterEach(() => definirFournisseur(null));

describe("appeler : la réponse du modèle", () => {
  it("lit la sortie, note son coût (au tarif du modèle) sous son étiquette, au compte de qui paie", async () => {
    faux(rend(message([texte('{"ok":true}')])));
    const a = await appeler(VERDICT, Format, { storyId: "histoire", etiquette: "verdict" });
    expect(a).toEqual({ sortie: { ok: true }, refus: false, stop: "end_turn", cout: 4 });
    expect(noterCout).toHaveBeenCalledWith(expect.objectContaining({ storyId: "histoire", tache: "verdict", modele: "modele-de-test", entree: 1_000_000, micros: 4_000_000, payeur: "payeur" }));
  });

  it("un texte qui n’est pas la sortie attendue : pas de sortie, pas de refus", async () => {
    faux(rend(message([texte("je ne sais pas")])), rend(message([texte('{"ok":"oui"}')])));
    expect((await appeler(VERDICT, Format)).sortie).toBeNull();
    expect((await appeler(VERDICT, Format)).sortie).toBeNull();
  });

  it("un refus : sa catégorie et l’identifiant de la requête au journal, jamais de contenu", async () => {
    faux(rend(message([texte('{"ok":true}')], { stop_reason: "refusal", stop_details: { category: "cyber" }, _request_id: "req_1" })));
    expect(await appeler(VERDICT, Format, { storyId: "histoire" })).toMatchObject({ sortie: null, refus: true, categorie: "cyber" });
    expect(journal).toHaveBeenCalledWith("refus du modèle", { tache: "04-verdict", categorie: "cyber", requete: "req_1" }, "alerte");
  });

  it("un repli sur un autre modèle : seul ce qu’il a écrit compte, l’équipe est prévenue pour une conv", async () => {
    faux(rend(message([texte('{"ok":'), repli, texte('{"ok":false}')])));
    expect((await appeler(VERDICT, Format, { storyId: "histoire" })).sortie).toEqual({ ok: false });
    expect(journal).toHaveBeenCalledWith("repli sur un autre modèle", expect.objectContaining({ categorie: "cyber", de: "premier", vers: "second" }), "alerte");
    expect(alerter).toHaveBeenCalledWith("repli sur un autre modèle", expect.arrayContaining(["Catégorie du refus : cyber", "De premier vers second"]));
  });

  it("un repli sans conv (des captures avant l’import) : au journal seulement, pas d’alerte (S-19)", async () => {
    faux(rend(message([repli, texte('{"ok":true}')])));
    expect((await appeler(VERDICT, Format)).sortie).toEqual({ ok: true });
    expect(alerter).not.toHaveBeenCalled();
  });

  it("`differer` : le coût et l’alerte passent après la réponse", async () => {
    faux(rend(message([repli, texte('{"ok":true}')])));
    const apres: (() => Promise<unknown>)[] = [];
    await appeler(VERDICT, Format, { storyId: "histoire", differer: (t) => apres.push(t) });
    expect(noterCout).not.toHaveBeenCalled();
    expect(apres).toHaveLength(2);
    await Promise.all(apres.map((t) => t()));
    expect(noterCout).toHaveBeenCalledTimes(1);
    expect(alerter).toHaveBeenCalledTimes(1);
  });
});

describe("appeler : l’envoi", () => {
  it("demande le repli du prestataire ; s’il le refuse, renvoie sans lui, et ne le redemande plus", async () => {
    /* Le repli refusé reste refusé pour l’instance : un module neuf, pour ne pas le refuser aux autres tests */
    vi.resetModules();
    const claude = await import("@/server/ia/claude");
    const envois: Envoi[] = [];
    const reponses = [
      async () => {
        throw new Anthropic.BadRequestError(400, undefined, "fallbacks: unknown option", new Headers());
      },
      async () => message([texte('{"ok":true}')]),
      async () => message([texte('{"ok":true}')]),
    ];
    claude.definirFournisseur({ envoyer: async (...envoi) => (envois.push(envoi), reponses[envois.length - 1]()) });
    expect((await claude.appeler(VERDICT, Format)).sortie).toEqual({ ok: true });
    await claude.appeler(VERDICT, Format);
    expect(envois.map(([p]) => "fallbacks" in p)).toEqual([true, false, false]);
    claude.definirFournisseur(null);
  });

  it("une autre erreur du prestataire remonte telle quelle", async () => {
    faux(async () => {
      throw new Anthropic.InternalServerError(500, undefined, "panne", new Headers());
    });
    await expect(appeler(VERDICT, Format)).rejects.toBeInstanceOf(Anthropic.InternalServerError);
  });

  it("d’un bloc ou en flux : le flux pour les longues sorties (le rapport) et pour une sortie suivie", async () => {
    const envois = faux(...Array.from({ length: 3 }, () => rend(message([texte('{"ok":true}')]))));
    await appeler(VERDICT, Format);
    await appeler({ tache: "05-rapport", blocs: [{ texte: "la conv" }] }, Format);
    await appeler(VERDICT, Format, { surAvance: () => {} });
    expect(envois.map(([, , e]) => [e.flux, !!e.ecoute])).toEqual([
      [false, false],
      [true, false],
      [true, true],
    ]);
  });

  it("suit ce qui s’écrit ; un repli repart de zéro ; un suivi qui plante ne fait pas échouer la réponse", async () => {
    faux(async (_p, _o, { ecoute }) => {
      ecoute!.reflexion("hmm");
      ecoute!.texte('{"ok":');
      ecoute!.bloc("fallback");
      ecoute!.texte('{"ok":true}');
      return message([texte('{"ok":'), repli, texte('{"ok":true}')]);
    });
    const vues: Avance[] = [];
    const surAvance = (a: Avance) => {
      vues.push(a);
      throw new Error("le suivi plante");
    };
    expect((await appeler(VERDICT, Format, { surAvance })).sortie).toEqual({ ok: true });
    expect(vues).toEqual([
      { reflexion: 3, texte: 0, ecrit: "" },
      { reflexion: 3, texte: 6, ecrit: '{"ok":' },
      { reflexion: 0, texte: 11, ecrit: '{"ok":true}' },
    ]);
  });

  it("le délai et les nouvelles tentatives du SDK tiennent dans le temps qui reste", async () => {
    const envois = faux(rend(message([texte('{"ok":true}')])), rend(message([texte('{"ok":true}')])));
    await appeler(VERDICT, Format);
    await avecEcheance(100_000, () => appeler(VERDICT, Format));
    expect(envois[0][1]).toMatchObject({ timeout: 600_000, maxRetries: 2 });
    expect(envois[1][1].maxRetries).toBe(0);
    expect(envois[1][1].timeout).toBeLessThanOrEqual(95_000);
  });

  it("plus le temps avant l’échéance : l’appel ne part pas (« delai »)", async () => {
    const envois = faux();
    await expect(avecEcheance(10_000, () => appeler(VERDICT, Format))).rejects.toMatchObject({ code: "delai" } satisfies Partial<ErreurTache>);
    expect(envois).toHaveLength(0);
  });

  it("le budget du jour atteint : rien ne part", async () => {
    vi.mocked(controlerBudget).mockRejectedValueOnce(new ErreurTache("budget"));
    const envois = faux();
    await expect(appeler(VERDICT, Format)).rejects.toMatchObject({ code: "budget" });
    expect(envois).toHaveLength(0);
  });
});
