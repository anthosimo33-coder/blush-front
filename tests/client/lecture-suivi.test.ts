import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apresUnRate, attenteApresRates, DUREE_AVANT_PAIEMENT_MS, DUREE_DE_LA_PRISE_MS, lectureDerouleeA, RATES_MAX, refusDuLancement, useSuiviLecture } from "@/app/lecture/suivi";
import { getAnalysisProgress, resumeAnalysis } from "@/services/api";
import { connexionPuis } from "@/lib/suite";
import { retenirLecture } from "@/state/lecture";
import { ErreurApi } from "@/types/erreurs-api";
import type { AnalysisProgress } from "@/types";

/*
 * Le suivi de la lecture (src/app/lecture/suivi.ts) : ses règles pures (l’attente après un appel raté, ce qu’un refus
 * veut dire), puis le hook, qui lance la lecture et la suit jusqu’à son verdict. Le serveur et le routeur sont simulés,
 * les minuteurs aussi : le temps n’avance que quand le test le dit (avancer).
 */
const routeur = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routeur }));
vi.mock("@/services/api", async (vrai) => ({ ...(await vrai<typeof import("@/services/api")>()), getAnalysisProgress: vi.fn(), resumeAnalysis: vi.fn() }));

const suivi = vi.mocked(getAnalysisProgress);
const relance = vi.mocked(resumeAnalysis);

const enCours = (stepsDone = 1): AnalysisProgress => ({ progress: 0.2 * stepsDone, messagesRead: 10 * stepsDone, stepsDone, discoveries: [], done: false });
const finie: AnalysisProgress = { progress: 1, messagesRead: 120, stepsDone: 4, discoveries: ["un mot à vous"], done: true };
const reseau = () => new TypeError("réseau");

/** Avance le temps de `ms`, en laissant finir les tours qui attendent une promesse. */
const avancer = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
/** Le lancement (lire où en est la lecture, la lancer), puis le premier tour du suivi, posé au rendu d’après. */
const arriver = async () => {
  await avancer(0);
  await avancer(0);
};

beforeEach(() => {
  vi.useFakeTimers();
  suivi.mockReset();
  relance.mockReset();
  relance.mockResolvedValue(undefined);
  routeur.replace.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
});

describe("les règles du suivi", () => {
  it("après un appel raté, on relit de plus en plus tard : 1, 2, 4, puis 8 s au plus", () => {
    expect([1, 2, 3, 4, 5, 7].map(attenteApresRates)).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });

  it("un appel raté : relire, se reconnecter, ou l’échec (la conv a disparu, ou trop d’appels ratés de suite)", () => {
    expect(apresUnRate(null, 1)).toEqual({ faire: "relire", dans: 1000 });
    expect(apresUnRate("panne", 3)).toEqual({ faire: "relire", dans: 4000 });
    expect(apresUnRate("connexion", 1)).toEqual({ faire: "connexion" });
    expect(apresUnRate("aucune", 1)).toEqual({ faire: "echec" });
    expect(apresUnRate(null, RATES_MAX - 1)).toEqual({ faire: "relire", dans: 8000 });
    expect(apresUnRate(null, RATES_MAX)).toEqual({ faire: "echec" });
  });

  it("un refus du lancement : « Qui es-tu ? », la connexion, trop de relances ; le reste, l’échec", () => {
    expect(refusDuLancement("qui")).toBe("qui");
    expect(refusDuLancement("connexion")).toBe("connexion");
    expect(refusDuLancement("trop")).toBe("trop");
    expect(refusDuLancement("panne")).toBeNull();
    expect(refusDuLancement(null)).toBeNull();
  });

  it("la lecture d’une conv qui attend son paiement se déroule en quelques secondes : le compteur, les étapes, une trouvaille de plus par quart, puis la fin", () => {
    const fin: AnalysisProgress = { progress: 1, messagesRead: 64, stepsDone: 4, discoveries: ["a", "b", "c"], done: false, paiement: true };
    expect(DUREE_AVANT_PAIEMENT_MS).toBeLessThanOrEqual(6000);
    expect(lectureDerouleeA(0, fin)).toMatchObject({ progress: 0, messagesRead: 0, stepsDone: 0, discoveries: [], done: false, paiement: true });
    expect(lectureDerouleeA(0.35, fin)).toMatchObject({ messagesRead: 32, stepsDone: 1, discoveries: ["a"], done: false });
    expect(lectureDerouleeA(0.8, fin)).toMatchObject({ messagesRead: 64, stepsDone: 3, discoveries: ["a", "b", "c"], done: false });
    expect(lectureDerouleeA(1.2, fin)).toMatchObject({ progress: 1, messagesRead: 64, stepsDone: 3, done: true });
  });
});

describe("useSuiviLecture", () => {
  it("lance la lecture, la relit chaque seconde, puis montre la fin vue en direct (l’anneau plein, puis la gerbe)", async () => {
    suivi.mockResolvedValueOnce(enCours(0)).mockResolvedValueOnce(enCours(1)).mockResolvedValueOnce(enCours(2)).mockResolvedValue(finie);
    const { result } = renderHook(() => useSuiviLecture());
    /* L’arrivée : où en est la lecture, puis le POST qui la lance, puis le premier suivi tout de suite */
    await arriver();
    expect(relance).toHaveBeenCalledTimes(1);
    expect(suivi).toHaveBeenCalledTimes(2);
    expect(result.current.p.stepsDone).toBe(1);
    await avancer(1000);
    expect(result.current.p.stepsDone).toBe(2);
    expect(result.current.enDirect.current).toBe(true);
    await avancer(1000);
    expect(result.current.p.done).toBe(true);
    /* L’anneau plein et la coche 0,7 s, puis il s’efface 0,28 s */
    expect(result.current.phase).toBe("reading");
    await avancer(700);
    expect(result.current.phase).toBe("leaving");
    await avancer(280);
    expect(result.current.phase).toBe("done");
    /* Fini : plus aucune lecture */
    await avancer(10_000);
    expect(suivi).toHaveBeenCalledTimes(4);
  });

  it("déjà finie à l’arrivée : la fin tout de suite, sans la rejouer en direct", async () => {
    suivi.mockResolvedValue(finie);
    const { result } = renderHook(() => useSuiviLecture());
    await arriver();
    expect(result.current.phase).toBe("done");
    expect(result.current.enDirect.current).toBe(false);
  });

  it("une prise du mode tournage, lancée juste avant : sa lecture, déjà finie, se déroule en deux secondes, puis la fin vue en direct", async () => {
    suivi.mockResolvedValue({ ...finie, discoveries: ["a", "b", "c"], rejouee: true });
    retenirLecture();
    const { result } = renderHook(() => useSuiviLecture());
    await arriver();
    /* « Qui es-tu ? » l’a lancée : pas de second POST, et l’écran part de zéro */
    expect(relance).not.toHaveBeenCalled();
    expect(result.current.p).toMatchObject({ progress: 0, messagesRead: 0, discoveries: [], done: false });
    await avancer(DUREE_DE_LA_PRISE_MS / 2);
    expect(result.current.p).toMatchObject({ messagesRead: 86, stepsDone: 2, discoveries: ["a", "b"], done: false });
    expect(result.current.enDirect.current).toBe(true);
    await avancer(DUREE_DE_LA_PRISE_MS / 2);
    expect(result.current.p).toMatchObject({ progress: 1, messagesRead: 120, discoveries: ["a", "b", "c"], done: true });
    expect(result.current.phase).toBe("reading");
    /* L’anneau plein et la coche, puis la gerbe */
    await avancer(1000);
    expect(result.current.phase).toBe("done");
    /* Rien de plus à relire : le serveur l’avait dite finie */
    expect(suivi).toHaveBeenCalledTimes(1);
  });

  it("une prise rouverte (un rechargement) : la fin tout de suite, sans la dérouler de nouveau", async () => {
    suivi.mockResolvedValue({ ...finie, rejouee: true });
    const { result } = renderHook(() => useSuiviLecture());
    await arriver();
    expect(result.current.phase).toBe("done");
    expect(result.current.enDirect.current).toBe(false);
  });

  it("des appels ratés : relus de plus en plus tard, puis le suivi reprend son pas d’une seconde", async () => {
    suivi.mockResolvedValueOnce(enCours(0)).mockRejectedValueOnce(reseau()).mockRejectedValueOnce(reseau()).mockRejectedValueOnce(reseau()).mockResolvedValue(enCours(2));
    const { result } = renderHook(() => useSuiviLecture());
    await arriver();
    expect(suivi).toHaveBeenCalledTimes(2);
    /* 1 s, puis 2 s, puis 4 s */
    await avancer(999);
    expect(suivi).toHaveBeenCalledTimes(2);
    await avancer(1);
    expect(suivi).toHaveBeenCalledTimes(3);
    await avancer(2000);
    expect(suivi).toHaveBeenCalledTimes(4);
    await avancer(3999);
    expect(suivi).toHaveBeenCalledTimes(4);
    await avancer(1);
    expect(suivi).toHaveBeenCalledTimes(5);
    expect(result.current.p.stepsDone).toBe(2);
    /* Revenu : de nouveau chaque seconde */
    await avancer(1000);
    expect(suivi).toHaveBeenCalledTimes(6);
    expect(result.current.echec).toBe(false);
  });

  it("le serveur ne répond plus : l’échec après RATES_MAX appels ratés de suite, et plus aucune lecture", async () => {
    suivi.mockResolvedValueOnce(enCours(0)).mockRejectedValue(reseau());
    const { result } = renderHook(() => useSuiviLecture());
    await arriver();
    await avancer(60_000);
    expect(result.current.echec).toBe(true);
    /* L’arrivée, puis RATES_MAX appels ratés */
    expect(suivi).toHaveBeenCalledTimes(1 + RATES_MAX);
    await avancer(60_000);
    expect(suivi).toHaveBeenCalledTimes(1 + RATES_MAX);
  });

  it("la conv a disparu : l’échec tout de suite ; plus de session : la connexion, qui ramène à la lecture", async () => {
    suivi.mockResolvedValueOnce(enCours(0)).mockRejectedValue(new ErreurApi("aucune", 404));
    const disparue = renderHook(() => useSuiviLecture());
    await arriver();
    expect(disparue.result.current.echec).toBe(true);
    disparue.unmount();

    suivi.mockReset();
    suivi.mockResolvedValueOnce(enCours(0)).mockRejectedValue(new ErreurApi("connexion", 401));
    const deconnecte = renderHook(() => useSuiviLecture());
    await arriver();
    expect(routeur.replace).toHaveBeenCalledWith(connexionPuis("/lecture"));
    expect(deconnecte.result.current.echec).toBe(false);
  });

  it("une lecture arrêtée par une panne : l’échec ; « Relancer » la relance et la suit de nouveau", async () => {
    suivi
      .mockResolvedValueOnce(enCours(0))
      .mockResolvedValueOnce({ ...enCours(1), failed: true, failReason: "panne" })
      .mockResolvedValue(enCours(2));
    const { result } = renderHook(() => useSuiviLecture());
    await arriver();
    expect(result.current.echec).toBe(true);
    await avancer(5000);
    expect(suivi).toHaveBeenCalledTimes(2);
    act(() => result.current.relancer());
    expect(result.current.echec).toBe(false);
    expect(result.current.p.stepsDone).toBe(0);
    /* Relancée : un second POST (sans relire avant), puis le suivi */
    await arriver();
    expect(relance).toHaveBeenCalledTimes(2);
    expect(suivi).toHaveBeenCalledTimes(3);
    expect(result.current.p.stepsDone).toBe(2);
  });

  it("un refus du lancement : trop de relances (l’échec, dit), ou « Qui es-tu ? » à remplir", async () => {
    suivi.mockResolvedValue(enCours(0));
    relance.mockRejectedValueOnce(new ErreurApi("trop", 429));
    const trop = renderHook(() => useSuiviLecture());
    await arriver();
    await avancer(5000);
    expect(trop.result.current).toMatchObject({ echec: true, trop: true });
    /* Rien n’est suivi : seulement la lecture de l’arrivée */
    expect(suivi).toHaveBeenCalledTimes(1);
    trop.unmount();

    relance.mockRejectedValueOnce(new ErreurApi("qui", 409));
    renderHook(() => useSuiviLecture());
    await arriver();
    expect(routeur.replace).toHaveBeenCalledWith("/qui");
  });

  it("démonté pendant une lecture : sa réponse n’emmène nulle part, et rien ne repart", async () => {
    let repondre: (e: unknown) => void = () => {};
    suivi.mockResolvedValueOnce(enCours(0)).mockImplementationOnce(() => new Promise((_, refuser) => (repondre = refuser)));
    const { unmount } = renderHook(() => useSuiviLecture());
    await arriver();
    expect(suivi).toHaveBeenCalledTimes(2);
    unmount();
    repondre(new ErreurApi("connexion", 401));
    await avancer(10_000);
    expect(routeur.replace).not.toHaveBeenCalled();
    expect(suivi).toHaveBeenCalledTimes(2);
  });
});
