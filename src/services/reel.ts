/**
 * Les appels au vrai back-end, depuis le navigateur (routes /api). Les cookies de session sont httpOnly :
 * le navigateur les envoie, il ne les lit pas.
 */
import type { AnalysisProgress, AppKind, BlushAnswer, Fiche, FicheFact, FicheUpdate, Guess, Goal, Plan, Source, Story, Subscription } from "@/types";
import { preparerCaptures } from "./preparer-captures";
import type { Account, ReportPayload } from "./api";
import { analyserExport, ExportIllisible, preparerExport, type ConvInstagram } from "./preparer-export";

/** Une erreur du back-end : son code (« groupe », « courte », « bientot »…), jamais de détail interne. */
export class ErreurApi extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

async function appel<T>(chemin: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(chemin, { credentials: "same-origin", cache: "no-store", ...init });
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
  /** Le lien de partage du verdict (son identifiant) : le créer (toujours le même), le désactiver. */
  async creerLienPartage(): Promise<string> {
    return (await appel<{ id: string }>("/api/partage", envoi("POST"))).id;
  },
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
      fd.append("export", pret.paquetDe(id), "export.json.gz");
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
  getAnalysisProgress: () => appel<AnalysisProgress>("/api/analyse"),
  getReport: () => appel<ReportPayload>("/api/rapport"),
  unlock: (offre: Exclude<Plan, "gratuit">) => appel<Subscription>("/api/debloquer", envoi("POST", { offre })),
  getAccount: () => appel<Account>("/api/compte"),
  setPaused: (paused: boolean) => appel<{ ok: true }>("/api/compte", envoi("POST", { paused })),
  deleteStory: () => appel<{ ok: true }>("/api/histoire", envoi("DELETE")),
  deleteAccount: () => appel<{ ok: true }>("/api/compte", envoi("DELETE")),
  sendToBlush: (texte: string) => appel<BlushAnswer>("/api/chat", envoi("POST", { texte })),
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
