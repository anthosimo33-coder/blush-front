/**
 * Couche de service CRUSH — le seul point de contact avec les données.
 * Aujourd’hui : renvoie les mocks. Demain : brancher le vrai back-end ne touche que ce fichier.
 */
import type {
  AnalysisProgress,
  AppKind,
  Fiche,
  FicheExtraction,
  FicheFact,
  Goal,
  Guess,
  Plan,
  QuestionAnswer,
  Reply,
  Report,
  SoberReport,
  Source,
  Story,
  Subscription,
} from "@/types";
import { FICHE, FICHE_EXTRACTION, REPLY, SUBSCRIPTIONS } from "@/mocks/daily";
import { QUESTION_ANSWER, REPORT, SOBER_REPORT } from "@/mocks/report";
import { SCREENSHOTS_RESULT, SOURCE_HINGE, SOURCE_INSTAGRAM, SOURCE_WHATSAPP, STORY } from "@/mocks/story";
import { delay, mockServer } from "@/mocks/server";

export type Account = {
  email: string | null;
  subscription: Subscription;
  storyDeleted: boolean;
};

export type ReportPayload = {
  report: Report;
  /** Présent quand le verdict est dur : le rapport bascule en mode sobre. */
  sober: SoberReport | null;
  access: Plan;
};

/* Durée simulée de la lecture (environ 6 s). */
const ANALYSIS_MS = 6000;

/* ———— Import ———— */

export async function uploadExport(file: File, app: Extract<AppKind, "whatsapp" | "imessage">): Promise<Source> {
  await delay(500);
  mockServer.set({ analysisStartedAt: null });
  return { ...SOURCE_WHATSAPP, app, fileName: file.name };
}

export async function uploadScreenshots(
  files: File[],
  opts: { app: AppKind; mode: "first" | "add" },
): Promise<{ source: Source; messagesRead: number }> {
  await delay(500);
  const base = opts.app === "hinge" ? SOURCE_HINGE : SOURCE_INSTAGRAM;
  return {
    source: { ...base, app: opts.app, screenshotCount: files.length },
    messagesRead: opts.mode === "first" ? SCREENSHOTS_RESULT.messagesRead : base.messageCount,
  };
}

export async function getStory(): Promise<Story> {
  return STORY;
}

/* ———— Compte et analyse ———— */

/** Envoie le code à 6 chiffres par email (simulation : rien ne part). */
export async function sendLoginCode(email: string): Promise<{ email: string }> {
  await delay(500);
  return { email };
}

/** Vérifie le code reçu. Simulation : tout code à 6 chiffres passe, sauf 000000 (pour montrer l’erreur). */
export async function verifyLoginCode(email: string, code: string): Promise<{ ok: boolean }> {
  void email;
  await delay(600);
  return { ok: /^\d{6}$/.test(code) && code !== "000000" };
}

/** Crée le compte sans mot de passe. */
export async function createAccount(email: string): Promise<{ email: string }> {
  await delay(400);
  mockServer.set({ email });
  return { email };
}

export async function startAnalysis(input: { me: string; guess: Guess; goal: Goal }, opts: { restart?: boolean } = {}): Promise<{ jobId: string }> {
  void input;
  const s = mockServer.get();
  if (!s.analysisStartedAt || opts.restart) mockServer.set({ analysisStartedAt: Date.now() });
  return { jobId: "job-001" };
}

export async function getAnalysisProgress(jobId: string): Promise<AnalysisProgress> {
  void jobId;
  const started = mockServer.get().analysisStartedAt ?? Date.now();
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const total = reduced ? 600 : ANALYSIS_MS;
  const t = Math.min(1, (Date.now() - started) / total);
  const ease = (x: number) => 1 - Math.pow(1 - x, 3);
  return {
    progress: Math.min(1, t / 0.93),
    messagesRead: Math.round(STORY.totalMessages * ease(Math.min(1, t / 0.7))),
    stepsDone: [0.13, 0.33, 0.53, 0.77].filter((s) => t >= s).length,
    discoveries: [0.17, 0.33, 0.5].filter((s) => t >= s).length,
    done: t >= 1,
  };
}

/** Le rapport, avec les droits d’accès. Les chapitres non payés arrivent verrouillés, sans contenu. */
export async function getReport(): Promise<ReportPayload> {
  const s = mockServer.get();
  const full = s.plan !== "gratuit";
  const chapters = REPORT.chapters.map((c) => (c.free || full ? c : { ...c, locked: true, blocks: [] }));
  const difficult = s.verdict === "difficile";
  return {
    report: { ...REPORT, chapters, verdict: { ...REPORT.verdict, difficult } },
    sober: difficult ? SOBER_REPORT : null,
    access: s.plan,
  };
}

/** Simule le paiement. */
export async function unlock(offer: Exclude<Plan, "gratuit">): Promise<Subscription> {
  await delay(900);
  mockServer.set({ plan: offer, paused: false, cancelled: false });
  return SUBSCRIPTIONS[offer];
}

/* ———— Question incluse ———— */

export async function askQuestion(question: string): Promise<QuestionAnswer> {
  await delay(1200);
  mockServer.set({ questionAsked: question });
  return { ...QUESTION_ANSWER, question };
}

export async function getQuestion(): Promise<QuestionAnswer | null> {
  const q = mockServer.get().questionAsked;
  return q ? { ...QUESTION_ANSWER, question: q } : null;
}

/* ———— Au quotidien ———— */

export async function analyzeMessage(file: File | null): Promise<Reply> {
  void file;
  await delay(900);
  return REPLY;
}

/**
 * Le chat de l’accueil. Simulation : un texte qui finit par « ? » est une question pour CRUSH,
 * tout le reste (texte collé, captures, export) est lu comme sa réponse à elle.
 */
export type CrushAnswer = { kind: "analysis"; reply: Reply } | { kind: "answer"; answer: QuestionAnswer };

export async function sendToCrush(input: { text?: string; files?: File[] }): Promise<CrushAnswer> {
  void input.files;
  await delay(1100);
  const text = input.text?.trim();
  if (text && text.endsWith("?")) return { kind: "answer", answer: { ...QUESTION_ANSWER, question: text } };
  return { kind: "analysis", reply: REPLY };
}

/* ———— Sa fiche ———— */

export async function getFiche(): Promise<Fiche> {
  return { ...FICHE, facts: mockServer.get().ficheFacts };
}

export async function updateFiche(facts: FicheFact[]): Promise<Fiche> {
  mockServer.set({ ficheFacts: facts });
  await delay(250);
  return { ...FICHE, facts };
}

/** Lit une capture (bio, post) et propose ce qui peut aller dans sa fiche. Rien n’est cherché ailleurs. */
export async function extractFromCapture(file: File | null): Promise<FicheExtraction> {
  void file;
  await delay(700);
  return FICHE_EXTRACTION;
}

/* ———— Compte ———— */

export async function getAccount(): Promise<Account> {
  const s = mockServer.get();
  const sub = SUBSCRIPTIONS[s.plan];
  return {
    email: s.email,
    subscription: { ...sub, paused: s.paused, active: sub.active && !s.cancelled },
    storyDeleted: s.storyDeleted,
  };
}

export async function setPaused(paused: boolean): Promise<void> {
  await delay(200);
  mockServer.set({ paused });
}

export async function cancelSubscription(): Promise<void> {
  await delay(500);
  mockServer.set({ cancelled: true });
}

/** Supprime l’histoire : le rapport, la fiche et les captures. */
export async function deleteStory(): Promise<void> {
  await delay(500);
  mockServer.set({ storyDeleted: true, ficheFacts: FICHE.facts, questionAsked: null, analysisStartedAt: null });
}

/** Tout effacer : le compte et toutes les histoires. */
export async function deleteAccount(): Promise<void> {
  await delay(500);
  mockServer.reset();
}
