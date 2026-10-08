/**
 * Couche de service BLUSH — le seul point de contact avec les données.
 * Avec NEXT_PUBLIC_BLUSH_BACKEND=1, chaque fonction branchée appelle le vrai back-end (reel.ts) ;
 * sinon, elle renvoie les mocks (le site de démo, la galerie). Les pages serveur passent par serveur.ts.
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
  LevelId,
  Plan,
  QuestionAnswer,
  Reply,
  Report,
  SoberReport,
  Source,
  Story,
  Subscription,
  VocalRapport,
} from "@/types";
import { FICHE, FICHE_FINDINGS, SUBSCRIPTIONS } from "@/mocks/daily";
import { SCREENSHOTS_RESULT, SOURCE_HINGE, SOURCE_INSTAGRAM, SOURCE_WHATSAPP } from "@/mocks/story";
import { DEMO_STORY_IDS, demoStory, storyIdFor } from "@/mocks/stories";
import { chatVocalDemo, vocalDemo } from "@/mocks/vocal";
import { delay, mockServer } from "@/mocks/server";
import { BACKEND } from "./mode";
import type { ConvInstagram } from "./preparer-export";
import { ErreurApi, reel, type AvanceVideo, type HistoriqueChat } from "./reel";
import { readStoryCookie, writeStoryCookie } from "./session";

export type Account = {
  email: string | null;
  subscription: Subscription;
  storyDeleted: boolean;
};

/** Un chapitre pendant l’écriture du rapport : en attente, en train de s’écrire, ou prêt. */
export type EtatChapitre = "attente" | "en_cours" | "ecrit";
/** Pendant que le rapport s’écrit (back-end) : la vraie avancée, lue sur ce que le modèle écrit. */
export type EcritureRapport = {
  etape: "plan" | "chapitres";
  /** De 0 à 1 : le plan jusqu’à 0,3, puis les chapitres. */
  progres: number;
  chapitres: { number: number; title: string; etat: EtatChapitre }[];
  /** Le temps qui reste, estimé (« 1 min »), ou null tant qu’on ne sait pas. */
  restant: string | null;
};

export type ReportPayload = {
  report: Report;
  /** Présent quand le verdict est dur : le rapport bascule en mode sobre. */
  sober: SoberReport | null;
  access: Plan;
  /** Back-end : le rapport s’écrit encore (accès débloqué, pas fini). Le front repasse dans quelques secondes. */
  generating?: boolean;
  /** Pendant l’écriture : où en est BLUSH, chapitre par chapitre. */
  ecriture?: EcritureRapport;
  /** Le vocal de BLUSH, en haut du rapport : prêt, ou en train de s’enregistrer. */
  vocal?: VocalRapport;
};

/* Durée simulée de la lecture (environ 6 s). */
const ANALYSIS_MS = 6000;

/**
 * L’histoire ouverte. Dans le navigateur, elle vient du cookie de session ;
 * côté serveur, la page la lit (currentStoryId) et la passe en `storyId`.
 */
const opened = (storyId?: string) => demoStory(storyId ?? readStoryCookie());

/* ———— Import ———— */

export async function uploadExport(
  file: File,
  app: Extract<AppKind, "whatsapp" | "imessage" | "instagram">,
  /** Un export Instagram complet : de quoi faire choisir la conv (voir src/services/reel.ts). */
  choisir?: (convs: ConvInstagram[]) => Promise<string | null>,
): Promise<Source> {
  if (BACKEND) return reel.uploadExport(file, choisir);
  await delay(500);
  mockServer.set({ analysisStartedAt: null });
  return { ...SOURCE_WHATSAPP, app, fileName: file.name };
}

export async function uploadScreenshots(
  files: File[],
  opts: { app: AppKind; mode: "first" | "add" },
): Promise<{ source: Source; messagesRead: number }> {
  if (BACKEND) return reel.uploadScreenshots(files, opts);
  await delay(500);
  const base = opts.app === "hinge" ? SOURCE_HINGE : SOURCE_INSTAGRAM;
  return {
    source: { ...base, app: opts.app, screenshotCount: files.length },
    messagesRead: opts.mode === "first" ? SCREENSHOTS_RESULT.messagesRead : base.messageCount,
  };
}

/** Un enregistrement d’écran de la conv (sa première importation) : ses écrans sont tirés dans le navigateur, puis lus. */
export async function uploadRecording(file: File, app: AppKind, onAvance?: (a: AvanceVideo) => void): Promise<{ source: Source; messagesRead: number }> {
  if (BACKEND) return reel.uploadRecording(file, app, onAvance);
  onAvance?.({ etape: "lecture", faits: 0, total: 1 });
  await delay(800);
  return { source: { ...SOURCE_INSTAGRAM, app, screenshotCount: 1 }, messagesRead: SCREENSHOTS_RESULT.messagesRead };
}

export async function getStory(storyId?: string): Promise<Story> {
  if (BACKEND) return reel.getStory();
  return opened(storyId).story;
}

/* ———— Compte et analyse ———— */

/** Envoie le code à 6 chiffres par email (simulation : rien ne part). */
export async function sendLoginCode(email: string): Promise<{ email: string }> {
  if (BACKEND) return reel.sendLoginCode(email);
  await delay(500);
  return { email };
}

/** Vérifie le code reçu. Simulation : tout code à 6 chiffres passe, sauf 000000 (pour montrer l’erreur). */
export async function verifyLoginCode(email: string, code: string): Promise<{ ok: boolean }> {
  if (BACKEND) return reel.verifyLoginCode(email, code);
  void email;
  await delay(600);
  return { ok: /^\d{6}$/.test(code) && code !== "000000" };
}

/** Crée le compte sans mot de passe. */
export async function createAccount(email: string): Promise<{ email: string }> {
  /* Back-end : le compte est créé par la vérification du code */
  if (BACKEND) return { email };
  await delay(400);
  mockServer.set({ email });
  return { email };
}

export async function startAnalysis(
  input: { me: string; guess: Guess; goal: Goal; pronom?: "il" | "elle" | null; prenom?: string | null },
  opts: { restart?: boolean } = {},
): Promise<{ jobId: string }> {
  if (BACKEND) return reel.startAnalysis({ me: input.me, guess: input.guess, goal: input.goal, pronom: input.pronom ?? "il", ...(input.prenom ? { prenom: input.prenom } : {}) });
  const s = mockServer.get();
  if (!s.analysisStartedAt || opts.restart) {
    mockServer.set({ analysisStartedAt: Date.now() });
    /* Simulation : la nouvelle analyse ouvre l’histoire qui correspond à ce que tu as dit (en couple, ou pas encore) */
    writeStoryCookie(storyIdFor(input.guess));
  }
  return { jobId: "job-001" };
}

export async function getAnalysisProgress(jobId: string): Promise<AnalysisProgress> {
  if (BACKEND) return reel.getAnalysisProgress();
  void jobId;
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
  if (BACKEND) return reel.getReport();
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

/** Le chat de nouveau à l’écrit (« Repasser à l’écrit »). En démo, rien à garder. */
export function modeVocalChat(actif: boolean): void {
  if (BACKEND) void reel.modeVocal(actif);
}

/** Un moment de l’écoute du vocal, pour comparer les deux voix (A/B test). En démo, rien n’est noté. */
export function noterEcouteVocal(evenement: "debut" | "fin" | "reecoute" | "ferme", position: number): void {
  if (BACKEND) void reel.ecouteVocal(evenement, position);
}

/** Simule le paiement. */
export async function unlock(offer: Exclude<Plan, "gratuit">): Promise<Subscription> {
  if (BACKEND) return reel.unlock(offer);
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
const answerTo = (question: string): QuestionAnswer => {
  const { questionIdeas, questionAnswer } = opened();
  return { ...(questionIdeas.find((a) => sameQuestion(a.question, question)) ?? questionAnswer), question };
};

/** Des idées de questions, tirées du rapport. */
export async function getQuestionIdeas(storyId?: string): Promise<string[]> {
  return opened(storyId).questionIdeas.map((a) => a.question);
}

export async function askQuestion(question: string): Promise<QuestionAnswer> {
  if (BACKEND) return enQuestion(question, await envoyerAuChat(() => reel.sendToBlush(question)));
  await delay(2000);
  mockServer.set({ questionAsked: question });
  return answerTo(question);
}

export async function getQuestion(): Promise<QuestionAnswer | null> {
  /* Back-end : la question passe par le chat, son historique est sur l’accueil */
  if (BACKEND) return null;
  const q = mockServer.get().questionAsked;
  return q ? answerTo(q) : null;
}

/* ———— Au quotidien ———— */

export async function analyzeMessage(file: File | null): Promise<Reply> {
  void file;
  await delay(900);
  return opened().reply;
}

/**
 * Le chat de l’accueil. Simulation : un texte qui finit par « ? » est une question pour BLUSH,
 * tout le reste (texte collé, captures, export) est lu comme sa réponse à elle.
 */
export type { BlushAnswer };
export type { AvanceVideo, HistoriqueChat };

/** L’historique du chat (back-end) : les derniers échanges, ou ceux d’avant `avant`. En démo, il n’y en a pas. */
export async function getChatHistory(avant?: number): Promise<HistoriqueChat> {
  if (BACKEND) return reel.historiqueChat(avant);
  return { echanges: [], plus: false };
}

/** Les questions toutes prêtes du chat (celles que promet la landing). */
export async function getQuickQuestions(storyId?: string): Promise<string[]> {
  return opened(storyId).quickQuestions.map((q) => q.question);
}

/** Le cran suivant de chaque échelle (les étapes, ou la température en couple). */
const NEXT_LEVEL: Partial<Record<LevelId, LevelId>> = { parle: "voit", voit: "dit", dit: "ensemble", eloigne: "coince", coince: "va", va: "soudes" };

/**
 * `about` : le point d’une réponse de BLUSH que tu creuses (tu l’as glissée vers la droite) ; ta question porte dessus.
 * Simulation : un message qui annonce un cap (« on est ensemble », « en couple », « je t’aime »…) vous fait passer au niveau suivant.
 * ⚠ Textes du passage de niveau absents des maquettes : à valider.
 */
export async function sendToBlush(input: { text?: string; files?: File[]; about?: string }): Promise<BlushAnswer> {
  if (BACKEND) {
    if (input.files?.length) return envoyerAuChat(() => reel.sendFilesToBlush(input.files!, input.text?.trim()));
    const texte = input.text?.trim();
    if (!texte) return bulle("j’ai rien reçu, renvoie-moi ça");
    return envoyerAuChat(() => reel.sendToBlush(input.about ? `(à propos de « ${input.about} ») ${texte}` : texte));
  }
  void input.files;
  void input.about;
  await delay(2000);
  const text = input.text?.trim();
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
export async function sendVoiceToBlush(input: { audio: Blob; seconds: number }): Promise<BlushAnswer> {
  if (BACKEND) return envoyerAuChat(() => reel.sendVoiceToBlush(input.audio));
  void input.audio;
  await delay(2600);
  /* Tu lui parles en vocal, elle te répond en vocal (sur l’histoire des maquettes ; les autres gardent leur réponse écrite) */
  const { story, voiceAnswer } = opened();
  if (story.id !== DEMO_STORY_IDS.rencontre) return { kind: "answer", answer: voiceAnswer };
  return {
    kind: "bubbles",
    bubbles: [
      { text: "attends, elle t’a écrit ça", messages: [{ from: "elle", text: "je suis crevée cette semaine, on verra", caption: "Sophie · son dernier message" }] },
      { text: "et toi t’as cru que c’était mort, avoue" },
      { text: "en vrai elle est partante, juste fatiguée" },
    ],
    send: ["courage pour jeudi. samedi pour fêter ça ?"],
    vocal: chatVocalDemo("chat"),
  };
}

/* Back-end : une réponse de BLUSH en une ou quelques bulles (une erreur dite simplement) */
const bulle = (texte: string | string[]): BlushAnswer => ({ kind: "bubbles", bubbles: [texte].flat().map((text) => ({ text })) });

/* Les erreurs du chat (captures, export, vocal), dans la voix de BLUSH : une idée par bulle */
const ERREURS_CHAT: Record<string, string | string[]> = {
  trop: "tu m’as fait parler toute la journée 😮‍💨 on reprend demain ?",
  pas_pret: "je finis d’écrire ton rapport, repasse dans deux minutes",
  acces: "le chat avec moi, c’est dans BLUSH+",
  capture: ["j’arrive pas à lire tes captures", "renvoie-les en entier, sans les rogner"],
  fichier: ["j’arrive pas à ouvrir ce fichier", "envoie-moi l’export de votre conv : le .zip WhatsApp, ou le message_1.html d’Instagram"],
  autre_conv: "c’est pas votre conv ça 👀 envoie-moi l’export de la vôtre",
  rien_de_neuf: "ça, je l’ai déjà 😌 rien de nouveau depuis la dernière fois",
  vocal_bientot: ["les vocaux, ça arrive très vite", "écris-moi en attendant, je te réponds pareil"],
  vocal_vide: "j’ai rien entendu dans ton vocal, tu me le renvoies ?",
  vocal: "ton vocal est trop long, même pour moi 😭 fais-moi la version courte",
  transcription: "j’arrive pas à écouter ton vocal là, écris-moi",
};

async function envoyerAuChat(envoyer: () => Promise<BlushAnswer>): Promise<BlushAnswer> {
  try {
    return await envoyer();
  } catch (e) {
    const code = e instanceof ErreurApi ? e.code : "";
    /* Un refus de l’IA (malgré le repli sur un autre modèle) : on le dit, sans parler de bug */
    if (code.startsWith("refus")) return bulle(["là-dessus je peux pas t’aider", "reformule, ou envoie-moi autre chose"]);
    return bulle(ERREURS_CHAT[code] ?? "j’ai eu un bug, renvoie-moi ça");
  }
}

/** La question du rapport, posée au chat : sa première bulle devient le titre, les autres la preuve. */
function enQuestion(question: string, r: BlushAnswer): QuestionAnswer {
  const bulles = r.kind === "bubbles" ? r.bubbles : [];
  const message = bulles.flatMap((b) => b.messages ?? [])[0];
  return {
    question,
    title: bulles[0]?.text ?? "",
    evidenceLabel: "Ce que je vois",
    evidence: bulles.slice(1).map((b) => b.text).join(" · "),
    ...(message ? { message } : {}),
    confidence: "probable",
    limits: r.kind === "bubbles" && r.ask ? r.ask : "",
  };
}

/* ———— Sa fiche ———— */

export async function getFiche(storyId?: string): Promise<Fiche> {
  if (BACKEND) return reel.getFiche();
  const s = mockServer.get();
  return { ...FICHE, ...opened(storyId).fiche, facts: s.ficheFacts, updatedLabel: s.ficheUpdated ? "mise à jour aujourd’hui" : FICHE.updatedLabel };
}

export async function updateFiche(facts: FicheFact[]): Promise<Fiche> {
  if (BACKEND) return reel.updateFiche(facts);
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
  /* Rien de lisible, ou une erreur : la fiche reste comme avant, et l’écran dit pourquoi (« rien de neuf » n’est pas une erreur) */
  if (BACKEND)
    return reel.addToFiche(files).catch(async (e: unknown) => {
      const code = e instanceof ErreurApi ? e.code : "";
      const problem = code === "rien_de_neuf" ? undefined : code === "capture" || code === "fichier" || code === "autre_conv" || code === "trop" ? code : "bug";
      return { fiche: await reel.getFiche(), added: [], confirmed: [], ...(problem ? { problem } : {}) };
    });
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
  if (BACKEND) return reel.getAccount();
  const s = mockServer.get();
  const sub = SUBSCRIPTIONS[s.plan];
  return {
    email: s.email,
    subscription: { ...sub, paused: s.paused, active: sub.active && !s.cancelled },
    storyDeleted: s.storyDeleted,
  };
}

export async function setPaused(paused: boolean): Promise<void> {
  if (BACKEND) return void (await reel.setPaused(paused));
  await delay(200);
  mockServer.set({ paused });
}

export async function cancelSubscription(): Promise<void> {
  /* Back-end v1 : pas de paiement, donc rien à résilier */
  if (BACKEND) return;
  await delay(500);
  mockServer.set({ cancelled: true });
}

/**
 * Le lien public du verdict (/v/<id>) : le verdict seul, prénoms masqués, jamais la conv. Toujours le même lien
 * tant qu’on ne le désactive pas. En démo : le lien « demo ».
 */
export async function creerLienPartage(): Promise<string> {
  const id = BACKEND ? await reel.creerLienPartage() : (await delay(300), "demo");
  return `${window.location.origin}/v/${id}`;
}

/** Ce qu’on partage en image : une réponse de BLUSH (son échange), ou la chute d’un chapitre (sa place). */
export type CibleImage = { type: "reponse"; echange: number } | { type: "moment"; chapitre: number; bloc: number };

/** L’image « Partager en image » (story), dessinée par le serveur d’après le contenu du compte. En démo : un exemple. */
export async function imagePartage(cible: CibleImage): Promise<Blob> {
  const r = BACKEND
    ? await fetch("/api/partage/image", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cible), credentials: "same-origin" })
    : await fetch(`/apercu/carte?type=${cible.type}`);
  if (!r.ok) throw new ErreurApi("image", r.status);
  return r.blob();
}

export async function desactiverLienPartage(): Promise<void> {
  if (BACKEND) return reel.desactiverLienPartage();
  await delay(300);
}

/** Supprime l’histoire : le rapport, la fiche et les captures. */
export async function deleteStory(): Promise<void> {
  if (BACKEND) return void (await reel.deleteStory());
  await delay(500);
  mockServer.set({ storyDeleted: true, ficheFacts: FICHE.facts, ficheUpdated: false, questionAsked: null, analysisStartedAt: null });
}

/** Ouvre une autre conv du compte : l’accueil s’ouvre sur elle, maintenant et les fois suivantes (sur cet appareil). */
export function openConv(storyId: string) {
  writeStoryCookie(storyId);
}

/** Tout effacer : le compte et toutes les histoires. */
export async function deleteAccount(): Promise<void> {
  if (BACKEND) return void (await reel.deleteAccount());
  await delay(500);
  mockServer.reset();
  writeStoryCookie(null);
}
