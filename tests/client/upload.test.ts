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
 * précédent. Les lots déjà lus restent dans l’onglet (preparer-video.ts) : chaque test a ses images à lui (`sel`), sauf
 * ceux qui renvoient exprès la même vidéo.
 */
vi.mock("@/services/preparer-video", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("@/services/preparer-video")>();
  return {
    ...vrai,
    imagesDeLaVideo: async (_fichier: File, onAvance?: (p: number) => void) => {
      onAvance?.(1);
      /*
       * L’écran n° k pèse k octets : le simulateur reconnaît un lot à son premier écran (happy-dom oublie le nom des fichiers
       * d’un formulaire). Ses octets valent `sel` : une autre vidéo à chaque test
       */
      return Array.from({ length: ecrans }, (_, k) => {
        const b = new Blob([new Uint8Array(k + 1).fill(sel)], { type: "image/jpeg" });
        signatures.set(b, `${sel}:${k}`);
        return b;
      });
    },
    /*
     * L’empreinte d’un lot, d’après ce que la vidéo simulée a mis dans ses écrans : la vraie passe par crypto.subtle, qui
     * répond hors du temps simulé (tests/video.test.ts la vérifie). Ce qui dépend d’elle (le lot déjà lu) reste le vrai
     */
    empreinteDuLot: async (images: Blob[], appli: string, jour: string) => `${appli}:${jour}:${images.map((b) => signatures.get(b)).join(",")}`,
  };
});
/** Ce que chaque écran de la vidéo simulée contient (son `sel` et son rang), que lit l’empreinte simulée. */
const signatures = new WeakMap<Blob, string>();

/** Combien d’écrans la vidéo simulée donne : 11 font deux lots de six (1 à 6, 6 à 11), 80 en font huit de douze. */
let ecrans = 11;
/** Les octets des écrans de la vidéo simulée : un autre à chaque test, pour que les lots lus d’un test ne servent pas au suivant. */
let sel = 0;

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });
const SOURCE = { kind: "captures", app: "imessage" };
const VIDEO = new File([new Uint8Array(8)], "enregistrement.mp4", { type: "video/mp4" });

/**
 * Le serveur simulé : `lot(n, essai)` répond à l’essai n° `essai` (1, 2…) du lot n° `n` (une Response, tout de suite ou
 * plus tard, ou « pend » : pas de réponse avant l’arrêt de l’envoi) ; `video` répond à l’assemblage. Rend la liste des
 * appels, les signaux, ce que portait chaque essai d’un lot (sa clé, son ordre) et les abandons reçus.
 */
function serveur({
  lot,
  video = () => json({ source: SOURCE, story: { id: "s1" }, messagesRead: 42 }),
}: {
  lot: (n: number, essai: number) => Response | Promise<Response> | "pend";
  video?: () => Response;
}) {
  const appels: string[] = [];
  const corpsVideo: unknown[] = [];
  /* Ce que chaque essai d’un lot porte (sa clé d’envoi, son ordre), et les abandons reçus */
  const champs: { n: number; cle: unknown; ordre: unknown }[] = [];
  const abandons: { corps: unknown; keepalive: boolean | undefined }[] = [];
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
    if (url === "/api/captures/lot/abandon") {
      abandons.push({ corps: JSON.parse(String(init?.body)), keepalive: init?.keepalive });
      return json({ ok: true });
    }
    if (url !== "/api/captures/lot") throw new Error(`appel inattendu : ${String(url)}`);
    const n = lotDe(init);
    const fd = init?.body as FormData;
    champs.push({ n, cle: fd.get("cle"), ordre: fd.get("ordre") });
    const essai = (essais.get(n) ?? 0) + 1;
    essais.set(n, essai);
    appels.push(`lot ${n} · essai ${essai}`);
    if (init?.signal) signaux.set(n, init.signal);
    const r = lot(n, essai);
    if (r !== "pend") return r;
    return new Promise<Response>((_, rejeter) => init?.signal?.addEventListener("abort", () => rejeter(new DOMException("arrêté", "AbortError"))));
  });
  return { appels, corpsVideo, signaux, champs, abandons };
}

/* L’extraction est chargée à la demande (pVideo) : chargée d’avance, son import ne dépend plus du temps simulé */
beforeAll(async () => {
  await import("@/services/preparer-video");
});
beforeEach(() => {
  vi.useFakeTimers();
  ecrans = 11;
  sel++;
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

describe("uploadRecording : un lot n’est jamais payé deux fois", () => {
  it("tous les lots portent la même clé que leur fin ; le premier part « premier », les autres « suite »", async () => {
    const { champs, corpsVideo } = serveur({ lot: (n) => json({ lot: `lecture ${n}` }) });
    await expect(uploadRecording(VIDEO, "imessage", CASE_IMPORT.version)).resolves.toMatchObject({ messagesRead: 42 });
    expect(champs.map((c) => [c.n, c.ordre])).toEqual([
      [1, "premier"],
      [2, "suite"],
    ]);
    const cle = champs[0]!.cle;
    expect(cle).toEqual(expect.stringMatching(/^[0-9a-f-]{16,64}$/i));
    expect(champs.every((c) => c.cle === cle)).toBe(true);
    expect(corpsVideo).toEqual([expect.objectContaining({ cle })]);
  });

  it("un lot en échec pour de bon : l’envoi abandonné le dit au serveur une fois (sa clé, en keepalive) ; la même vidéo renvoyée ne relit que ce qui manque", async () => {
    /* Le lot 2 échoue un peu après la lecture du lot 1 : un lot encore en cours à l’abandon s’arrête, et n’est pas gardé */
    const { appels, champs, abandons, corpsVideo } = serveur({
      lot: (n, essai) => (n === 2 && essai === 1 ? new Promise((ok) => setTimeout(() => ok(json({ erreur: "capture" }, 422)), 100)) : json({ lot: `lecture ${n}` })),
    });
    const premier = uploadRecording(VIDEO, "imessage", CASE_IMPORT.version).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(100);
    expect(await premier).toMatchObject({ code: "capture", status: 422 });
    expect(abandons).toEqual([{ corps: { cle: champs[0]!.cle }, keepalive: true }]);
    /* Le même enregistrement, choisi de nouveau : le lot 1 est déjà lu dans l’onglet, seul le lot 2 repart, seul (sans ordre) */
    await expect(uploadRecording(VIDEO, "imessage", CASE_IMPORT.version)).resolves.toMatchObject({ messagesRead: 42 });
    expect(appels).toEqual(["lot 1 · essai 1", "lot 2 · essai 1", "lot 2 · essai 2", "video"]);
    expect(champs.at(-1)).toMatchObject({ n: 2, ordre: null });
    expect(corpsVideo).toEqual([expect.objectContaining({ lots: ["lecture 1", "lecture 2"] })]);
    expect(abandons).toHaveLength(1);
  });

  it("une autre appli, ou un autre jour : le lot déjà lu ne sert pas (la lecture dépend des deux)", async () => {
    const { appels } = serveur({ lot: (n) => json({ lot: `lecture ${n}` }) });
    await uploadRecording(VIDEO, "imessage", CASE_IMPORT.version);
    await uploadRecording(VIDEO, "instagram", CASE_IMPORT.version);
    /* Le lendemain, à Paris */
    vi.setSystemTime(Date.now() + 86400e3);
    await uploadRecording(VIDEO, "imessage", CASE_IMPORT.version);
    expect(appels.filter((a) => a.startsWith("lot"))).toHaveLength(6);
  });
});
