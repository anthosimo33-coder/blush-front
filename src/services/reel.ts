/**
 * Les appels au vrai back-end, depuis le navigateur (routes /api). Les cookies de session sont httpOnly :
 * le navigateur les envoie, il ne les lit pas.
 */
import type { AnalysisProgress, AppKind, BlushAnswer, BulleChat, EvenementChat, Fiche, FicheFact, FicheUpdate, Guess, Goal, Plan, Source, Story, Subscription } from "@/types";
import { preparerCaptures } from "./preparer-captures";
import { ENTETE_CONV, lireConvDeLaPage } from "./session";
import type { Account, ReportPayload, VerdictMontre } from "./api";
import type { ConvInstagram } from "./preparer-export";

/*
 * Les préparateurs d’un export (fflate, les lecteurs d’Instagram) et d’un enregistrement d’écran ne sont chargés qu’au
 * moment d’importer : ce module est importé par presque tous les écrans. L’écran qui ouvre le sélecteur de fichier les
 * précharge, pour qu’ils soient là quand le fichier arrive.
 */
const pExport = () => import("./preparer-export");
const pVideo = () => import("./preparer-video");
export const prechargerExport = () => void pExport().catch(() => {});
export const prechargerVideo = () => void pVideo().catch(() => {});

/** Où en est la lecture d’un enregistrement d’écran : la vidéo regardée dans le navigateur, puis ses lots lus par BLUSH. */
/** Un morceau de l’historique du chat (du plus ancien au plus récent), et s’il en reste de plus anciens. */
export type HistoriqueChat = { echanges: { id: number; mine: string; answer: BlushAnswer; at: number }[]; plus: boolean; modeVocal?: boolean };

/* « reprise » : le réseau a coupé pendant un envoi de captures ou d’enregistrement, il repart (voir avecReprise) */
export type AvanceVideo = { etape: "video"; p: number } | { etape: "lecture"; faits: number; total: number } | { etape: "reprise" };

/** Une erreur du back-end : son code (« groupe », « courte », « bientot »…), jamais de détail interne. */
export class ErreurApi extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

/** Le chat : la réponse n’est pas arrivée en entier (le réseau a coupé, ou une erreur après des bulles). Les bulles déjà reçues, peut-être aucune. */
export class CoupureChat extends Error {
  constructor(readonly recues: BulleChat[]) {
    super("coupure");
  }
}

/** Pendant la réponse du chat : ses bulles une à une (toutes celles reçues), puis son vocal, qui arrive après elle (null : elle reste écrite). */
export type SuiviChat = { bulles?: (recues: BulleChat[]) => void; vocal?: (vocal: NonNullable<BlushAnswer["vocal"]> | null) => void };

/** Les en-têtes d’un appel, avec la conv de la page (voir ENTETE_CONV). */
export function avecConv(entetes?: HeadersInit): Headers {
  const h = new Headers(entetes);
  const conv = lireConvDeLaPage();
  if (conv) h.set(ENTETE_CONV, conv);
  return h;
}

async function appel<T>(chemin: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(chemin, { credentials: "same-origin", cache: "no-store", ...init, headers: avecConv(init.headers) });
  const corps = (await r.json().catch(() => ({}))) as { erreur?: string };
  if (!r.ok) throw new ErreurApi(corps.erreur ?? "erreur", r.status);
  return corps as T;
}
/**
 * Un message au chat. La réponse arrive en flux (une ligne JSON par événement, src/app/api/chat/route.ts) : les bulles
 * passent à `suivi` à mesure, la promesse se résout avec la réponse validée, sans attendre le vocal, qui arrive ensuite
 * par `suivi` (sans `suivi.vocal`, on cesse de lire : le serveur finit seul). Une erreur avant que BLUSH écrive :
 * ErreurApi, comme les autres appels. Le réseau qui coupe, ou une erreur après des bulles : CoupureChat.
 */
async function chat(init: RequestInit, suivi: SuiviChat = {}): Promise<BlushAnswer> {
  const recues: BulleChat[] = [];
  let r: Response;
  try {
    const entetes = avecConv(init.headers);
    entetes.set("accept", "application/x-ndjson");
    r = await fetch("/api/chat", { credentials: "same-origin", cache: "no-store", ...init, headers: entetes });
  } catch {
    throw new CoupureChat(recues);
  }
  /* Une erreur avant que BLUSH écrive, ou un serveur d’avant le flux (pendant une mise en ligne) : la réponse d’un bloc */
  if (!r.ok || !r.body || !r.headers.get("content-type")?.includes("ndjson")) {
    const corps = (await r.json().catch(() => ({}))) as BlushAnswer & { erreur?: string };
    if (!r.ok || !("kind" in corps)) throw new ErreurApi(corps.erreur ?? "erreur", r.ok ? 500 : r.status);
    return corps;
  }
  const lecteur = r.body.getReader();
  return new Promise<BlushAnswer>((resoudre, rejeter) => {
    let reponse = null as BlushAnswer | null;
    let vocal = false;
    const traiter = (e: EvenementChat) => {
      if ("bulle" in e) {
        recues.push(e.bulle);
        suivi.bulles?.([...recues]);
      } else if ("reponse" in e) {
        reponse = e.reponse;
        resoudre(e.reponse);
        if (!e.reponse.vocalEnCours || !suivi.vocal) void lecteur.cancel().catch(() => {});
      } else if ("vocal" in e) {
        vocal = true;
        suivi.vocal?.(e.vocal);
      } else if (!reponse) rejeter(recues.length ? new CoupureChat(recues) : new ErreurApi(e.erreur, 502));
    };
    void (async () => {
      const decodeur = new TextDecoder();
      let reste = "";
      try {
        for (;;) {
          const { done, value } = await lecteur.read();
          reste += decodeur.decode(value, { stream: !done });
          const lignes = reste.split("\n");
          reste = lignes.pop() ?? "";
          for (const l of lignes) if (l.trim()) traiter(JSON.parse(l) as EvenementChat);
          if (done) break;
        }
      } catch {
        /* Le réseau a coupé (ou la lecture a été arrêtée) : voir plus bas */
      }
      /* Le flux s’arrête sans la réponse : coupé. Après elle, le vocal attendu ne viendra plus : elle reste écrite */
      if (!reponse) rejeter(new CoupureChat(recues));
      else if (reponse.vocalEnCours && !vocal) suivi.vocal?.(null);
    })();
  });
}

const envoi = (methode: "POST" | "DELETE", corps?: unknown): RequestInit => ({
  method: methode,
  ...(corps === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(corps) }),
});

/** Des captures (réduites dans le navigateur) ou un export (compressé) dans un formulaire, sous `cle`. */
async function avecFichiers(fd: FormData, files: File[]): Promise<FormData> {
  const images = files.filter((f) => f.type.startsWith("image/"));
  /* Chargé hors du try : un préparateur que le réseau n’a pas apporté n’est pas un fichier illisible */
  const px = images.length ? null : await pExport();
  try {
    if (images.length) (await preparerCaptures(images)).forEach((b, k) => fd.append("captures", b, `capture-${k + 1}.jpg`));
    else fd.append("export", await px!.preparerExport(files[0]), "export.json.gz");
  } catch (e) {
    throw new ErreurApi(images.length ? "capture" : px && e instanceof px.ExportIllisible && e.code !== "plusieurs" ? e.code : "fichier", 422);
  }
  return fd;
}

/* Les lots d’un enregistrement lus en même temps (chacun est un appel au modèle : lotParIp et lotsParCompte les bornent) */
const LECTEURS = 5;

/** La clé d’un envoi : le serveur reconnaît un nouvel essai du même envoi (src/server/captures.ts, reprise). */
const cleEnvoi = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (o) => o.toString(16).padStart(2, "0")).join(""));

/**
 * Un long envoi (30 s à 2 min de lecture) que le réseau coupe : Safari passé en arrière-plan, l’écran verrouillé, le
 * Wi-Fi qui passe en 4G. Il repart une fois, dès que la page est de nouveau visible : avec la même clé, le serveur rend
 * la lecture déjà faite au lieu de la refaire (et de la repayer). Une réponse du serveur (ErreurApi) n’est pas rejouée.
 */
async function avecReprise<T>(envoyer: () => Promise<T>, onReprise?: () => void): Promise<T> {
  try {
    return await envoyer();
  } catch (e) {
    if (e instanceof ErreurApi) throw e;
    onReprise?.();
    await quandVisible();
    return envoyer();
  }
}

/** Une petite pause, puis la page visible (au retour dans Safari) et en ligne ; hors ligne, on n’attend pas plus de 30 s. */
function quandVisible(): Promise<void> {
  return new Promise((ok) => {
    const debut = Date.now();
    const verifier = () => {
      if (document.visibilityState !== "visible" || (!navigator.onLine && Date.now() - debut < 30_000)) return;
      clearInterval(minuteur);
      document.removeEventListener("visibilitychange", verifier);
      window.removeEventListener("online", verifier);
      ok();
    };
    const minuteur = setInterval(verifier, 1000);
    document.addEventListener("visibilitychange", verifier);
    window.addEventListener("online", verifier);
  });
}

export const reel = {
  /**
   * Un enregistrement d’écran : le navigateur en tire les écrans de la conv (la vidéo ne part pas), BLUSH les lit
   * par lots (cinq à la fois), puis les lectures sont rassemblées en une histoire brouillon, comme des captures.
   */
  async uploadRecording(file: File, app: AppKind, onAvance?: (a: AvanceVideo) => void): Promise<{ source: Source; messagesRead: number }> {
    const { imagesDeLaVideo, lotsDe, VideoIllisible } = await pVideo();
    let images: Blob[];
    try {
      images = await imagesDeLaVideo(file, (p) => onAvance?.({ etape: "video", p }));
    } catch (e) {
      throw new ErreurApi(e instanceof VideoIllisible ? e.code : "video", 422);
    }
    /*
     * Des lots de six écrans, et de 4 Mo au plus (des écrans sombres ou des photos pèsent plus lourd). La lecture d’un
     * lot dure environ 9 s plus 0,45 s par message : des lots de six, lus cinq à la fois, finissent bien plus tôt que des
     * lots de douze lus trois à la fois (environ 35 s au lieu de 49 pour 45 s de vidéo), pour un peu plus d’images lues
     * deux fois (celles qui recollent deux lots).
     */
    const lots = lotsDe(images, 6, (b) => b.size, 4 * 1024 * 1024);
    const lus: unknown[] = new Array(lots.length);
    let faits = 0;
    onAvance?.({ etape: "lecture", faits, total: lots.length });
    let suivant = 0;
    /* Un lot qui échoue encore après un nouvel essai : les autres s’arrêtent (pas d’appels payés pour rien) */
    const arret = new AbortController();
    const lireLot = async (k: number) => {
      const fd = new FormData();
      lots[k].forEach((b, i) => fd.append("captures", b, `ecran-${k + 1}-${i + 1}.jpg`));
      fd.append("app", app);
      return (await appel<{ lot: unknown }>("/api/captures/lot", { method: "POST", body: fd, signal: arret.signal })).lot;
    };
    const lecteur = async () => {
      while (suivant < lots.length && !arret.signal.aborted) {
        const k = suivant++;
        try {
          lus[k] = await lireLot(k).catch(async (e: unknown) => {
            /* Une erreur passagère (réseau, serveur) : un nouvel essai, le reste n’est pas à refaire */
            if (arret.signal.aborted || (e instanceof ErreurApi && e.status < 500 && e.code !== "erreur")) throw e;
            /* Le réseau : on attend que Safari soit revenu au premier plan (en arrière-plan, l’essai échouerait encore) */
            await (e instanceof ErreurApi ? new Promise((r) => setTimeout(r, 1500)) : quandVisible());
            return lireLot(k);
          });
        } catch (e) {
          arret.abort();
          throw e;
        }
        onAvance?.({ etape: "lecture", faits: ++faits, total: lots.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(LECTEURS, lots.length) }, lecteur));
    /* La clé : un nouvel essai après une coupure retrouve l’histoire déjà créée au lieu d’en faire une seconde */
    const corps = envoi("POST", { app, lots: lus, cle: cleEnvoi() });
    return avecReprise(
      () => appel<{ source: Source; messagesRead: number }>("/api/captures/video", corps),
      () => onAvance?.({ etape: "reprise" }),
    );
  },
  /** Le lien de partage du verdict (son identifiant) : le créer (toujours le même), le désactiver. */
  /** Une image partagée pour de bon (pas seulement préparée) : le compteur du partage. */
  compterImagePartagee: () => appel<{ ok: true }>("/api/partage/compte", envoi("POST")).catch(() => {}),
  creerLienPartage: () => appel<{ id: string; verdict: VerdictMontre | null }>("/api/partage", envoi("POST")),
  async desactiverLienPartage(): Promise<void> {
    await appel("/api/partage", envoi("DELETE"));
  },
  /**
   * Un export : lu et réduit dans le navigateur. Un export Instagram complet : `choisir` fait choisir la conv
   * (null : on a renoncé, erreur « annule »), et seule celle-là part.
   */
  async uploadExport(file: File, choisir?: (convs: ConvInstagram[]) => Promise<string | null>, onAvance?: (part: number) => void): Promise<Source> {
    const fd = new FormData();
    const { analyserExport, ExportIllisible } = await pExport();
    let pret: Awaited<ReturnType<typeof analyserExport>>;
    try {
      pret = await analyserExport(file, onAvance);
    } catch (e) {
      throw new ErreurApi(e instanceof ExportIllisible ? "fichier" : "fichier", 422);
    }
    if (pret.type === "un") fd.append("export", pret.paquet, "export.json.gz");
    else {
      const id = choisir ? await choisir(pret.convs) : null;
      if (id == null) throw new ErreurApi("annule", 0);
      fd.append("export", await pret.paquetDe(id), "export.json.gz");
    }
    return (await appel<{ source: Source }>("/api/import", { method: "POST", body: fd })).source;
  },
  /**
   * Les captures, réduites dans le navigateur, puis lues par BLUSH (une seule fois, pour toutes). `onAvance` ne dit
   * que la reprise, si le réseau coupe pendant la lecture.
   */
  async uploadScreenshots(files: File[], opts: { app: AppKind; mode: "first" | "add"; onAvance?: (a: AvanceVideo) => void }): Promise<{ source: Source; messagesRead: number }> {
    const fd = new FormData();
    try {
      (await preparerCaptures(files)).forEach((b, k) => fd.append("captures", b, `capture-${k + 1}.jpg`));
    } catch {
      throw new ErreurApi("capture", 422);
    }
    fd.append("app", opts.app);
    fd.append("mode", opts.mode);
    fd.append("cle", cleEnvoi());
    return avecReprise(
      () => appel<{ source: Source; messagesRead: number }>("/api/captures", { method: "POST", body: fd }),
      () => opts.onAvance?.({ etape: "reprise" }),
    );
  },
  getStory: () => appel<Story>("/api/histoire"),
  sendLoginCode: (email: string) => appel<{ email: string }>("/api/auth/code", envoi("POST", { email })),
  verifyLoginCode: (email: string, code: string) => appel<{ ok: boolean }>("/api/auth/verifier", envoi("POST", { email, code })),
  startAnalysis: (input: { me: string; guess: Guess; goal: Goal; pronom: "il" | "elle"; prenom?: string }) => appel<{ jobId: string }>("/api/analyse", envoi("POST", input)),
  /** Sans « Qui es-tu ? » : la lecture de la conv qu’on suit (lancée, ou à relancer). */
  resumeAnalysis: () => appel<{ jobId: string }>("/api/analyse", envoi("POST", {})),
  getAnalysisProgress: () => appel<AnalysisProgress>("/api/analyse"),
  getReport: () => appel<ReportPayload>("/api/rapport"),
  /** « Relancer l’écriture » d’un rapport en échec : le rapport tel qu’il repart. */
  relancerRapport: () => appel<ReportPayload>("/api/rapport", envoi("POST")),
  /** Un moment de l’écoute du vocal (A/B test des voix). Sans réponse attendue : un échec ne gêne pas l’écoute. */
  /* keepalive : « Repasser à l’écrit » part même si la page se recharge ou se ferme juste après */
  modeVocal: (actif: boolean) => appel<{ modeVocal: boolean }>("/api/chat/vocal", { ...envoi("POST", { actif }), keepalive: true }).catch(() => {}),
  /* keepalive : l’écoute fermée en quittant la page part quand même */
  ecouteVocal: (evenement: "debut" | "fin" | "reecoute" | "ferme", position: number) =>
    appel<{ ok: true }>("/api/vocal/ecoute", { ...envoi("POST", { evenement, position }), keepalive: true }).catch(() => {}),
  unlock: (offre: Exclude<Plan, "gratuit">) => appel<Subscription>("/api/debloquer", envoi("POST", { offre })),
  getAccount: () => appel<Account>("/api/compte"),
  setPaused: (paused: boolean) => appel<{ ok: true }>("/api/compte", envoi("POST", { paused })),
  deleteStory: () => appel<{ ok: true }>("/api/histoire", envoi("DELETE")),
  deleteAccount: () => appel<{ ok: true }>("/api/compte", envoi("DELETE")),
  sendToBlush: (texte: string, suivi?: SuiviChat) => chat(envoi("POST", { texte }), suivi),
  /** L’historique du chat : les derniers échanges, ou ceux d’avant un échange déjà affiché. */
  historiqueChat: (avant?: number) => appel<HistoriqueChat>(`/api/chat${avant ? `?avant=${avant}` : ""}`),
  /** Des captures (leur conv, son profil) ou un nouvel export, envoyés à BLUSH dans le chat, avec ou sans un mot. */
  async sendFilesToBlush(files: File[], texte?: string, suivi?: SuiviChat): Promise<BlushAnswer> {
    const fd = await avecFichiers(new FormData(), files);
    if (texte) fd.append("texte", texte);
    return chat({ method: "POST", body: fd }, suivi);
  },
  /** Un vocal : transcrit côté serveur, puis lu par BLUSH comme un message. */
  sendVoiceToBlush(audio: Blob, suivi?: SuiviChat): Promise<BlushAnswer> {
    const fd = new FormData();
    fd.append("vocal", audio, `vocal.${audio.type.includes("webm") ? "webm" : audio.type.includes("ogg") ? "ogg" : "m4a"}`);
    return chat({ method: "POST", body: fd }, suivi);
  },
  /**
   * Des captures ou un export pour sa fiche : la réponse part dès la lecture, avec ce qui a été lu (`pending`) ; la
   * mémoire se met à jour ensuite, et la fiche se relit (GET /api/fiche) jusqu’à ce qu’elle ne dise plus `updating`.
   */
  async addToFiche(files: File[]): Promise<FicheUpdate> {
    return appel<FicheUpdate>("/api/fiche", { method: "POST", body: await avecFichiers(new FormData(), files) });
  },
  getFiche: () => appel<Fiche>("/api/fiche"),
  updateFiche: (facts: FicheFact[]) => appel<Fiche>("/api/fiche", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts }) }),
};
