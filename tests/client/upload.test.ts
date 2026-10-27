import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CASE_IMPORT } from "@/contenu/consentements";
import { uploadRecording } from "@/services/api";
import type { AvanceVideo } from "@/types/api";
import { ErreurApi } from "@/types/erreurs-api";

/*
 * L’envoi d’un enregistrement d’écran (uploadRecording, src/services/api.ts) quand le serveur répond une 5xx : ses lots
 * partent cinq à la fois vers /api/captures/lot, puis leurs lectures vers /api/captures/video. Le réseau est un `fetch`
 * simulé, et l’extraction des écrans de la vidéo (qui demande un vrai navigateur) rend des images toutes faites, que
 * lotsDe découpe pour de vrai, en lots de douze écrans (tailleDesLots) en partant de la fin : le plus récent plein, chaque
 * lot reprenant le dernier écran du précédent, le reste dans le plus ancien. Les lots déjà lus restent dans l’onglet
 * (preparer-video.ts) : chaque test a ses images à lui (`sel`), sauf ceux qui renvoient exprès la même vidéo.
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
/*
 * Le jeton du widget du CAPTCHA, tout de suite : seulement quand un test pose la clé publique (sinon, ni jeton ni
 * laissez-passer, comme en local)
 */
vi.mock("@/services/captcha", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/services/captcha")>()), jetonCaptcha: async () => "jeton" }));
/** Ce que chaque écran de la vidéo simulée contient (son `sel` et son rang), que lit l’empreinte simulée. */
const signatures = new WeakMap<Blob, string>();

/** Combien d’écrans la vidéo simulée donne : 23 font deux lots de douze (0 à 11, 11 à 22), 80 en font huit (indiceDuLot). */
let ecrans = 23;
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
 * à l’envoi d’un lot gardé, `captcha` au laissez-passer (seulement avec la clé publique du CAPTCHA : l’A/B allumé, par défaut). Rend la liste des appels, les signaux, ce que portait chaque essai d’un lot (sa clé, son
 * ordre, sa place), les abandons reçus, les plans demandés et les lots gardés (leur rang).
 */
function serveur({
  lot,
  video = () => json(IMPORTEE),
  plan = () => json({ lecture: "entiere" }),
  ecrans: garder = () => json({ ok: true }),
  captcha = () => json({ ok: true, planDesVideos: true }),
}: {
  lot: (n: number, essai: number, indice: number) => Response | Promise<Response> | "pend";
  video?: (corps: unknown, k: number) => Response;
  plan?: (corps: unknown) => Response;
  ecrans?: (rang: number) => Response | Promise<Response>;
  captcha?: () => Response;
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
    if (url === "/api/captcha") {
      appels.push("captcha");
      return captcha();
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
    const indice = indiceDuLot((fd.getAll("captures")[0] as Blob).size - 1);
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

/**
 * La place d’un lot dans la vidéo simulée (0 : le plus ancien), d’après son premier écran (`premier`, de taille premier + 1).
 * Des lots de douze écrans découpés en partant de la fin, chacun reprenant le dernier du précédent : le plus récent
 * commence à l’écran ecrans − 12, chacun onze écrans avant le suivant, et le plus ancien, le reste, à l’écran 0.
 */
function indiceDuLot(premier: number): number {
  const lots = ecrans <= 12 ? 1 : 1 + Math.ceil((ecrans - 12) / 11);
  return premier === 0 ? 0 : lots - 1 - (ecrans - 12 - premier) / 11;
}

/* L’extraction est chargée à la demande (pVideo) : chargée d’avance, son import ne dépend plus du temps simulé */
beforeAll(async () => {
  await import("@/services/preparer-video");
});
beforeEach(() => {
  vi.useFakeTimers();
  ecrans = 23;
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
  /* Huit lots (de 0 à 7) : le plus récent, et les six d’avant, de douze écrans ; le plus ancien n’en a que trois. Une longue vidéo */
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
    /* Le plan : la longue vidéo, l’empreinte de son lot le plus récent (ses douze derniers écrans), son sens, et la clé de l’envoi (sa moitié s’y note) */
    const recent = `imessage:ab:${Array.from({ length: 12 }, (_, k) => `${sel}:${68 + k}`).join(",")}`;
    expect(plans).toEqual([{ lots: 8, video: recent, sensSur: true, cle, consentement: CASE_IMPORT.version }]);
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
    expect(gardes.map((g) => [g.rang, g.images])).toEqual([
      [0, 3],
      [1, 12],
      [2, 12],
    ]);
    expect(gardes.every((g) => g.cle === cle && g.priorite === "low")).toBe(true);
    /* Partis pendant la lecture, une fois la première lecture rendue (les images à lire d’abord), avant la question */
    expect(appels.slice(0, 7)).toEqual(["plan", ...[1, 2, 3, 4, 5].map((n) => `lot ${n} · essai 1`), "ecrans 0"]);
    expect(appels.filter((a) => a.startsWith("lot"))).toHaveLength(5);
    /* La jauge compte toute la vidéo dès le départ (« 5 sur 8 », jamais « 5 sur 5 »), puis passe au bout à « assez » */
    const lecture = avance.filter((a) => a.etape === "lecture");
    expect(lecture.every((a) => a.total === 8)).toBe(true);
    expect(lecture.map((a) => a.faits)).toEqual([0, 1, 2, 3, 4, 5, 8]);
  });

  it("les lots à garder attendent la première lecture rendue : ils ne partagent pas le réseau avec les images du premier tour", async () => {
    let rendre = () => {};
    const rendues = new Promise<void>((ok) => (rendre = ok));
    const { appels } = serveur({
      lot: async (n, essai, indice) => {
        await rendues;
        return lu(n, essai, indice);
      },
      plan: () => json({ lecture: "partielle" }),
      video: (_corps, k) => (k === 1 ? json({ suite: "garder", lots: 3 }) : json(IMPORTEE)),
    });
    const envoi = uploadRecording(VIDEO, "imessage", CASE_IMPORT.version);
    await vi.waitFor(() => expect(appels.filter((a) => a.startsWith("lot"))).toHaveLength(5));
    await vi.advanceTimersByTimeAsync(1000);
    expect(appels.some((a) => a.startsWith("ecrans"))).toBe(false);
    rendre();
    await expect(envoi).resolves.toEqual(IMPORTEE);
    expect(appels.filter((a) => a.startsWith("ecrans"))).toEqual(["ecrans 0", "ecrans 1", "ecrans 2"]);
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

  it("un morceau ajouté, une courte vidéo, un seul lot : aucun plan demandé ; la courte de deux lots ou plus dit à sa fin de quoi mesurer la règle visée (lue en entier) ; un sens douteux se dit au plan", async () => {
    const ajout = serveur({ lot: lu });
    await uploadRecording(VIDEO, "imessage", CASE_IMPORT.version, undefined, { ajout: true });
    expect(ajout.plans).toEqual([]);
    expect(ajout.corpsVideo).toEqual([expect.not.objectContaining({ partiel: expect.anything() })]);
    sel++;
    /* La plus longue des courtes : cinq lots de douze, un seul tour, lus sans attendre de plan ; sa fin dit l’empreinte de son lot le plus récent */
    ecrans = 56;
    const courte = serveur({ lot: lu });
    await uploadRecording(VIDEO, "imessage", CASE_IMPORT.version);
    expect(courte.plans).toEqual([]);
    expect(courte.appels[0]).toBe("lot 1 · essai 1");
    const recente = `imessage:ab:${Array.from({ length: 12 }, (_, k) => `${sel}:${44 + k}`).join(",")}`;
    expect(courte.corpsVideo).toEqual([expect.objectContaining({ lots: lectures(0, 1, 2, 3, 4), partiel: { restants: 0, ecrans: 56, video: recente, sensSur: true } })]);
    sel++;
    /* Deux lots : pareil */
    ecrans = 23;
    const deux = serveur({ lot: lu });
    await uploadRecording(VIDEO, "imessage", CASE_IMPORT.version);
    expect(deux.plans).toEqual([]);
    expect(deux.corpsVideo).toEqual([expect.objectContaining({ partiel: expect.objectContaining({ restants: 0, ecrans: 23 }) })]);
    sel++;
    /* Un seul lot : rien à épargner, rien à mesurer */
    ecrans = 12;
    const seul = serveur({ lot: lu });
    await uploadRecording(VIDEO, "imessage", CASE_IMPORT.version);
    expect(seul.plans).toEqual([]);
    expect(seul.corpsVideo).toEqual([expect.not.objectContaining({ partiel: expect.anything() })]);
    sel++;
    ecrans = 80;
    sensSur = false;
    const douteuse = serveur({ lot: lu });
    await uploadRecording(VIDEO, "imessage", CASE_IMPORT.version);
    expect(douteuse.plans).toEqual([expect.objectContaining({ sensSur: false })]);
  });

  it("le laissez-passer dit si l’A/B est allumé : éteint (« 0 », « mesure »), aucun plan demandé, les lots partent sans l’attendre ; allumé, le plan d’abord ; un serveur qui ne le dit pas, le plan aussi", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
    try {
      const eteint = serveur({ lot: lu, captcha: () => json({ ok: true, planDesVideos: false }) });
      await expect(uploadRecording(VIDEO, "imessage", CASE_IMPORT.version)).resolves.toEqual(IMPORTEE);
      expect(eteint.appels.slice(0, 2)).toEqual(["captcha", "lot 1 · essai 1"]);
      expect(eteint.plans).toEqual([]);
      /* Lue en entier, dans l’ordre ; sa fin dit quand même de quoi mesurer la règle visée */
      expect(eteint.champs.map((c) => c.indice)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(eteint.corpsVideo).toEqual([expect.objectContaining({ partiel: expect.objectContaining({ restants: 0, ecrans: 80 }) })]);
      sel++;
      const allume = serveur({ lot: lu });
      await uploadRecording(VIDEO, "imessage", CASE_IMPORT.version);
      expect(allume.appels.slice(0, 3)).toEqual(["captcha", "plan", "lot 1 · essai 1"]);
      sel++;
      const ancien = serveur({ lot: lu, captcha: () => json({ ok: true }) });
      await uploadRecording(VIDEO, "imessage", CASE_IMPORT.version);
      expect(ancien.appels.slice(0, 3)).toEqual(["captcha", "plan", "lot 1 · essai 1"]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
