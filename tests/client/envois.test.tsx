import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { repondeurDeLApercu } from "@/app/apercu/accueil/repondeur";
import { FIL_MAX, PAS_DE_REPONSE, TEXTE_MAX } from "@/app/apercu/demander/bornes";
import type { Msg } from "@/app/app/accueil/conv/modele";
import type { Echange } from "@/app/app/accueil/conv/useConversation";
import { useEnvois, type Envoyer } from "@/app/app/accueil/envois";
import { sendToBlush, sendVoiceToBlush, type SuiviChat } from "@/services/api";
import type { BlushAnswer } from "@/types";

/*
 * Ce qui part de la barre de saisie de l’accueil (src/app/app/accueil/envois.ts, useEnvois) : chaque envoi écrit va à
 * `envoyer` quand l’écran en donne un (l’aperçu de l’équipe), au vrai chat sinon, et un vocal toujours au vrai chat. Puis
 * le répondeur de l’aperçu (src/app/apercu/accueil/repondeur.ts) : la réponse toute prête, le chat local et son fil
 * borné, et le reste comme dans l’appli. La conv est simulée (ce que les envois en lisent), le vrai chat aussi ; chaque
 * test pose ses espions, et le fetch simulé de l’aperçu est retiré à la fin, même s’il échoue.
 */
vi.mock("@/lib/sound", () => ({ play: vi.fn() }));
vi.mock("@/services/api", async (vrai) => ({ ...(await vrai<typeof import("@/services/api")>()), sendToBlush: vi.fn(), sendVoiceToBlush: vi.fn() }));
const auVraiChat = vi.mocked(sendToBlush);
const auVraiChatEnVocal = vi.mocked(sendVoiceToBlush);

const reponse = (text: string): BlushAnswer => ({ kind: "bubbles", bubbles: [{ text }] });

beforeEach(() => {
  auVraiChat.mockReset();
  auVraiChat.mockResolvedValue(reponse("du vrai chat"));
  auVraiChatEnVocal.mockReset();
  auVraiChatEnVocal.mockResolvedValue(reponse("du vrai chat, en vocal"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* La conv déjà là quand tu envoies : une question et sa réponse */
const FIL: Msg[] = [
  { type: "texte", id: 1, from: "toi", text: "elle pense quoi ?" },
  { type: "reponse", id: 2, from: "blush", result: { kind: "bubbles", bubbles: [{ text: "elle hésite" }], send: ["on se voit ?"], ask: "et toi ?" } },
];

/** Les envois, sur une conv simulée : chaque échange demandé est noté (`echanges`), sa demande se lance à la main. */
function monter(envoyer?: Envoyer) {
  const echanges: { mine: Msg; echange: Echange }[] = [];
  const conv = {
    msgs: FIL,
    modeVocal: false,
    envoyer: vi.fn(async (mine: Msg, echange: Echange) => void echanges.push({ mine, echange })),
    direMot: vi.fn(),
  };
  const idees = { poser: vi.fn() };
  const { result } = renderHook(() => useEnvois({ conv, idees, envoyer, flightRef: { current: null }, input: createRef<HTMLInputElement>() }));
  /* La demande du dernier échange, lancée comme la conv le ferait, avec ce suivi */
  const demander = async (suivi: SuiviChat = {}) => echanges.at(-1)!.echange.demande(suivi);
  return { result, conv, idees, echanges, demander };
}

describe("les envois de la barre de saisie", () => {
  it("avec `envoyer` : ton texte, une question toute prête et des fichiers y partent, avec la conv sans ton message", async () => {
    const envoyer = vi.fn<Envoyer>(async () => reponse("de l’aperçu"));
    const { result, idees, echanges, demander } = monter(envoyer);
    const suivi: SuiviChat = { bulles: vi.fn() };

    act(() => void result.current.onText("et là ?"));
    expect(echanges.at(-1)!.mine).toMatchObject({ type: "texte", from: "toi", text: "et là ?" });
    expect(await demander(suivi)).toEqual({ type: "reponse", from: "blush", result: reponse("de l’aperçu") });
    expect(envoyer).toHaveBeenLastCalledWith({ text: "et là ?", about: undefined, cle: expect.stringMatching(/^[0-9a-f-]{36}$/) }, { msgs: FIL, suivi });

    act(() => void result.current.onQuick("je lui dis quoi ?"));
    expect(idees.poser).toHaveBeenCalledWith("je lui dis quoi ?");
    await demander(suivi);
    expect(envoyer).toHaveBeenLastCalledWith({ text: "je lui dis quoi ?", cle: expect.stringMatching(/^[0-9a-f-]{36}$/) }, { msgs: FIL, suivi });

    const capture = new File(["png"], "capture.png", { type: "image/png" });
    act(() => void result.current.onImages([capture]));
    await demander(suivi);
    expect(envoyer).toHaveBeenLastCalledWith({ files: [capture], cle: expect.stringMatching(/^[0-9a-f-]{36}$/) }, { msgs: FIL, suivi });

    const paquet = new File(["zip"], "conv.zip", { type: "application/zip" });
    act(() => void result.current.onExport([paquet]));
    expect(echanges.at(-1)!.mine).toMatchObject({ type: "fichier", file: { name: "conv.zip", size: 3 } });
    await demander(suivi);
    expect(envoyer).toHaveBeenLastCalledWith({ files: [paquet], cle: expect.stringMatching(/^[0-9a-f-]{36}$/) }, { msgs: FIL, suivi });

    /* Le point creusé part avec ta question suivante, une seule fois */
    act(() => void result.current.dig("elle hésite"));
    act(() => void result.current.onText("pourquoi ?"));
    await demander(suivi);
    expect(envoyer).toHaveBeenLastCalledWith({ text: "pourquoi ?", about: "elle hésite", cle: expect.stringMatching(/^[0-9a-f-]{36}$/) }, { msgs: FIL, suivi });
    expect(result.current.about).toBeNull();

    expect(envoyer).toHaveBeenCalledTimes(5);
    expect(auVraiChat).not.toHaveBeenCalled();
  });

  it("sans `envoyer` : ton texte part au vrai chat, avec son suivi", async () => {
    const { result, demander } = monter();
    const suivi: SuiviChat = { bulles: vi.fn() };
    act(() => void result.current.onText("et là ?"));
    expect(await demander(suivi)).toEqual({ type: "reponse", from: "blush", result: reponse("du vrai chat") });
    expect(auVraiChat).toHaveBeenCalledWith({ text: "et là ?", about: undefined, cle: expect.stringMatching(/^[0-9a-f-]{36}$/) }, suivi);
  });

  it("« Réessayer » relance la même demande : la même clé (le serveur ne débite jamais deux fois le même message) ; un autre message, une autre clé", async () => {
    const { result, demander } = monter();
    act(() => void result.current.onText("et là ?"));
    await demander();
    await demander();
    const [premier, reessai] = auVraiChat.mock.calls.map(([p]) => p.cle);
    expect(premier).toMatch(/^[0-9a-f-]{36}$/);
    expect(reessai).toBe(premier);
    act(() => void result.current.onText("et après ?"));
    await demander();
    expect(auVraiChat.mock.calls.at(-1)![0].cle).not.toBe(premier);
    const blob = new Blob(["son"], { type: "audio/webm" });
    act(() => void result.current.onVoice({ url: "blob:vocal", blob, seconds: 4, peaks: [0.2] }));
    await demander();
    await demander();
    const [vocal, vocalEncore] = auVraiChatEnVocal.mock.calls.map(([p]) => p.cle);
    expect(vocal).toMatch(/^[0-9a-f-]{36}$/);
    expect(vocalEncore).toBe(vocal);
  });

  it("ton vocal part toujours au vrai chat, même avec `envoyer`, et sa réponse est attendue en vocal", async () => {
    const envoyer = vi.fn<Envoyer>();
    const { result, echanges, demander } = monter(envoyer);
    const blob = new Blob(["son"], { type: "audio/webm" });
    act(() => void result.current.onVoice({ url: "blob:vocal", blob, seconds: 4, peaks: [0.2, 0.8] }));
    expect(echanges.at(-1)!.echange.vocal).toBe(true);
    const suivi: SuiviChat = { vocal: vi.fn() };
    expect(await demander(suivi)).toEqual({ type: "reponse", from: "blush", result: reponse("du vrai chat, en vocal") });
    expect(auVraiChatEnVocal).toHaveBeenCalledWith({ audio: blob, seconds: 4, cle: expect.stringMatching(/^[0-9a-f-]{36}$/) }, suivi);
    expect(envoyer).not.toHaveBeenCalled();
  });

  it("un vocal vide : BLUSH le dit dans la conv, rien ne part", () => {
    const { result, conv, echanges } = monter(vi.fn<Envoyer>());
    act(() => void result.current.onVoice("empty"));
    expect(conv.direMot).toHaveBeenCalledOnce();
    expect(echanges).toHaveLength(0);
  });
});

describe("le répondeur de l’aperçu", () => {
  const PRETE = reponse("la réponse toute prête");
  const suivi: SuiviChat = {};

  /** Le chat local simulé : ce qu’il reçoit, et ce qu’il répond (`statut`, `corps`). */
  function chatLocal(statut = 200, corps: unknown = reponse("du chat local")) {
    const appels: { url: string; corps: { text: string; history: { from: string; text: string }[] } }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        appels.push({ url, corps: JSON.parse(String(init.body)) });
        return new Response(statut === 200 ? JSON.stringify(corps) : null, { status: statut });
      }),
    );
    return appels;
  }

  it("une question toute prête : sa réponse écrite, après un temps de lecture, sans rien envoyer", async () => {
    vi.useFakeTimers();
    const appels = chatLocal();
    const repondre = repondeurDeLApercu({ "je lui dis quoi ?": PRETE }, "/apercu/demander");
    const attendue = repondre({ text: "je lui dis quoi ?" }, { msgs: FIL, suivi });
    await vi.advanceTimersByTimeAsync(1600);
    expect(await attendue).toBe(PRETE);
    expect(appels).toHaveLength(0);
    expect(auVraiChat).not.toHaveBeenCalled();
  });

  it("une autre question : au chat local, avec les derniers messages du fil, chacun borné", async () => {
    const appels = chatLocal();
    const long = "a".repeat(TEXTE_MAX + 500);
    const fil: Msg[] = [
      ...Array.from({ length: FIL_MAX }, (_, i): Msg => ({ type: "texte", id: 10 + i, from: "toi", text: `question ${i}` })),
      { type: "reponse", id: 20, from: "blush", result: { kind: "bubbles", bubbles: [{ text: long }, { text: "bref" }], send: ["vas-y"], ask: "et toi ?" } },
      { type: "mot", id: 21, from: "blush", notice: "Je n’ai rien entendu." },
    ];
    expect(await repondeurDeLApercu({}, "/apercu/demander")({ text: "et là ?" }, { msgs: fil, suivi })).toEqual(reponse("du chat local"));
    expect(appels).toHaveLength(1);
    const { url, corps } = appels[0]!;
    expect(url).toBe("/apercu/demander");
    expect(corps.text).toBe("et là ?");
    /* Les FIL_MAX derniers messages (un mot de BLUSH n’en est pas un) : la réponse de BLUSH, ses bulles jointes, coupée */
    expect(corps.history).toHaveLength(FIL_MAX);
    expect(corps.history.at(0)).toEqual({ from: "toi", text: "question 1" });
    expect(corps.history.at(-1)).toEqual({ from: "blush", text: `${long} / bref / vas-y / et toi ?`.slice(0, TEXTE_MAX) });
    expect(auVraiChat).not.toHaveBeenCalled();
  });

  it("le chat local refuse ou ne répond pas : BLUSH le dit, la conv continue", async () => {
    chatLocal(400);
    expect(await repondeurDeLApercu({}, "/apercu/demander")({ text: "et là ?" }, { msgs: FIL, suivi })).toEqual(PAS_DE_REPONSE);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(await repondeurDeLApercu({}, "/apercu/demander")({ text: "et là ?" }, { msgs: FIL, suivi })).toEqual(PAS_DE_REPONSE);
  });

  it("des fichiers, ou sans chat local : comme dans l’appli, au vrai chat avec son suivi", async () => {
    const appels = chatLocal();
    const capture = new File(["png"], "capture.png", { type: "image/png" });
    await repondeurDeLApercu({}, "/apercu/demander")({ files: [capture] }, { msgs: FIL, suivi });
    expect(auVraiChat).toHaveBeenLastCalledWith({ files: [capture] }, suivi);
    await repondeurDeLApercu({})({ text: "et là ?" }, { msgs: FIL, suivi });
    expect(auVraiChat).toHaveBeenLastCalledWith({ text: "et là ?" }, suivi);
    expect(appels).toHaveLength(0);
  });
});
