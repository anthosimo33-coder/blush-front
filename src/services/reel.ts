/**
 * Les appels au vrai back-end, depuis le navigateur (routes /api). Les cookies de session sont httpOnly :
 * le navigateur les envoie, il ne les lit pas.
 */
import type { AnalysisProgress, AppKind, BlushAnswer, Fiche, FicheFact, Guess, Goal, Plan, Source, Story, Subscription } from "@/types";
import { preparerCaptures } from "./preparer-captures";
import type { Account, ReportPayload } from "./api";
import { ExportIllisible, preparerExport } from "./preparer-export";

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

export const reel = {
  async uploadExport(file: File): Promise<Source> {
    const fd = new FormData();
    try {
      fd.append("export", await preparerExport(file), "export.json.gz");
    } catch (e) {
      /* « plusieurs » : un export Instagram complet. Pour l’instant, on demande le fichier de la bonne conv */
      throw new ErreurApi(e instanceof ExportIllisible ? (e.code === "plusieurs" ? "fichier" : e.code) : "fichier", 422);
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
  getFiche: () => appel<Fiche>("/api/fiche"),
  updateFiche: (facts: FicheFact[]) => appel<Fiche>("/api/fiche", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts }) }),
};
