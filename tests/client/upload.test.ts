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
      const images = Array.from({ length: ecrans }, (_, k) => {
        const b = new Blob([new Uint8Array(k + 1).fill(sel)], { type: "image/jpeg" });
        signatures.set(b, `${sel}:${k}`);
        return b;
      });
      return { images, sensSur };
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
/** La vidéo simulée a-t-elle défilé dans un seul sens (ses écrans sûrement dans l’ordre) ? */
let sensSur = true;

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });
const SOURCE = { kind: "captures", app: "imessage" };
const VIDEO = new File([new Uint8Array(8)], "enregistrement.mp4", { type: "video/mp4" });

/** La conv importée, telle que le serveur simulé la rend. */
const IMPORTEE = { source: SOURCE, story: { id: "s1" }, messagesRead: 42 };

/**
 * Le serveur simulé : `lot(n, essai, indice)` répond à l’essai n° `essai` (1, 2…) du lot n° `n` (dans l’ordre d’arrivée ;
 * `indice` : sa place dans la vidéo, d’après son premier écran, pour des lots de douze), par une Response, tout de suite
 * ou plus tard, ou « pend » : pas de réponse avant l’arrêt de l’envoi ; `video(corps, k)` répond à la k-ième fin (une
 * question sur une longue vidéo, ou l’assemblage), `plan` au plan d’une longue vidéo (en entier, par défaut), `ecrans`
 * à l’envoi d’un lot gardé. Rend la liste des appels, les signaux, ce que portait chaque essai d’un lot (sa clé, son
 * ordre, sa place), les abandons reçus, les plans demandés et les lots gardés (leur rang).
 */
function serveur({
  lot,
  video = () => json(IMPORTEE),
  plan = () => json({ lecture: "entiere" }),
  ecrans: garder = () => json({ ok: true }),
}: {
  lot: (n: number, essai: number, indice: number) => Response | Promise<Response> | "pend";
  video?: (corps: unknown, k: number) => Response;
  plan?: (corps: unknown) => Response;
  ecrans?: (rang: number) => Response | Promise<Response>;
}) {
  const appels: string[] = [];
  const corpsVideo: unknown[] = [];
  /* Ce que chaque essai d’un lot porte (sa clé d’envoi, son ordre, sa place), et les abandons reçus */
  const champs: { n: number; cle: unknown; ordre: unknown; indice: number }[] = [];
  const abandons: { corps: unknown; keepalive: boolean | undefined }[] = [];
  const plans: unknown[] = [];
  const gardes: { rang: number; cle: unknown; images: number; priorite: RequestPriority | undefined }[] = [];
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
      const corps: unknown = JSON.parse(String(init?.body));
      corpsVideo.push(corps);
      return video(corps, corpsVideo.length);
    }
    if (url === "/api/captures/video/plan") {
      appels.push("plan");
      const corps: unknown = JSON.parse(String(init?.body));
      plans.push(corps);
      return plan(corps);
    }
    if (url === "/api/captures/ecrans") {
      const fd = init?.body as FormData;
      const rang = Number(fd.get("rang"));
      appels.push(`ecrans ${rang}`);
      gardes.push({ rang, cle: fd.get("cle"), images: fd.getAll("captures").length, priorite: init?.priority });
      return garder(rang);
    }
    if (url === "/api/captures/lot/abandon") {
      abandons.push({ corps: JSON.parse(String(init?.body)), keepalive: init?.keepalive });
      return json({ ok: true });
    }
    if (url !== "/api/captures/lot") throw new Error(`appel inattendu : ${String(url)}`);
    const n = lotDe(init);
    const fd = init?.body as FormData;
    /* Des lots de douze écrans, chacun reprenant le dernier du précédent : le premier écran du lot j est le n° 11 j (de taille 11 j + 1) */
    const indice = ((fd.getAll("captures")[0] as Blob).size - 1) / 11;
    champs.push({ n, cle: fd.get("cle"), ordre: fd.get("ordre"), indice });
    const essai = (essais.get(n) ?? 0) + 1;
    essais.set(n, essai);
    appels.push(`lot ${n} · essai ${essai}`);
    if (init?.signal) signaux.set(n, init.signal);
    const r = lot(n, essai, indice);
    if (r !== "pend") return r;
    return new Promise<Response>((_, rejeter) => init?.signal?.addEventListener("abort", () => rejeter(new DOMException("arrêté", "AbortError"))));
  });
  return { appels, corpsVideo, signaux, champs, abandons, plans, gardes };
}

/* L’extraction est chargée à la demande (pVideo) : chargée d’avance, son import ne dépend plus du temps simulé */
beforeAll(async () => {
  await import("@/services/preparer-video");
});
beforeEach(() => {
  vi.useFakeTimers();
  ecrans = 11;
  sel++;
  sensSur = true;
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
    /* Une longue vidéo : son plan d’abord (en entier, par défaut) */
    expect(appels).toEqual(["plan", "lot 1 · essai 1", "lot 2 · essai 1", "lot 3 · essai 1", "lot 4 · essai 1", "lot 5 · essai 1", "lot 1 · essai 2"]);
    expect([2, 3, 4, 5].map((n) => signaux.get(n)?.aborted)).toEqual([true, true, true, true]);
    /* Rien ne repart ensuite */
    await vi.advanceTimersByTimeAsync(10_000);
    expect(appels).toHaveLength(7);
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
    /* Rien de repris d’un envoi d’avant */
    expect(corpsVideo[0]).not.toHaveProperty("repris");
  });

  it("un lot en échec pour de bon : l’envoi abandonné le dit au serveur une fois (sa clé, « echec », en keepalive) ; la même vidéo renvoyée ne relit que ce qui manque, et dit d’où vient le lot repris", async () => {
    /* Le lot 2 échoue un peu après la lecture du lot 1 : un lot encore en cours à l’abandon s’arrête, et n’est pas gardé */
    const { appels, champs, abandons, corpsVideo } = serveur({
      lot: (n, essai) => (n === 2 && essai === 1 ? new Promise((ok) => setTimeout(() => ok(json({ erreur: "capture" }, 422)), 100)) : json({ lot: `lecture ${n}` })),
    });
    const premier = uploadRecording(VIDEO, "imessage", CASE_IMPORT.version).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(100);
    expect(await premier).toMatchObject({ code: "capture", status: 422 });
    expect(abandons).toEqual([{ corps: { cle: champs[0]!.cle, raison: "echec" }, keepalive: true }]);
    /* Le même enregistrement, choisi de nouveau : le lot 1 est déjà lu dans l’onglet, seul le lot 2 repart, seul (sans ordre) */
    await expect(uploadRecording(VIDEO, "imessage", CASE_IMPORT.version)).resolves.toMatchObject({ messagesRead: 42 });
    expect(appels).toEqual(["lot 1 · essai 1", "lot 2 · essai 1", "lot 2 · essai 2", "video"]);
    expect(champs.at(-1)).toMatchObject({ n: 2, ordre: null });
    /* Le lot 1 repris vient du premier envoi : sa clé part avec la fin (la mesure range son coût sous ce nouvel import) */
    expect(champs.at(-1)!.cle).not.toBe(champs[0]!.cle);
    expect(corpsVideo).toEqual([expect.objectContaining({ lots: ["lecture 1", "lecture 2"], cle: champs.at(-1)!.cle, repris: [champs[0]!.cle] })]);
    expect(abandons).toHaveLength(1);
  });

  it("la page fermée pendant la lecture : l’envoi abandonné le dit au serveur (« page » : seuls ses lots pas encore partis chez le prestataire s’arrêtent) ; pas une page mise de côté, ni une page fermée après", async () => {
    /** Un pagehide, comme le navigateur l’envoie : `persisted`, la page gardée pour revenir. */
    const quitter = (persisted: boolean) => window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted }));
    const { abandons, champs, signaux } = serveur({ lot: () => "pend" });
    const envoi = uploadRecording(VIDEO, "imessage", CASE_IMPORT.version).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(50);
    expect(signaux.size).toBe(2);
    /* Mise de côté (le cache des pages) : elle peut revenir, ses lots continuent */
    quitter(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(abandons).toEqual([]);
    expect([...signaux.values()].some((s) => s.aborted)).toBe(false);
    quitter(false);
    await vi.advanceTimersByTimeAsync(50);
    expect(abandons).toEqual([{ corps: { cle: champs[0]!.cle, raison: "page" }, keepalive: true }]);
    expect([...signaux.values()].every((s) => s.aborted)).toBe(true);
    expect(await envoi).toBeInstanceOf(Error);
    /* Une lecture finie n’écoute plus la page : la quitter ensuite n’abandonne rien */
    const fini = serveur({ lot: (n) => json({ lot: `lecture ${n}` }) });
    sel++;
    await uploadRecording(VIDEO, "imessage", CASE_IMPORT.version);
    quitter(false);
    expect(fini.abandons).toEqual([]);
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

describe("uploadRecording : une longue vidéo lue en partie avant l’achat", () => {
  /** Une lecture de lot simulée, d’après sa place dans la vidéo. */
  const lu = (_n: number, _essai: number, indice: number) => json({ lot: `lecture ${indice}` });
  const lectures = (...indices: number[]) => indices.map((i) => `lecture ${i}`);
  /* Huit lots de douze écrans (de 0 à 7), le dernier n’en ayant que trois : une longue vidéo */
  beforeEach(() => {
    ecrans = 80;
  });

  it("dans la moitié partielle : ses cinq lots les plus récents d’abord, puis la question ; « garder » : ses trois plus anciens partent tels quels, puis la fin avec eux", async () => {
    const { appels, champs, corpsVideo, plans, gardes } = serveur({
      lot: lu,
      plan: () => json({ lecture: "partielle" }),
      video: (_corps, k) => (k === 1 ? json({ suite: "garder", lots: 3 }) : json(IMPORTEE)),
    });
    const avance: AvanceVideo[] = [];
    await expect(uploadRecording(VIDEO, "imessage", CASE_IMPORT.version, (a) => avance.push(a))).resolves.toEqual(IMPORTEE);
    const cle = champs[0]!.cle;
    /* Le plan : la longue vidéo, l’empreinte de son lot le plus récent, son sens */
    expect(plans).toEqual([{ lots: 8, video: expect.stringContaining(`:${sel}:77`), sensSur: true, consentement: CASE_IMPORT.version }]);
    /* Du plus récent au plus ancien, le plus récent d’abord (« premier ») */
    expect(champs.map((c) => [c.indice, c.ordre])).toEqual([
      [7, "premier"],
      [6, "suite"],
      [5, "suite"],
      [4, "suite"],
      [3, "suite"],
    ]);
    const partiel = { restants: 3, ecrans: 80, video: (plans[0] as { video: string }).video, sensSur: true };
    expect(corpsVideo).toEqual([
      expect.objectContaining({ cle, lots: lectures(3, 4, 5, 6, 7), partiel }),
      expect.objectContaining({ cle, lots: lectures(3, 4, 5, 6, 7), partiel: { ...partiel, gardes: true } }),
    ]);
    /* Ses trois lots plus anciens, gardés tels quels (jamais lus avant l’achat), sous la même clé, un à la fois, du plus ancien au plus récent */
    expect(gardes.map((g) => g.rang)).toEqual([0, 1, 2]);
    expect(gardes.every((g) => g.cle === cle && g.images === 12 && g.priorite === "low")).toBe(true);
    /* Partis pendant la lecture, juste derrière les cinq lots à lire, avant la question */
    expect(appels.slice(0, 7)).toEqual(["plan", ...[1, 2, 3, 4, 5].map((n) => `lot ${n} · essai 1`), "ecrans 0"]);
    expect(appels.filter((a) => a.startsWith("lot"))).toHaveLength(5);
    expect(avance.filter((a) => a.etape === "lecture").at(-1)).toEqual({ etape: "lecture", faits: 5, total: 5 });
  });

  it("les lots à garder encore en route quand la lecture finit : la personne voit leur envoi, puis la fin avec eux", async () => {
    /* Le réseau lent : les écrans à garder n’arrivent qu’une fois la question posée */
    let questionPosee = () => {};
    const posee = new Promise<void>((ok) => (questionPosee = ok));
    const { corpsVideo, gardes } = serveur({
      lot: lu,
      plan: () => json({ lecture: "partielle" }),
      video: (_corps, k) => {
        if (k > 1) return json(IMPORTEE);
        questionPosee();
        return json({ suite: "garder", lots: 3 });
      },
      ecrans: async () => {
        await posee;
        return json({ ok: true });
      },
    });
    const avance: AvanceVideo[] = [];
    await expect(uploadRecording(VIDEO, "imessage", CASE_IMPORT.version, (a) => avance.push(a))).resolves.toEqual(IMPORTEE);
    expect(avance.filter((a) => a.etape === "envoi")).toEqual([0, 1, 2, 3].map((faits) => ({ etape: "envoi", faits, total: 3 })));
    expect(gardes.map((g) => g.rang)).toEqual([0, 1, 2]);
    expect(corpsVideo[1]).toMatchObject({ partiel: { restants: 3, gardes: true } });
  });

  it("le serveur dit d’en lire encore : les lots que ce tour lira ne partent plus être gardés, la suite garde les autres", async () => {
    let questionPosee = () => {};
    const posee = new Promise<void>((ok) => (questionPosee = ok));
    const { champs, corpsVideo, gardes } = serveur({
      lot: lu,
      plan: () => json({ lecture: "partielle" }),
      video: (_corps, k) => {
        questionPosee();
        return json(k === 1 ? { suite: "lire", lots: 2 } : k === 2 ? { suite: "garder", lots: 1 } : IMPORTEE);
      },
      ecrans: async () => {
        await posee;
        return json({ ok: true });
      },
    });
    await expect(uploadRecording(VIDEO, "imessage", CASE_IMPORT.version)).resolves.toEqual(IMPORTEE);
    /* Le lot 0 en route quand la question répond ; les lots 1 et 2, lus au tour suivant, ne partent pas */
    expect(gardes.map((g) => g.rang)).toEqual([0]);
    expect(champs.map((c) => c.indice)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(corpsVideo.map((c) => (c as { partiel: { restants: number; gardes?: true } }).partiel)).toEqual([
      expect.objectContaining({ restants: 3 }),
      expect.objectContaining({ restants: 1 }),
      expect.objectContaining({ restants: 1, gardes: true }),
    ]);
  });

  it("la question dit d’en lire encore : un tour de plus, du plus récent au plus ancien, puis la fin de toute la vidéo", async () => {
    const { champs, corpsVideo } = serveur({
      lot: lu,
      plan: () => json({ lecture: "partielle" }),
      video: (_corps, k) => (k === 1 ? json({ suite: "lire", lots: 3 }) : json(IMPORTEE)),
    });
    await expect(uploadRecording(VIDEO, "imessage", CASE_IMPORT.version)).resolves.toEqual(IMPORTEE);
    expect(champs.map((c) => c.indice)).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
    expect(corpsVideo.map((c) => (c as { partiel: { restants: number } }).partiel.restants)).toEqual([3, 0]);
    expect(corpsVideo[1]).toMatchObject({ lots: lectures(0, 1, 2, 3, 4, 5, 6, 7) });
  });

  it("la question au serveur échoue : rien ne part plus, et l’envoi est abandonné (le serveur oublie les écrans déjà envoyés)", async () => {
    let questionPosee = () => {};
    const posee = new Promise<void>((ok) => (questionPosee = ok));
    const { abandons, gardes } = serveur({
      lot: lu,
      plan: () => json({ lecture: "partielle" }),
      video: () => {
        questionPosee();
        return json({ erreur: "trop" }, 429);
      },
      ecrans: async () => {
        await posee;
        return json({ ok: true });
      },
    });
    await expect(uploadRecording(VIDEO, "imessage", CASE_IMPORT.version)).rejects.toMatchObject({ code: "trop" });
    expect(abandons).toEqual([expect.objectContaining({ keepalive: true })]);
    /* Le lot en route au moment de l’erreur, et aucun après lui */
    expect(gardes.map((g) => g.rang)).toEqual([0]);
  });

  it("l’envoi des lots gardés échoue : ils se lisent avant l’achat, comme avant, et la fin rassemble toute la vidéo", async () => {
    const { appels, champs, corpsVideo } = serveur({
      lot: lu,
      plan: () => json({ lecture: "partielle" }),
      video: (_corps, k) => (k === 1 ? json({ suite: "garder", lots: 3 }) : json(IMPORTEE)),
      ecrans: () => json({ erreur: "trop_jour" }, 429),
    });
    await expect(uploadRecording(VIDEO, "imessage", CASE_IMPORT.version)).resolves.toEqual(IMPORTEE);
    expect(champs.map((c) => c.indice).slice(5)).toEqual([2, 1, 0]);
    expect(corpsVideo).toHaveLength(2);
    expect(corpsVideo[1]).toMatchObject({ lots: lectures(0, 1, 2, 3, 4, 5, 6, 7), partiel: { restants: 0 } });
    expect(appels.filter((a) => a.startsWith("ecrans")).length).toBeGreaterThan(0);
  });

  it("dans la moitié entière, ou sans réponse au plan : lue en entier dans l’ordre, comme avant ; la fin dit la longue vidéo", async () => {
    const { champs, corpsVideo, gardes } = serveur({ lot: lu });
    await uploadRecording(VIDEO, "imessage", CASE_IMPORT.version);
    expect(champs.map((c) => c.indice)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(corpsVideo).toEqual([expect.objectContaining({ lots: lectures(0, 1, 2, 3, 4, 5, 6, 7), partiel: expect.objectContaining({ restants: 0, ecrans: 80, sensSur: true }) })]);
    expect(gardes).toEqual([]);
    /* Le plan sans réponse (le réseau) : en entier aussi */
    sel++;
    const secondes = serveur({ lot: lu, plan: () => json({ erreur: "erreur" }, 500) });
    await expect(uploadRecording(VIDEO, "imessage", CASE_IMPORT.version)).resolves.toEqual(IMPORTEE);
    expect(secondes.champs.map((c) => c.indice)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("un morceau ajouté, ou une courte vidéo : aucun plan demandé, rien de la longue vidéo dans la fin ; un sens douteux se dit au plan", async () => {
    const ajout = serveur({ lot: lu });
    await uploadRecording(VIDEO, "imessage", CASE_IMPORT.version, undefined, { ajout: true });
    expect(ajout.plans).toEqual([]);
    expect(ajout.corpsVideo).toEqual([expect.not.objectContaining({ partiel: expect.anything() })]);
    sel++;
    ecrans = 11;
    const courte = serveur({ lot: lu });
    await uploadRecording(VIDEO, "imessage", CASE_IMPORT.version);
    expect(courte.plans).toEqual([]);
    expect(courte.corpsVideo).toEqual([expect.not.objectContaining({ partiel: expect.anything() })]);
    sel++;
    ecrans = 80;
    sensSur = false;
    const douteuse = serveur({ lot: lu });
    await uploadRecording(VIDEO, "imessage", CASE_IMPORT.version);
    expect(douteuse.plans).toEqual([expect.objectContaining({ sensSur: false })]);
  });
});
