import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/*
 * Le vrai chemin d’un appel au modèle (src/server/ia/claude.ts), sans base ni prestataire : le mode factice éteint, le
 * prestataire remplacé par un faux (definirFournisseur) qui rend la réponse que le test lui donne. Le budget, le suivi
 * des coûts, les alertes et le journal sont simulés : on regarde ce qu’ils reçoivent. L’adaptateur du SDK
 * (prestataireSDK) est lu à part, avec le vrai client du SDK sur un faux `fetch` : ce que le SDK envoie, et ce qu’il
 * rend au suivi en flux.
 */
vi.mock("@/server/env", async (original) => {
  const o = await original<typeof import("@/server/env")>();
  /* iaFactice lit l’env() de son module, pas celui-ci : on le remplace aussi */
  return { ...o, env: () => ({ ...o.env(), BLUSH_IA_FACTICE: false, ANTHROPIC_API_KEY: "cle-fictive" }), iaFactice: () => false };
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
import { appeler, definirFournisseur, prestataireSDK, type Avance, type Demande, type Ecoute, type Fournisseur, type MessageRecu } from "@/server/ia/claude";
import { noterCout } from "@/server/ia/usage";

const Format = z.object({ ok: z.boolean() });
const VERDICT: Requete = { tache: "04-verdict", blocs: [{ texte: "la conv" }] };
const USAGE = { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

/** Une réponse du modèle : ses blocs, et comment il s’est arrêté. */
const message = (content: MessageRecu["content"], autres: Partial<MessageRecu> = {}): MessageRecu => ({
  content,
  usage: USAGE,
  model: "modele-de-test",
  stop_reason: "end_turn",
  ...autres,
});
const texte = (t: string) => ({ type: "text" as const, text: t });
const repli = { type: "fallback" as const, from: { model: "premier" }, to: { model: "second" }, trigger: { category: "cyber" } };

type Envoi = Parameters<Fournisseur["envoyer"]>;
/** Le faux prestataire : ce qu’il reçoit, et ce qu’il fait de chaque envoi (rendre un message, lever une erreur, écrire en flux). */
function faux(...reponses: ((...envoi: Envoi) => Promise<MessageRecu>)[]) {
  const envois: Envoi[] = [];
  definirFournisseur({ envoyer: async (...envoi) => (envois.push(envoi), reponses[envois.length - 1]!(...envoi)) });
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
    expect(noterCout).toHaveBeenCalledWith(
      expect.objectContaining({ storyId: "histoire", tache: "verdict", modele: "modele-de-test", entree: 1_000_000, micros: 4_000_000, payeur: "payeur" }),
    );
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
      throw new Error("le suivi plante pour lea@exemple.test");
    };
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await appeler(VERDICT, Format, { surAvance })).sortie).toEqual({ ok: true });
    expect(vues).toEqual([
      { reflexion: 3, texte: 0, ecrit: "" },
      { reflexion: 3, texte: 6, ecrit: '{"ok":' },
      { reflexion: 0, texte: 11, ecrit: '{"ok":true}' },
    ]);
    /* Le suivi plante à chaque morceau : une seule ligne au journal, avec la tâche, sans le message */
    expect(erreur.mock.calls.map((c) => JSON.parse(String(c[0])) as unknown)).toEqual([
      { evenement: "suivi de l’avance en erreur", niveau: "erreur", tache: "04-verdict", erreur: "Error" },
    ]);
    erreur.mockRestore();
  });

  it("le délai et les nouvelles tentatives du SDK tiennent dans le temps qui reste : partagé en flux, plein d’un bloc, l’échéance arrête tout", async () => {
    const ok = rend(message([texte('{"ok":true}')]));
    const envois = faux(ok, ok, ok, ok, ok);
    const enFlux = { surAvance: () => {} };
    await appeler(VERDICT, Format);
    await appeler(VERDICT, Format, enFlux);
    await avecEcheance(200_000, () => appeler(VERDICT, Format, enFlux));
    await avecEcheance(200_000, () => appeler(VERDICT, Format));
    await avecEcheance(100_000, () => appeler(VERDICT, Format));
    /* Sans échéance (un script) : trois tentatives, de 600 s d’un bloc, de 200 s jusqu’au début du flux ; rien d’autre ne les arrête */
    expect(envois[0]![1]).toEqual({ timeout: 600_000, maxRetries: 2 });
    expect(envois[1]![1]).toEqual({ timeout: 200_000, maxRetries: 2 });
    /* 200 s, en flux : deux tentatives, qui attendent le début du flux chacune sa part du temps qui reste (moins la marge de delaiAppel) */
    expect(envois[2]![1].maxRetries).toBe(1);
    expect(envois[2]![1].timeout * 2).toBeLessThanOrEqual(195_000);
    expect(envois[2]![1].timeout).toBeGreaterThan(90_000);
    /* 200 s, d’un bloc : un verdict long garde tout le temps qui reste ; une deuxième tentative ne part qu’après un échec rapide */
    expect(envois[3]![1].maxRetries).toBe(1);
    expect(envois[3]![1].timeout).toBeGreaterThan(190_000);
    expect(envois[3]![1].timeout).toBeLessThanOrEqual(195_000);
    /* Avec une échéance, le signal arrête l’appel entier avant elle */
    for (const e of envois.slice(2)) expect(e[1].signal).toBeInstanceOf(AbortSignal);
    /* 100 s : une seule */
    expect(envois[4]![1].maxRetries).toBe(0);
    expect(envois[4]![1].timeout).toBeLessThanOrEqual(95_000);
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

  it("passe au prestataire la requête et sa partie, avec les paramètres du SDK", async () => {
    const envois = faux(rend(message([texte('{"ok":true}')])));
    await appeler(VERDICT, Format, { partie: "plan" });
    expect(envois[0]![0]).toMatchObject({ requete: VERDICT, partie: "plan", params: { model: expect.any(String), messages: [{ role: "user" }] } });
  });
});

/* ———— L’adaptateur du SDK, sur un faux `fetch` ———— */

const PARAMS: Demande["params"] = { model: "claude-opus-5-5", max_tokens: 100, messages: [{ role: "user", content: "la conv" }] };
const DEMANDE: Demande = { requete: VERDICT, partie: null, params: PARAMS };
const OPTIONS = { timeout: 5_000, maxRetries: 0 };
const MESSAGE_SDK = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 5 },
};

/** Une réponse en flux, comme l’API l’écrit : un événement par bloc `event:` / `data:`. */
const flux = (...evenements: Record<string, unknown>[]) =>
  new Response(evenements.map((e) => `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream", "request-id": "req_flux" },
  });
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json", "request-id": "req_1" } });

/** Un client du SDK dont `fetch` rend, envoi après envoi, les réponses données ; et ce qu’il a reçu (corps, en-têtes). */
function clientSDK(...reponses: (() => Response)[]) {
  const recus: { corps: Record<string, unknown>; beta: string | null }[] = [];
  const client = new Anthropic({
    apiKey: "cle-fictive",
    maxRetries: 0,
    fetch: async (_url, init) => {
      recus.push({ corps: JSON.parse(String(init?.body)) as Record<string, unknown>, beta: new Headers(init?.headers).get("anthropic-beta") });
      return reponses[recus.length - 1]!();
    },
  });
  return { sdk: prestataireSDK(() => client), recus };
}

/** Un suivi qui note tout ce qu’il reçoit, dans l’ordre. */
function ecouteNotee() {
  const vu: string[] = [];
  const ecoute: Ecoute = { bloc: (t) => vu.push(`bloc ${t}`), reflexion: (d) => vu.push(`réflexion ${d}`), texte: (d) => vu.push(`texte ${d}`) };
  return { ecoute, vu };
}

describe("prestataireSDK : le vrai client du SDK", () => {
  it("compte son délai à chaque tentative : un prestataire muet est attendu `timeout` par tentative, puis abandonné", async () => {
    const debuts: number[] = [];
    const client = new Anthropic({
      apiKey: "cle-fictive",
      fetch: (_url, init) =>
        new Promise<Response>((_, rejeter) => {
          debuts.push(Date.now());
          init?.signal?.addEventListener("abort", () => rejeter(init.signal?.reason ?? new Error("abort")));
        }),
    });
    const sdk = prestataireSDK(() => client);
    const debut = Date.now();
    await expect(sdk.envoyer(DEMANDE, { timeout: 50, maxRetries: 1 }, { flux: false, ecoute: null })).rejects.toBeInstanceOf(Anthropic.APIConnectionTimeoutError);
    expect(debuts).toHaveLength(2);
    /* Deux attentes de 50 ms et la pause du SDK entre elles (moins d’une seconde) : le délai ne couvre pas tout l’appel */
    expect(Date.now() - debut).toBeGreaterThanOrEqual(100);
    expect(Date.now() - debut).toBeLessThan(3_000);
  });

  it("d’un bloc : une seule requête, sans flux, et le message rendu tel quel", async () => {
    const { sdk, recus } = clientSDK(() => json({ ...MESSAGE_SDK, content: [{ type: "text", text: '{"ok":true}', citations: null }] }));
    const m = await sdk.envoyer(DEMANDE, OPTIONS, { flux: false, ecoute: null });
    expect(m.content).toEqual([{ type: "text", text: '{"ok":true}', citations: null }]);
    expect(m._request_id).toBe("req_1");
    expect(recus[0]!.corps.stream).toBeUndefined();
  });

  it("en flux : chaque bloc qui commence, la réflexion et le texte arrivent au suivi, repli compris ; puis le message entier", async () => {
    const { sdk, recus } = clientSDK(() =>
      flux(
        { type: "message_start", message: { ...MESSAGE_SDK, content: [], stop_reason: null } },
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } },
        { type: "content_block_stop", index: 0 },
        { type: "content_block_start", index: 1, content_block: { type: "fallback", from: { model: "premier" }, to: { model: "second" }, trigger: { category: "cyber" } } },
        { type: "content_block_stop", index: 1 },
        { type: "content_block_start", index: 2, content_block: { type: "text", text: "", citations: null } },
        { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: '{"ok":' } },
        { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "true}" } },
        { type: "content_block_stop", index: 2 },
        { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } },
        { type: "message_stop" },
      ),
    );
    const { ecoute, vu } = ecouteNotee();
    const m = await sdk.envoyer(DEMANDE, OPTIONS, { flux: true, ecoute });
    expect(recus[0]!.corps.stream).toBe(true);
    expect(vu).toEqual(["bloc thinking", "réflexion hmm", "bloc fallback", "bloc text", 'texte {"ok":', "texte true}"]);
    expect(m.content.map((b) => b.type)).toEqual(["thinking", "fallback", "text"]);
    expect(m.content.at(-1)).toMatchObject({ type: "text", text: '{"ok":true}' });
    expect(m.stop_reason).toBe("end_turn");
  });

  it("demande le repli du prestataire ; s’il le refuse, renvoie sans lui, et ne le redemande plus", async () => {
    const ok = () => json({ ...MESSAGE_SDK, content: [{ type: "text", text: '{"ok":true}', citations: null }] });
    const { sdk, recus } = clientSDK(() => json({ type: "error", error: { type: "invalid_request_error", message: "fallbacks: unknown option" } }, 400), ok, ok);
    expect((await sdk.envoyer(DEMANDE, OPTIONS, { flux: false, ecoute: null })).content).toHaveLength(1);
    await sdk.envoyer(DEMANDE, OPTIONS, { flux: false, ecoute: null });
    expect(recus.map((r) => [r.corps.fallbacks ?? null, r.beta?.includes("server-side-fallback") ?? false])).toEqual([
      ["default", true],
      [null, false],
      [null, false],
    ]);
    expect(journal).toHaveBeenCalledWith("repli refusé par l’API : on s’en passe", { tache: "04-verdict" }, "alerte");
  });

  it("une autre requête refusée remonte telle quelle, et le repli reste demandé", async () => {
    const { sdk, recus } = clientSDK(
      () => json({ type: "error", error: { type: "invalid_request_error", message: "max_tokens: trop grand" } }, 400),
      () => json({ ...MESSAGE_SDK, content: [] }),
    );
    await expect(sdk.envoyer(DEMANDE, OPTIONS, { flux: false, ecoute: null })).rejects.toBeInstanceOf(Anthropic.BadRequestError);
    await sdk.envoyer(DEMANDE, OPTIONS, { flux: false, ecoute: null });
    expect(recus.map((r) => r.corps.fallbacks)).toEqual(["default", "default"]);
  });
});
