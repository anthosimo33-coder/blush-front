import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CASE_IMPORT } from "@/contenu/consentements";
import { uploadRecording } from "@/services/api";
import type { AvanceVideo } from "@/types/api";
import { ErreurApi } from "@/types/erreurs-api";

/*
 * L’envoi d’un enregistrement d’écran (uploadRecording, src/services/api.ts) quand le serveur répond une 5xx : ses lots
 * partent cinq à la fois vers /api/captures/lot, puis leurs lectures vers /api/captures/video. Le réseau est un `fetch`
 * simulé, et l’extraction des écrans de la vidéo (qui demande un vrai navigateur) rend des images toutes faites, que
 * lotsDe découpe pour de vrai, à la taille de tailleDesLots (six à douze écrans), chaque lot reprenant le dernier écran du
 * précédent.
 */
vi.mock("@/services/preparer-video", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("@/services/preparer-video")>();
  return {
    ...vrai,
    imagesDeLaVideo: async (_fichier: File, onAvance?: (p: number) => void) => {
      onAvance?.(1);
      /* L’écran n° k pèse k octets : le simulateur reconnaît un lot à son premier écran (happy-dom oublie le nom des fichiers d’un formulaire) */
      return Array.from({ length: ecrans }, (_, k) => new Blob([new Uint8Array(k + 1)], { type: "image/jpeg" }));
    },
  };
});

/** Combien d’écrans la vidéo simulée donne : 11 font deux lots de six (1 à 6, 6 à 11), 80 en font huit de douze. */
let ecrans = 11;

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });
const SOURCE = { kind: "captures", app: "imessage" };
const VIDEO = new File([new Uint8Array(8)], "enregistrement.mp4", { type: "video/mp4" });

/**
 * Le serveur simulé : `lot(n, essai)` répond à l’essai n° `essai` (1, 2…) du lot n° `n` (une Response, ou « pend » :
 * pas de réponse avant l’arrêt de l’envoi) ; `video` répond à l’assemblage. Rend la liste des appels, et les signaux.
 */
function serveur({
  lot,
  video = () => json({ source: SOURCE, story: { id: "s1" }, messagesRead: 42 }),
}: {
  lot: (n: number, essai: number) => Response | "pend";
  video?: () => Response;
}) {
  const appels: string[] = [];
  const corpsVideo: unknown[] = [];
  const essais = new Map<number, number>();
  /* Le n° d’un lot, d’après son premier écran : les lots partent dans l’ordre, un nouvel essai reprend le même premier écran */
  const lots = new Map<number, number>();
  const lotDe = (init?: RequestInit) => {
    const premier = ((init?.body as FormData).getAll("captures")[0] as Blob).size;
    if (!lots.has(premier)) lots.set(premier, lots.size + 1);
    return lots.get(premier)!;
  };
  const signaux = new Map<number, AbortSignal>();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (url === "/api/captures/video") {
      appels.push("video");
      corpsVideo.push(JSON.parse(String(init?.body)));
      return video();
    }
    if (url !== "/api/captures/lot") throw new Error(`appel inattendu : ${String(url)}`);
    const n = lotDe(init);
    const essai = (essais.get(n) ?? 0) + 1;
    essais.set(n, essai);
    appels.push(`lot ${n} · essai ${essai}`);
    if (init?.signal) signaux.set(n, init.signal);
    const r = lot(n, essai);
    if (r !== "pend") return r;
    return new Promise<Response>((_, rejeter) => init?.signal?.addEventListener("abort", () => rejeter(new DOMException("arrêté", "AbortError"))));
  });
  return { appels, corpsVideo, signaux };
}

/* L’extraction est chargée à la demande (pVideo) : chargée d’avance, son import ne dépend plus du temps simulé */
beforeAll(async () => {
  await import("@/services/preparer-video");
});
beforeEach(() => {
  vi.useFakeTimers();
  ecrans = 11;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("uploadRecording sur une 5xx", () => {
  it("un lot qui reçoit une 5xx est relu une fois, 1,5 s plus tard, sans relire les autres ; la conv est assemblée dans l’ordre des lots", async () => {
    const { appels, corpsVideo } = serveur({ lot: (n, essai) => (n === 1 && essai === 1 ? json({ erreur: "erreur" }, 503) : json({ lot: `lecture ${n}` })) });
    const avance: AvanceVideo[] = [];
    const envoi = uploadRecording(VIDEO, "imessage", CASE_IMPORT.version, (a) => avance.push(a));
    /* Avant les 1,5 s : le lot 1 n’est pas encore relu, la conv pas assemblée */
    await vi.advanceTimersByTimeAsync(1499);
    expect(appels).toEqual(["lot 1 · essai 1", "lot 2 · essai 1"]);
    await vi.advanceTimersByTimeAsync(1);
    await expect(envoi).resolves.toEqual({ source: SOURCE, story: { id: "s1" }, messagesRead: 42 });
    expect(appels).toEqual(["lot 1 · essai 1", "lot 2 · essai 1", "lot 1 · essai 2", "video"]);
    expect(corpsVideo).toEqual([expect.objectContaining({ app: "imessage", lots: ["lecture 1", "lecture 2"] })]);
    /* L’avancée ne compte que les lots lus, le relu une seule fois */
    expect(avance.filter((a) => a.etape === "lecture")).toEqual([
      { etape: "lecture", faits: 0, total: 2 },
      { etape: "lecture", faits: 1, total: 2 },
      { etape: "lecture", faits: 2, total: 2 },
    ]);
  });

  it("une seconde 5xx sur le même lot : l’envoi échoue sur elle, les lots en cours s’arrêtent, aucun autre ne part et rien n’est assemblé", async () => {
    /* Huit lots : cinq partent ensemble, les trois derniers attendent une place */
    ecrans = 80;
    const { appels, signaux } = serveur({ lot: (n) => (n === 1 ? json({ erreur: "erreur" }, 502) : "pend") });
    const envoi = uploadRecording(VIDEO, "imessage", CASE_IMPORT.version);
    const resultat = envoi.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1500);
    const e = await resultat;
    expect(e).toBeInstanceOf(ErreurApi);
    expect(e).toMatchObject({ code: "erreur", status: 502 });
    expect(appels).toEqual(["lot 1 · essai 1", "lot 2 · essai 1", "lot 3 · essai 1", "lot 4 · essai 1", "lot 5 · essai 1", "lot 1 · essai 2"]);
    expect([2, 3, 4, 5].map((n) => signaux.get(n)?.aborted)).toEqual([true, true, true, true]);
    /* Rien ne repart ensuite */
    await vi.advanceTimersByTimeAsync(10_000);
    expect(appels).toHaveLength(6);
  });

  it("le budget du jour atteint (« souffle »), même en 503 : pas de nouvel essai, il tient jusqu’à minuit", async () => {
    const { appels } = serveur({ lot: (n) => (n === 1 ? json({ erreur: "souffle" }, 503) : "pend") });
    const resultat = uploadRecording(VIDEO, "imessage", CASE_IMPORT.version).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await resultat).toMatchObject({ code: "souffle", status: 503 });
    expect(appels).toEqual(["lot 1 · essai 1", "lot 2 · essai 1"]);
  });

  it("une 5xx à l’assemblage : rendue telle quelle, sans le rejouer (une réponse du serveur n’est pas une coupure)", async () => {
    const { appels } = serveur({ lot: (n) => json({ lot: `lecture ${n}` }), video: () => json({ erreur: "erreur" }, 500) });
    const resultat = uploadRecording(VIDEO, "imessage", CASE_IMPORT.version).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await resultat).toMatchObject({ code: "erreur", status: 500 });
    expect(appels.filter((a) => a === "video")).toHaveLength(1);
  });

  it("une 5xx sans corps JSON (une page d’erreur de l’hébergeur) : relue comme les autres", async () => {
    const { appels } = serveur({ lot: (n, essai) => (n === 2 && essai === 1 ? new Response("<html>Bad gateway</html>", { status: 502 }) : json({ lot: `lecture ${n}` })) });
    const envoi = uploadRecording(VIDEO, "imessage", CASE_IMPORT.version);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(envoi).resolves.toMatchObject({ messagesRead: 42 });
    expect(appels).toEqual(["lot 1 · essai 1", "lot 2 · essai 1", "lot 2 · essai 2", "video"]);
  });
});
