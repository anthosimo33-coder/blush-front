import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/*
 * Les lots (l’API Message Batches, src/server/ia/claude.ts), sans base ni prestataire : la requête qu’un lot envoie est
 * celle du direct, à l’octet près (sans le repli du prestataire, que l’API des lots refuse, ni le flux), et sa réponse se
 * lit par le même chemin, son coût noté à moitié prix. Le vrai client du SDK, sur un faux `fetch`, montre ce qui part
 * vraiment chez le prestataire. Le budget, le suivi des coûts et le journal sont simulés, comme dans claude.test.ts.
 */
vi.mock("@/server/env", async (original) => {
  const o = await original<typeof import("@/server/env")>();
  return { ...o, env: () => ({ ...o.env(), BLUSH_IA_FACTICE: false, ANTHROPIC_API_KEY: "cle-fictive" }), iaFactice: () => false };
});
vi.mock("@/server/budget", () => ({ controlerBudget: vi.fn(async () => "payeur") }));
vi.mock("@/server/ia/usage", () => ({ noterCout: vi.fn(async () => {}) }));
vi.mock("@/server/alertes", () => ({ alerter: vi.fn(async () => {}) }));
vi.mock("@/server/journal", async (original) => ({ ...(await original<typeof import("@/server/journal")>()), journal: vi.fn() }));

import type { Requete } from "@prompts/lib/contextes";
import { controlerBudget } from "@/server/budget";
import { journal } from "@/server/journal";
import {
  appeler,
  cout,
  definirFournisseur,
  definirFournisseurDeLots,
  envoyerEnLot,
  erreurPassagere,
  lireLeResultat,
  lotsSDK,
  prestataireSDK,
  type Demande,
  type FournisseurDeLots,
  type MessageRecu,
} from "@/server/ia/claude";
import { noterCout } from "@/server/ia/usage";

const Format = z.object({ ok: z.boolean() });
/* Une mise à jour de la mémoire : la mémoire (un bloc mis en cache), puis les échanges */
const MAJ: Requete = { tache: "07-memoire", effort: "low", blocs: [{ texte: "la mémoire", cache: true }, { texte: "les échanges" }] };
const MILLION = { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const reponse = (autres: Partial<MessageRecu> = {}): MessageRecu => ({
  content: [{ type: "text", text: '{"ok":true}' }],
  usage: MILLION,
  model: "claude-opus-5-5",
  stop_reason: "end_turn",
  ...autres,
});

/** Un faux prestataire des lots : ce qu’on lui envoie, et un lot qui ne finit jamais (le test ne lit que l’envoi). */
function fauxLots(gratuit = false) {
  const envois: { id: string; demande: Demande }[] = [];
  const f: FournisseurDeLots = {
    ...(gratuit ? { gratuit } : {}),
    envoyer: async (requetes) => (envois.push(...requetes), "lot_1"),
    etat: async () => "en_cours",
    resultats: async () => [],
    annuler: async () => {},
    effacer: async () => {},
    recents: async () => [],
  };
  definirFournisseurDeLots(f);
  return envois;
}

/** La demande que le direct envoie au prestataire pour cette requête (le faux prestataire la garde). */
async function demandeDuDirect(req: Requete): Promise<Demande> {
  const envois: Demande[] = [];
  definirFournisseur({ envoyer: async (d) => (envois.push(d), reponse()) });
  await appeler(req, Format, { storyId: "histoire", partie: "mise à jour" });
  return envois[0]!;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  definirFournisseur(null);
  definirFournisseurDeLots(null);
});

describe("envoyerEnLot : la même requête qu’en direct", () => {
  it("les mêmes paramètres, la même requête et sa partie, sous l’identifiant de sa tâche ; le budget du jour contrôlé avant, les lots en vol comptés d’avance", async () => {
    const direct = await demandeDuDirect(MAJ);
    const envois = fauxLots();
    const reserve = { jour: 300_000, payeur: 100_000 };
    expect(await envoyerEnLot("tache-1", MAJ, Format, { storyId: "histoire", partie: "mise à jour", reserve })).toBe("lot_1");
    expect(envois.map((e) => e.id)).toEqual(["tache-1"]);
    /* Comparées par égalité (un booléen) : un échec n’affiche pas le système dans les journaux de la CI, qui sont publics */
    expect(JSON.stringify(envois[0]!.demande) === JSON.stringify(direct)).toBe(true);
    expect(controlerBudget).toHaveBeenLastCalledWith({ storyId: "histoire", reserve });
  });

  it("chez le prestataire : le corps du lot est celui du direct, à l’octet près, sans le repli ni le flux, et sans aucun en-tête bêta", async () => {
    const demande = await demandeDuDirect(MAJ);
    const recus: { url: string; methode: string; corps: Record<string, unknown>; beta: string | null }[] = [];
    const client = new Anthropic({
      apiKey: "cle-fictive",
      maxRetries: 0,
      fetch: async (url, init) => {
        recus.push({
          url: String(url),
          methode: init?.method ?? "GET",
          corps: JSON.parse(String(init?.body)) as Record<string, unknown>,
          beta: new Headers(init?.headers).get("anthropic-beta"),
        });
        if (String(url).includes("/batches")) return json({ ...LOT, processing_status: "in_progress" });
        return flux(
          { type: "message_start", message: { ...MESSAGE, content: [], stop_reason: null } },
          { type: "content_block_start", index: 0, content_block: { type: "text", text: "", citations: null } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: '{"ok":true}' } },
          { type: "content_block_stop", index: 0 },
          { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } },
          { type: "message_stop" },
        );
      },
    });
    /* La mise à jour de la mémoire passe en flux en direct (REGLAGES) : comme ici */
    await prestataireSDK(() => client).envoyer(demande, { timeout: 5_000, maxRetries: 0 }, { flux: true, ecoute: null });
    expect(await lotsSDK(() => client).envoyer([{ id: "tache-1", demande }])).toBe("msgbatch_1");
    const [direct, lot] = recus;
    expect(direct!.url).toMatch(/\/v1\/messages\?beta=true$/);
    expect(direct!.beta).toContain("server-side-fallback");
    expect(direct!.corps).toMatchObject({ fallbacks: "default", stream: true });
    expect(lot).toMatchObject({ methode: "POST", beta: null });
    expect(lot!.url).toMatch(/\/v1\/messages\/batches$/);
    const requetes = lot!.corps.requests as { custom_id: string; params: unknown }[];
    /* L’identifiant de la tâche, précédé de ce qui reconnaît nos lots (le ménage) : rien de lui ne part au modèle */
    expect(requetes.map((r) => r.custom_id)).toEqual(["blush-maj-tache-1"]);
    /* Le direct sans son repli ni son flux, ses autres champs dans leur ordre */
    const sansRepli = Object.fromEntries(Object.entries(direct!.corps).filter(([cle]) => cle !== "fallbacks" && cle !== "stream"));
    expect(JSON.stringify(requetes[0]!.params) === JSON.stringify(sansRepli)).toBe(true);
    /* Ce que le lot garde : le format de sortie, l’effort, la réflexion, le cache du système et des blocs */
    expect(requetes[0]!.params).toMatchObject({ output_config: { effort: "low", format: { type: "json_schema" } }, thinking: { type: "adaptive", display: "summarized" } });
    expect(JSON.stringify(requetes[0]!.params).match(/"cache_control":\{"type":"ephemeral"\}/g)).toHaveLength(2);
  });
});

/* ———— Le vrai client du SDK, sur un faux `fetch` ———— */

const MESSAGE = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 5 },
};
const LOT = {
  id: "msgbatch_1",
  type: "message_batch",
  processing_status: "ended",
  request_counts: { processing: 0, succeeded: 1, errored: 1, canceled: 1, expired: 1 },
  ended_at: null,
  created_at: "2026-10-26T10:00:00Z",
  expires_at: "2026-10-27T10:00:00Z",
  archived_at: null,
  cancel_initiated_at: null,
  results_url: "https://api.anthropic.com/v1/messages/batches/msgbatch_1/results",
};
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json", "request-id": "req_1" } });
const flux = (...evenements: Record<string, unknown>[]) =>
  new Response(evenements.map((e) => `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
const introuvable = () => json({ type: "error", error: { type: "not_found_error", message: "pas de lot" } }, 404);

/** Le prestataire des lots du SDK, dont `fetch` rend, appel après appel, les réponses données ; et ce qu’il a reçu. */
function lotsSurFaux(...reponses: (() => Response)[]) {
  const recus: { url: string; methode: string }[] = [];
  const client = new Anthropic({
    apiKey: "cle-fictive",
    maxRetries: 0,
    fetch: async (url, init) => {
      recus.push({ url: String(url), methode: init?.method ?? "GET" });
      return reponses[recus.length - 1]!();
    },
  });
  return { lots: lotsSDK(() => client), recus };
}

describe("lotsSDK : où en est un lot, ses réponses, l’annuler, l’effacer", () => {
  it("en cours (ou en train de s’annuler), fini, ou disparu", async () => {
    const { lots } = lotsSurFaux(
      () => json({ ...LOT, processing_status: "in_progress" }),
      () => json({ ...LOT, processing_status: "canceling" }),
      () => json(LOT),
      introuvable,
    );
    expect([await lots.etat("msgbatch_1"), await lots.etat("msgbatch_1"), await lots.etat("msgbatch_1"), await lots.etat("msgbatch_1")]).toEqual([
      "en_cours",
      "en_cours",
      "fini",
      "introuvable",
    ]);
  });

  it("les réponses d’un lot fini, par identifiant de tâche : la réponse, une erreur (son type), annulée, expirée ; une requête qui n’est pas à nous, sans identifiant", async () => {
    const lignes = [
      { custom_id: "blush-maj-t-ok", result: { type: "succeeded", message: { ...MESSAGE, content: [{ type: "text", text: '{"ok":true}', citations: null }] } } },
      { custom_id: "blush-maj-t-erreur", result: { type: "errored", error: { type: "error", error: { type: "overloaded_error", message: "surchargé" } } } },
      { custom_id: "blush-maj-t-annulee", result: { type: "canceled" } },
      { custom_id: "blush-maj-t-expiree", result: { type: "expired" } },
      { custom_id: "eval-42", result: { type: "expired" } },
    ];
    const { lots, recus } = lotsSurFaux(
      () => json(LOT),
      () => new Response(lignes.map((l) => JSON.stringify(l)).join("\n"), { headers: { "content-type": "application/binary" } }),
    );
    const lues = await lots.resultats("msgbatch_1");
    expect(lues.map((r) => [r.id, r.issue.type])).toEqual([
      ["t-ok", "succeeded"],
      ["t-erreur", "errored"],
      ["t-annulee", "canceled"],
      ["t-expiree", "expired"],
      [null, "expired"],
    ]);
    expect(lues[1]!.issue).toEqual({ type: "errored", code: "overloaded_error" });
    expect(recus.map((r) => r.url)).toEqual([expect.stringMatching(/\/v1\/messages\/batches\/msgbatch_1$/), LOT.results_url]);
  });

  it("l’annuler, puis l’effacer (déjà effacé : rien à refaire)", async () => {
    const { lots, recus } = lotsSurFaux(
      () => json({ ...LOT, processing_status: "canceling" }),
      () => json({ id: "msgbatch_1", type: "message_batch_deleted" }),
      introuvable,
    );
    await lots.annuler("msgbatch_1");
    await lots.effacer("msgbatch_1");
    await lots.effacer("msgbatch_1");
    expect(recus.map((r) => [r.methode, r.url.replace(/^.*\/v1/, "")])).toEqual([
      ["POST", "/messages/batches/msgbatch_1/cancel"],
      ["DELETE", "/messages/batches/msgbatch_1"],
      ["DELETE", "/messages/batches/msgbatch_1"],
    ]);
  });
});

/** Le prestataire des lots du SDK sur un client qui réessaie (le défaut du SDK : 2 nouveaux essais) : ce que nos options en gardent. */
function lotsQuiReessaient(...reponses: (() => Response)[]) {
  const recus: string[] = [];
  const client = new Anthropic({
    apiKey: "cle-fictive",
    fetch: async (url) => {
      recus.push(String(url));
      return reponses[recus.length - 1]!();
    },
  });
  return { lots: lotsSDK(() => client), recus };
}
/** Le prestataire surchargé (529), qui demande d’attendre 1 ms avant de réessayer : le test n’attend pas. */
const surcharge = () =>
  new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "surchargé" } }), {
    status: 529,
    headers: { "content-type": "application/json", "retry-after-ms": "1" },
  });

describe("lotsSDK : les nouveaux essais, la liste des lots", () => {
  it("l’envoi n’est jamais réessayé (un nouvel essai après une réponse perdue ferait un second lot) ; surchargé ou coupé, c’est passager, un refus net non", async () => {
    const demande = await demandeDuDirect(MAJ);
    const surcharges = lotsQuiReessaient(surcharge, () => json(LOT));
    const e = await surcharges.lots.envoyer([{ id: "tache-1", demande }]).catch((x: unknown) => x);
    expect(surcharges.recus).toHaveLength(1);
    expect(erreurPassagere(e)).toBe(true);
    expect(erreurPassagere(new Anthropic.APIConnectionError({ message: "coupé" }))).toBe(true);
    const refuse = lotsQuiReessaient(() => json({ type: "error", error: { type: "invalid_request_error", message: "non" } }, 400));
    expect(erreurPassagere(await refuse.lots.envoyer([{ id: "tache-1", demande }]).catch((x: unknown) => x))).toBe(false);
  });

  it("au passage des 5 minutes, un nouvel essai ; sur le chemin d’une requête (`court`), aucun : la mise à jour part en direct", async () => {
    const auPassage = lotsQuiReessaient(surcharge, () => json(LOT));
    expect(await auPassage.lots.etat("msgbatch_1")).toBe("fini");
    expect(auPassage.recus).toHaveLength(2);
    const court = lotsQuiReessaient(surcharge, () => json(LOT));
    await expect(court.lots.etat("msgbatch_1", { court: true })).rejects.toBeInstanceOf(Anthropic.InternalServerError);
    expect(court.recus).toHaveLength(1);
  });

  it("les lots récents de l’espace de travail : les plus récents d’abord, jusqu’au premier créé avant la date, sans lire la page suivante", async () => {
    const page = {
      data: [
        {
          ...LOT,
          id: "msgbatch_3",
          created_at: "2026-10-26T12:00:00Z",
          processing_status: "in_progress",
          request_counts: { processing: 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
        },
        { ...LOT, id: "msgbatch_2", created_at: "2026-10-26T11:00:00Z" },
        { ...LOT, id: "msgbatch_1", created_at: "2026-10-24T09:00:00Z" },
      ],
      has_more: true,
      first_id: "msgbatch_3",
      last_id: "msgbatch_1",
    };
    const { lots, recus } = lotsSurFaux(() => json(page));
    expect(await lots.recents(new Date("2026-10-25T00:00:00Z"))).toEqual([
      { id: "msgbatch_3", fini: false, requetes: 1, creeLe: new Date("2026-10-26T12:00:00Z") },
      { id: "msgbatch_2", fini: true, requetes: 4, creeLe: new Date("2026-10-26T11:00:00Z") },
    ]);
    expect(recus).toHaveLength(1);
    expect(recus[0]!.url).toMatch(/\/v1\/messages\/batches\?limit=100$/);
  });
});

describe("lireLeResultat : la réponse d’un lot, à moitié prix", () => {
  it("la sortie lue comme en direct ; son coût noté à moitié prix, sous son étiquette, au compte de la conv", async () => {
    fauxLots();
    expect(cout(MILLION, "claude-opus-5-5", { lot: true })).toBe(cout(MILLION, "claude-opus-5-5") / 2);
    const a = await lireLeResultat(reponse(), Format, { storyId: "histoire", payeur: "payeur-du-lot", etiquette: "memoire_maj_lot", ms: 1234 });
    expect(a).toEqual({ sortie: { ok: true }, refus: false, stop: "end_turn", cout: 2 });
    expect(noterCout).toHaveBeenCalledWith(
      expect.objectContaining({ storyId: "histoire", tache: "memoire_maj_lot", micros: 2_000_000, ms: 1234, payeur: "payeur-du-lot", entree: 1_000_000 }),
    );
  });

  it("un refus : rendu comme tel (la mise à jour repartira en direct, avec le repli), et dit au journal ; le modèle factice ne note rien", async () => {
    fauxLots();
    const refus = await lireLeResultat(reponse({ content: [], stop_reason: "refusal", stop_details: { category: "cyber" } }), Format, {
      payeur: null,
      etiquette: "memoire_maj_lot",
      ms: 0,
    });
    expect(refus).toMatchObject({ sortie: null, refus: true, categorie: "cyber" });
    expect(journal).toHaveBeenCalledWith("refus du modèle", expect.objectContaining({ tache: "memoire_maj_lot", categorie: "cyber" }), "alerte");
    vi.mocked(noterCout).mockClear();
    fauxLots(true);
    await lireLeResultat(reponse(), Format, { payeur: null, etiquette: "memoire_maj_lot", ms: 0 });
    expect(noterCout).not.toHaveBeenCalled();
  });
});
