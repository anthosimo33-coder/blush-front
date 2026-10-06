/**
 * Couche de service BLUSH — le seul point de contact avec les données.
 * Aujourd’hui : renvoie les mocks. Demain : brancher le vrai back-end ne touche que ce fichier.
 */
import type {
  AnalysisProgress,
  AppKind,
  BlushAnswer,
  Fiche,
  FicheFact,
  FicheUpdate,
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
import { FICHE, FICHE_FINDINGS, QUICK_QUESTIONS, REPLY, SUBSCRIPTIONS, VOICE_ANSWER } from "@/mocks/daily";
import { QUESTION_ANSWER, QUESTION_IDEAS, REPORT, SOBER_REPORT } from "@/mocks/report";
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

/* Simulation : une question toute prête reçoit sa réponse ; une question libre, la réponse type */
const sameQuestion = (a: string, b: string) => {
  const norm = (q: string) => q.toLowerCase().replace(/[’']/g, "'").replace(/[\s\u00a0\u202f]+/g, " ").trim();
  return norm(a) === norm(b);
};
const answerTo = (question: string): QuestionAnswer => ({ ...(QUESTION_IDEAS.find((a) => sameQuestion(a.question, question)) ?? QUESTION_ANSWER), question });

/** Des idées de questions, tirées du rapport. */
export async function getQuestionIdeas(): Promise<string[]> {
  return QUESTION_IDEAS.map((a) => a.question);
}

export async function askQuestion(question: string): Promise<QuestionAnswer> {
  await delay(2000);
  mockServer.set({ questionAsked: question });
  return answerTo(question);
}

export async function getQuestion(): Promise<QuestionAnswer | null> {
  const q = mockServer.get().questionAsked;
  return q ? answerTo(q) : null;
}

/* ———— Au quotidien ———— */

export async function analyzeMessage(file: File | null): Promise<Reply> {
  void file;
  await delay(900);
  return REPLY;
}

/**
 * Le chat de l’accueil. Simulation : un texte qui finit par « ? » est une question pour BLUSH,
 * tout le reste (texte collé, captures, export) est lu comme sa réponse à elle.
 */
export type { BlushAnswer };

/** Les questions toutes prêtes du chat (celles que promet la landing). */
export async function getQuickQuestions(): Promise<string[]> {
  return QUICK_QUESTIONS.map((q) => q.question);
}

export async function sendToBlush(input: { text?: string; files?: File[] }): Promise<BlushAnswer> {
  void input.files;
  await delay(2000);
  const text = input.text?.trim();
  const quick = text ? QUICK_QUESTIONS.find((q) => sameQuestion(q.question, text)) : undefined;
  if (quick) return quick.answer;
  if (text && text.endsWith("?")) return { kind: "answer", answer: answerTo(text) };
  return { kind: "analysis", reply: REPLY };
}

/** Un vocal pour BLUSH. Simulation : en vrai, le back-end le transcrit, puis BLUSH répond à ce qui est dit. */
export async function sendVoiceToBlush(input: { audio: Blob; seconds: number }): Promise<BlushAnswer> {
  void input.audio;
  await delay(2200);
  return { kind: "answer", answer: VOICE_ANSWER };
}

/* ———— Sa fiche ———— */

export async function getFiche(): Promise<Fiche> {
  const s = mockServer.get();
  return { ...FICHE, facts: s.ficheFacts, updatedLabel: s.ficheUpdated ? "mise à jour aujourd’hui" : FICHE.updatedLabel };
}

export async function updateFiche(facts: FicheFact[]): Promise<Fiche> {
  mockServer.set({ ficheFacts: facts });
  await delay(250);
  return getFiche();
}

/**
 * Des captures ou un export pour sa fiche : BLUSH y trouve des infos sur elle et les range lui-même, dans la bonne rubrique.
 * Ce qu’il savait déjà n’est pas doublé (sa nouvelle source s’ajoute). Rien n’est cherché ailleurs.
 * Simulation : une capture donne sa bio Hinge, un export de nouveaux messages de votre conv.
 */
export async function addToFiche(files: File[]): Promise<FicheUpdate> {
  await delay(2200);
  const images = files.filter((f) => f.type.startsWith("image/")).length;
  const kinds = [...(images > 0 ? (["captures"] as const) : []), ...(images < files.length ? (["export"] as const) : [])];
  const facts = [...mockServer.get().ficheFacts];
  const added: FicheFact[] = [];
  const confirmed: FicheFact[] = [];
  for (const kind of kinds) {
    const found = FICHE_FINDINGS[kind];
    for (const f of found.facts) {
      const i = facts.findIndex((x) => x.section === f.section && x.text === f.text);
      if (i >= 0) {
        const same = facts[i];
        if (!same.sourceLabel.split(" · ").includes(found.sourceLabel))
          facts[i] = { ...same, sourceLabel: `${same.sourceLabel} · ${found.sourceLabel}`, sources: [...new Set([...same.sources, found.source])] };
        confirmed.push(facts[i]);
      } else {
        const fact: FicheFact = { id: `t${Date.now()}-${added.length}`, section: f.section, text: f.text, sourceLabel: found.sourceLabel, sources: [found.source] };
        facts.push(fact);
        added.push(fact);
      }
    }
  }
  mockServer.set({ ficheFacts: facts, ficheUpdated: true });
  return { fiche: await getFiche(), added, confirmed };
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
  mockServer.set({ storyDeleted: true, ficheFacts: FICHE.facts, ficheUpdated: false, questionAsked: null, analysisStartedAt: null });
}

/** Tout effacer : le compte et toutes les histoires. */
export async function deleteAccount(): Promise<void> {
  await delay(500);
  mockServer.reset();
}
