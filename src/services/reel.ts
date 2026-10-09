/**
 * Les appels au vrai back-end, depuis le navigateur (routes /api). Les cookies de session sont httpOnly :
 * le navigateur les envoie, il ne les lit pas.
 */
import type { AnalysisProgress, AppKind, BlushAnswer, Fiche, FicheFact, FicheUpdate, Guess, Goal, Plan, Source, Story, Subscription } from "@/types";
import { preparerCaptures } from "./preparer-captures";
import { ENTETE_CONV, lireConvDeLaPage } from "./session";
import type { Account, ReportPayload, VerdictMontre } from "./api";
import { analyserExport, ExportIllisible, preparerExport, type ConvInstagram } from "./preparer-export";
import { imagesDeLaVideo, lotsDe, VideoIllisible } from "./preparer-video";

/** Où en est la lecture d’un enregistrement d’écran : la vidéo regardée dans le navigateur, puis ses lots lus par BLUSH. */
/** Un morceau de l’historique du chat (du plus ancien au plus récent), et s’il en reste de plus anciens. */
export type HistoriqueChat = { echanges: { id: number; mine: string; answer: BlushAnswer; at: number }[]; plus: boolean };

export type AvanceVideo = { etape: "video"; p: number } | { etape: "lecture"; faits: number; total: number };

/** Une erreur du back-end : son code (« groupe », « courte », « bientot »…), jamais de détail interne. */
export class ErreurApi extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

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
const envoi = (methode: "POST" | "DELETE", corps?: unknown): RequestInit => ({
  method: methode,
  ...(corps === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(corps) }),
});

/** Des captures (réduites dans le navigateur) ou un export (compressé) dans un formulaire, sous `cle`. */
async function avecFichiers(fd: FormData, files: File[]): Promise<FormData> {
  const images = files.filter((f) => f.type.startsWith("image/"));
  try {
    if (images.length) (await preparerCaptures(images)).forEach((b, k) => fd.append("captures", b, `capture-${k + 1}.jpg`));
    else fd.append("export", await preparerExport(files[0]), "export.json.gz");
  } catch (e) {
    throw new ErreurApi(images.length ? "capture" : e instanceof ExportIllisible && e.code !== "plusieurs" ? e.code : "fichier", 422);
  }
  return fd;
}

export const reel = {
  /**
   * Un enregistrement d’écran : le navigateur en tire les écrans de la conv (la vidéo ne part pas), BLUSH les lit
   * par lots (trois à la fois), puis les lectures sont rassemblées en une histoire brouillon, comme des captures.
   */
  async uploadRecording(file: File, app: AppKind, onAvance?: (a: AvanceVideo) => void): Promise<{ source: Source; messagesRead: number }> {
    let images: Blob[];
    try {
      images = await imagesDeLaVideo(file, (p) => onAvance?.({ etape: "video", p }));
    } catch (e) {
      throw new ErreurApi(e instanceof VideoIllisible ? e.code : "video", 422);
    }
    /* Des lots d’une douzaine d’écrans, et de 4 Mo au plus (des écrans sombres ou des photos pèsent plus lourd) */
    const lots = lotsDe(images, 12, (b) => b.size, 4 * 1024 * 1024);
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
            await new Promise((r) => setTimeout(r, 1500));
            return lireLot(k);
          });
        } catch (e) {
          arret.abort();
          throw e;
        }
        onAvance?.({ etape: "lecture", faits: ++faits, total: lots.length });
      }
    };
    await Promise.all([lecteur(), lecteur(), lecteur()]);
    return appel<{ source: Source; messagesRead: number }>("/api/captures/video", envoi("POST", { app, lots: lus }));
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
  async uploadExport(file: File, choisir?: (convs: ConvInstagram[]) => Promise<string | null>): Promise<Source> {
    const fd = new FormData();
    let pret: Awaited<ReturnType<typeof analyserExport>>;
    try {
      pret = await analyserExport(file);
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
  /** Les captures, réduites dans le navigateur, puis lues par BLUSH (une seule fois, pour toutes). */
  async uploadScreenshots(files: File[], opts: { app: AppKind; mode: "first" | "add" }): Promise<{ source: Source; messagesRead: number }> {
    const fd = new FormData();
    try {
      (await preparerCaptures(files)).forEach((b, k) => fd.append("captures", b, `capture-${k + 1}.jpg`));
    } catch {
      throw new ErreurApi("capture", 422);
    }
    fd.append("app", opts.app);
    fd.append("mode", opts.mode);
    return appel<{ source: Source; messagesRead: number }>("/api/captures", { method: "POST", body: fd });
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
  modeVocal: (actif: boolean) => appel<{ modeVocal: boolean }>("/api/chat/vocal", envoi("POST", { actif })).catch(() => {}),
  /* keepalive : l’écoute fermée en quittant la page part quand même */
  ecouteVocal: (evenement: "debut" | "fin" | "reecoute" | "ferme", position: number) =>
    appel<{ ok: true }>("/api/vocal/ecoute", { ...envoi("POST", { evenement, position }), keepalive: true }).catch(() => {}),
  unlock: (offre: Exclude<Plan, "gratuit">) => appel<Subscription>("/api/debloquer", envoi("POST", { offre })),
  getAccount: () => appel<Account>("/api/compte"),
  setPaused: (paused: boolean) => appel<{ ok: true }>("/api/compte", envoi("POST", { paused })),
  deleteStory: () => appel<{ ok: true }>("/api/histoire", envoi("DELETE")),
  deleteAccount: () => appel<{ ok: true }>("/api/compte", envoi("DELETE")),
  sendToBlush: (texte: string) => appel<BlushAnswer>("/api/chat", envoi("POST", { texte })),
  /** L’historique du chat : les derniers échanges, ou ceux d’avant un échange déjà affiché. */
  historiqueChat: (avant?: number) => appel<HistoriqueChat>(`/api/chat${avant ? `?avant=${avant}` : ""}`),
  /** Des captures (leur conv, son profil) ou un nouvel export, envoyés à BLUSH dans le chat, avec ou sans un mot. */
  async sendFilesToBlush(files: File[], texte?: string): Promise<BlushAnswer> {
    const fd = await avecFichiers(new FormData(), files);
    if (texte) fd.append("texte", texte);
    return appel<BlushAnswer>("/api/chat", { method: "POST", body: fd });
  },
  /** Un vocal : transcrit côté serveur, puis lu par BLUSH comme un message. */
  sendVoiceToBlush(audio: Blob): Promise<BlushAnswer> {
    const fd = new FormData();
    fd.append("vocal", audio, `vocal.${audio.type.includes("webm") ? "webm" : audio.type.includes("ogg") ? "ogg" : "m4a"}`);
    return appel<BlushAnswer>("/api/chat", { method: "POST", body: fd });
  },
  /** Des captures ou un export pour sa fiche : la fiche mise à jour et les infos qui viennent d’arriver. */
  async addToFiche(files: File[]): Promise<FicheUpdate> {
    return appel<FicheUpdate>("/api/fiche", { method: "POST", body: await avecFichiers(new FormData(), files) });
  },
  getFiche: () => appel<Fiche>("/api/fiche"),
  updateFiche: (facts: FicheFact[]) => appel<Fiche>("/api/fiche", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts }) }),
};
