/*
 * La démo (le site de démo, la galerie des écrans) : ses données (les histoires, le vocal de démo, ce que trouve sa fiche),
 * son faux back-end (src/mocks/server.ts) et ses réponses, c’est-à-dire les branches démo de src/services/api.ts. api.ts
 * ne charge ce module qu’en mode démo, à la demande (import dynamique) : avec le back-end, ni les mocks ni l’état de démo
 * ne partent vers le navigateur.
 * Côté serveur, src/services/serveur.ts l’appelle directement, dans avecEtat : l’état n’y est posé que pendant la partie
 * synchrone de l’appel, donc chaque fonction le lit avant son premier await.
 */
import type { AnalysisProgress, AppKind, BlushAnswer, Fiche, FicheFact, FicheUpdate, Guess, LevelId, Plan, QuestionAnswer, Reply, Source, Story, Subscription } from "@/types";
import { SUBSCRIPTIONS } from "@/content/offres";
import { FICHE } from "@/mocks/daily";
import { delay, mockServer, RESTE_DANS_LE_NAVIGATEUR } from "@/mocks/server";
import { demoStory, DEMO_STORY_IDS, storyIdFor } from "@/mocks/stories";
import { SCREENSHOTS_RESULT, SOURCE_HINGE, SOURCE_INSTAGRAM, SOURCE_WHATSAPP } from "@/mocks/story";
import { chatVocalDemo, vocalDemo } from "@/mocks/vocal";
import { FICHE_FINDINGS } from "@/mocks/quotidien";
import type { Account, ReportPayload } from "./api";
import type { AvanceVideo, SuiviChat } from "./reel";
import { readStoryCookie, writeStoryCookie } from "./session";

/**
 * L’histoire ouverte. Dans le navigateur, elle vient du cookie de session ;
 * côté serveur, la page la lit (currentStoryId) et la passe en `storyId`.
 */
export const opened = (storyId?: string) => demoStory(storyId ?? readStoryCookie());

/* Durée simulée de la lecture (environ 6 s). */
const ANALYSIS_MS = 6000;

/* ———— Import ———— */

export async function uploadExport(file: File, app: AppKind): Promise<Source> {
  await delay(500);
  mockServer.set({ analysisStartedAt: null });
  return { ...SOURCE_WHATSAPP, app, fileName: file.name };
}

export async function uploadScreenshots(files: File[], opts: { app: AppKind; mode: "first" | "add" }): Promise<{ source: Source; messagesRead: number }> {
  await delay(500);
  const base = opts.app === "hinge" ? SOURCE_HINGE : SOURCE_INSTAGRAM;
  return {
    source: { ...base, app: opts.app, screenshotCount: files.length },
    messagesRead: opts.mode === "first" ? SCREENSHOTS_RESULT.messagesRead : base.messageCount,
  };
}

export async function uploadRecording(app: AppKind, onAvance?: (a: AvanceVideo) => void): Promise<{ source: Source; messagesRead: number }> {
  onAvance?.({ etape: "lecture", faits: 0, total: 1 });
  await delay(800);
  return { source: { ...SOURCE_INSTAGRAM, app, screenshotCount: 1 }, messagesRead: SCREENSHOTS_RESULT.messagesRead };
}

export async function getStory(storyId?: string): Promise<Story> {
  return opened(storyId).story;
}

/* ———— Compte et analyse ———— */

/** Simulation : rien ne part. */
export async function sendLoginCode(email: string): Promise<{ email: string }> {
  await delay(500);
  return { email };
}

/** Simulation : tout code à 6 chiffres passe, sauf 000000 (pour montrer l’erreur). */
export async function verifyLoginCode(code: string): Promise<{ ok: boolean }> {
  await delay(600);
  return { ok: /^\d{6}$/.test(code) && code !== "000000" };
}

export async function createAccount(email: string): Promise<{ email: string }> {
  await delay(400);
  mockServer.set({ email });
  return { email };
}

export async function startAnalysis(guess: Guess, opts: { restart?: boolean }): Promise<{ jobId: string }> {
  const s = mockServer.get();
  if (!s.analysisStartedAt || opts.restart) {
    mockServer.set({ analysisStartedAt: Date.now() });
    /* Simulation : la nouvelle analyse ouvre l’histoire qui correspond à ce que tu as dit (en couple, ou pas encore) */
    writeStoryCookie(storyIdFor(guess));
  }
  return { jobId: "job-001" };
}

export async function getAnalysisProgress(): Promise<AnalysisProgress> {
  const started = mockServer.get().analysisStartedAt ?? Date.now();
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const total = reduced ? 600 : ANALYSIS_MS;
  const t = Math.min(1, (Date.now() - started) / total);
  const ease = (x: number) => 1 - Math.pow(1 - x, 3);
  const { story, discoveries } = opened();
  return {
    progress: Math.min(1, t / 0.93),
    messagesRead: Math.round(story.totalMessages * ease(Math.min(1, t / 0.7))),
    stepsDone: [0.13, 0.33, 0.53, 0.77].filter((s) => t >= s).length,
    discoveries: discoveries.slice(0, [0.17, 0.33, 0.5].filter((s) => t >= s).length),
    done: t >= 1,
  };
}

/** Le rapport, avec les droits d’accès. Les chapitres non payés arrivent verrouillés, sans contenu. */
export async function getReport(storyId?: string): Promise<ReportPayload> {
  const s = mockServer.get();
  const { report, sober, story } = opened(storyId);
  const full = s.plan !== "gratuit";
  const chapters = report.chapters.map((c) => (c.free || full ? c : { ...c, locked: true, blocks: [] }));
  const difficult = s.verdict === "difficile";
  /* Le vocal : avec le rapport (ou sa version sobre, offerte), sur l’histoire des maquettes seulement */
  const vocal = (full || difficult) && story.id === DEMO_STORY_IDS.rencontre ? vocalDemo(difficult) : undefined;
  return {
    report: { ...report, chapters, verdict: { ...report.verdict, difficult } },
    sober: difficult ? sober : null,
    access: s.plan,
    ...(vocal ? { vocal } : {}),
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
const answerTo = (question: string, storyId?: string): QuestionAnswer => {
  const { questionIdeas, questionAnswer } = opened(storyId);
  return { ...(questionIdeas.find((a) => sameQuestion(a.question, question)) ?? questionAnswer), question };
};

export async function getQuestionIdeas(storyId?: string): Promise<string[]> {
  return opened(storyId).questionIdeas.map((a) => a.question);
}

export async function askQuestion(question: string): Promise<QuestionAnswer> {
  await delay(2000);
  const idee = opened().questionIdeas.findIndex((a) => sameQuestion(a.question, question));
  mockServer.set({ questionAsked: question, questionIdee: idee >= 0 ? idee : null });
  return answerTo(question);
}

export async function getQuestion(storyId?: string): Promise<QuestionAnswer | null> {
  const { questionAsked, questionIdee } = mockServer.get();
  if (!questionAsked) return null;
  /* Côté serveur, sa question est restée dans le navigateur : le cookie donne le rang de l’idée choisie, si c’en est une */
  const idee = questionAsked === RESTE_DANS_LE_NAVIGATEUR && questionIdee !== null ? opened(storyId).questionIdeas[questionIdee] : undefined;
  return answerTo(idee?.question ?? questionAsked, storyId);
}

/* ———— Au quotidien ———— */

export async function analyzeMessage(): Promise<Reply> {
  await delay(900);
  return opened().reply;
}

export async function getQuickQuestions(storyId?: string): Promise<string[]> {
  return opened(storyId).quickQuestions.map((q) => q.question);
}

/** Le cran suivant de chaque échelle (les étapes, ou la température en couple). */
const NEXT_LEVEL: Partial<Record<LevelId, LevelId>> = { parle: "voit", voit: "dit", dit: "ensemble", eloigne: "coince", coince: "va", va: "soudes" };

/**
 * Simulation : un texte qui finit par « ? » est une question pour BLUSH, tout le reste (texte collé, captures, export) est
 * lu comme sa réponse à elle. Un message qui annonce un cap (« on est ensemble », « en couple », « je t’aime »…) vous fait
 * passer au niveau suivant.
 * ⚠ Textes du passage de niveau absents des maquettes : à valider.
 */
export async function sendToBlush(text: string | undefined, suivi?: SuiviChat): Promise<BlushAnswer> {
  return auFil(reponseDemo(text), 2000, suivi);
}

/**
 * La réponse arrive comme du back-end, en `ms` environ. Des bulles : une à une, puis la réponse entière. Un vocal : la
 * réponse d’abord, sa bulle vocale attend encore un instant. Sans `suivi`, ou une autre réponse : d’un bloc.
 */
async function auFil(r: BlushAnswer, ms: number, suivi?: SuiviChat): Promise<BlushAnswer> {
  if (!suivi || r.kind !== "bubbles") {
    await delay(ms);
    return r;
  }
  if (r.vocal) {
    await delay(ms);
    const dire = suivi.vocal;
    if (!dire) return r;
    const { vocal, ...ecrite } = r;
    void delay(1500).then(() => dire(vocal));
    return { ...ecrite, vocalEnCours: true };
  }
  await delay(ms * 0.6);
  for (let k = 1; k <= r.bubbles.length; k++) {
    suivi.bulles?.(r.bubbles.slice(0, k));
    await delay(ms * 0.2);
  }
  return r;
}

/** La réponse à un message (voir sendToBlush). */
function reponseDemo(text: string | undefined): BlushAnswer {
  const { quickQuestions, reply, report } = opened();
  const quick = text ? quickQuestions.find((q) => sameQuestion(q.question, text)) : undefined;
  if (quick) return quick.answer;
  /* Le chat en vocal : « parle-moi en vocal » le lance, « écris-moi » le coupe */
  if (text && /vocal/i.test(text) && /parle|envoie|réponds|reponds/i.test(text))
    return { kind: "bubbles", bubbles: [{ text: "ok chef, je passe en vocal" }, { text: "mais tu m’écoutes jusqu’au bout hein" }], vocal: chatVocalDemo("mode"), modeVocal: true };
  if (text && /[ée]cris[- ]moi|à l[’']écrit|a l[’']ecrit/i.test(text)) return { kind: "bubbles", bubbles: [{ text: "ok, je repasse à l’écrit" }], modeVocal: false };
  const levelUp = NEXT_LEVEL[report.level];
  if (text && levelUp && /ensemble|en couple|officiel|je t[’']aime|soud[ée]s/i.test(text))
    return {
      kind: "answer",
      levelUp,
      answer: {
        question: text,
        title: "Vous passez un cap.",
        evidenceLabel: "Ce qui change",
        evidence: "Ce qu’elle vient de te dire, elle ne l’avait jamais dit. Vous changez de niveau.",
        confidence: "probable",
        limits: "Je me fie à ce que tu me racontes : envoie-moi la capture pour que j’en sois sûr.",
      },
    };
  if (text && text.endsWith("?")) return { kind: "answer", answer: answerTo(text) };
  return { kind: "analysis", reply };
}

/** Un vocal pour BLUSH. Simulation : en vrai, le back-end le transcrit, puis BLUSH répond à ce qui est dit. */
export async function sendVoiceToBlush(suivi?: SuiviChat): Promise<BlushAnswer> {
  /* Tu lui parles en vocal, elle te répond en vocal (sur l’histoire des maquettes ; les autres gardent leur réponse écrite) */
  const { story, voiceAnswer } = opened();
  if (story.id !== DEMO_STORY_IDS.rencontre) return auFil({ kind: "answer", answer: voiceAnswer }, 2600, suivi);
  const reponse: BlushAnswer = {
    kind: "bubbles",
    bubbles: [
      { text: "attends, elle t’a écrit ça", messages: [{ from: "elle", text: "je suis crevée cette semaine, on verra", caption: "Sophie · son dernier message" }] },
      { text: "et toi t’as cru que c’était mort, avoue" },
      { text: "en vrai elle est partante, juste fatiguée" },
    ],
    send: ["courage pour jeudi. samedi pour fêter ça ?"],
    vocal: chatVocalDemo("chat"),
  };
  return auFil(reponse, 2600, suivi);
}

/* ———— Sa fiche ———— */

export async function getFiche(storyId?: string): Promise<Fiche> {
  const s = mockServer.get();
  return { ...FICHE, ...opened(storyId).fiche, facts: s.ficheFacts, updatedLabel: s.ficheUpdated ? "mise à jour aujourd’hui" : FICHE.updatedLabel };
}

export async function updateFiche(facts: FicheFact[]): Promise<Fiche> {
  mockServer.set({ ficheFacts: facts });
  await delay(250);
  return getFiche();
}

/** Simulation : une capture donne sa bio Hinge, un export de nouveaux messages de votre conv. */
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

/** Le lien « demo » : pas de vrai lien, ni de verdict masqué par le serveur, ni de version d’image. */
export async function creerLienPartage(): Promise<{ id: string; verdict: null; v?: string }> {
  await delay(300);
  return { id: "demo", verdict: null };
}

export async function desactiverLienPartage(): Promise<void> {
  await delay(300);
}

export async function deleteStory(): Promise<void> {
  await delay(500);
  mockServer.set({ storyDeleted: true, ficheFacts: FICHE.facts, ficheUpdated: false, questionAsked: null, questionIdee: null, analysisStartedAt: null });
}

export async function deleteAccount(): Promise<void> {
  await delay(500);
  mockServer.reset();
  writeStoryCookie(null);
}
