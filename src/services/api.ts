/**
 * Couche de service BLUSH — le seul point de contact avec les données.
 * Avec NEXT_PUBLIC_BLUSH_BACKEND=1, chaque fonction branchée appelle le vrai back-end (reel.ts) ;
 * sinon, elle renvoie les mocks (le site de démo, la galerie). Les pages serveur passent par serveur.ts.
 * Les branches démo vivent dans ./demo, chargé à la demande : avec le back-end, ni les données de démo ni son faux
 * back-end (mockServer) ne sont jamais chargés. Côté serveur, serveur.ts appelle ./demo directement (voir avecEtat).
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
  VocalRapport,
} from "@/types";
import { BACKEND } from "./mode";
import type { ConvInstagram } from "./preparer-export";
import { avecConv, CoupureChat, ErreurApi, reel, type AvanceVideo, type HistoriqueChat, type SuiviChat } from "./reel";
import { writeStoryCookie } from "./session";

const demo = () => import("./demo");

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
  /** Back-end : l’écriture a échoué pour de bon (la panne : on peut la relancer ; le refus du modèle : rien à relancer). */
  echec?: "panne" | "refus";
};

/* ———— Import ———— */

export async function uploadExport(
  file: File,
  app: Extract<AppKind, "whatsapp" | "imessage" | "instagram">,
  /** Un export Instagram complet : de quoi faire choisir la conv (voir src/services/reel.ts). */
  choisir?: (convs: ConvInstagram[]) => Promise<string | null>,
  /** Un export Instagram complet : où en est le tour de ses convs (de 0 à 1). */
  onAvance?: (part: number) => void,
): Promise<Source> {
  if (BACKEND) return reel.uploadExport(file, choisir, onAvance);
  return (await demo()).uploadExport(file, app);
}

export async function uploadScreenshots(
  files: File[],
  opts: { app: AppKind; mode: "first" | "add"; onAvance?: (a: AvanceVideo) => void },
): Promise<{ source: Source; messagesRead: number }> {
  if (BACKEND) return reel.uploadScreenshots(files, opts);
  return (await demo()).uploadScreenshots(files, opts);
}

/** Un enregistrement d’écran de la conv (sa première importation) : ses écrans sont tirés dans le navigateur, puis lus. */
export async function uploadRecording(file: File, app: AppKind, onAvance?: (a: AvanceVideo) => void): Promise<{ source: Source; messagesRead: number }> {
  if (BACKEND) return reel.uploadRecording(file, app, onAvance);
  return (await demo()).uploadRecording(app, onAvance);
}

export async function getStory(storyId?: string): Promise<Story> {
  if (BACKEND) return reel.getStory();
  return (await demo()).getStory(storyId);
}

/* ———— Compte et analyse ———— */

/** Envoie le code à 6 chiffres par email (simulation : rien ne part). */
export async function sendLoginCode(email: string): Promise<{ email: string }> {
  if (BACKEND) return reel.sendLoginCode(email);
  return (await demo()).sendLoginCode(email);
}

/** Vérifie le code reçu. Simulation : tout code à 6 chiffres passe, sauf 000000 (pour montrer l’erreur). */
export async function verifyLoginCode(email: string, code: string): Promise<{ ok: boolean }> {
  if (BACKEND) return reel.verifyLoginCode(email, code);
  return (await demo()).verifyLoginCode(code);
}

/** Crée le compte sans mot de passe. */
export async function createAccount(email: string): Promise<{ email: string }> {
  /* Back-end : le compte est créé par la vérification du code */
  if (BACKEND) return { email };
  return (await demo()).createAccount(email);
}

export async function startAnalysis(
  input: { me: string; guess: Guess; goal: Goal; pronom?: "il" | "elle" | null; prenom?: string | null },
  opts: { restart?: boolean } = {},
): Promise<{ jobId: string }> {
  if (BACKEND) return reel.startAnalysis({ me: input.me, guess: input.guess, goal: input.goal, pronom: input.pronom ?? "il", ...(input.prenom ? { prenom: input.prenom } : {}) });
  return (await demo()).startAnalysis(input.guess, opts);
}

/**
 * L’écran de lecture : la lecture de la conv ouverte, lancée depuis « Qui es-tu ? » ou à relancer. Avec le back-end, le
 * parcours du navigateur ne part pas : « Qui es-tu ? » est en base (sinon, erreur « qui »), et des réponses d’une autre
 * fois ne lancent pas une autre conv. Démo : comme startAnalysis.
 */
export async function resumeAnalysis(input: Parameters<typeof startAnalysis>[0], opts: { restart?: boolean } = {}): Promise<{ jobId: string }> {
  return BACKEND ? reel.resumeAnalysis() : startAnalysis(input, opts);
}

export async function getAnalysisProgress(jobId: string): Promise<AnalysisProgress> {
  if (BACKEND) return reel.getAnalysisProgress();
  void jobId;
  return (await demo()).getAnalysisProgress();
}

/** Le rapport, avec les droits d’accès. Les chapitres non payés arrivent verrouillés, sans contenu. */
export async function getReport(storyId?: string): Promise<ReportPayload> {
  if (BACKEND) return reel.getReport();
  return (await demo()).getReport(storyId);
}

/** Le chat de nouveau à l’écrit (« Repasser à l’écrit »). En démo, rien à garder. */
/** Back-end : relance l’écriture d’un rapport en échec. La démo n’échoue jamais : le rapport tel quel. */
export async function relancerRapport(): Promise<ReportPayload> {
  if (BACKEND) return reel.relancerRapport();
  return getReport();
}

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
  return (await demo()).unlock(offer);
}

/* ———— Question incluse ———— */

/** Des idées de questions, tirées du rapport. */
export async function getQuestionIdeas(storyId?: string): Promise<string[]> {
  return (await demo()).getQuestionIdeas(storyId);
}

/**
 * La question du rapport. Back-end : elle passe par le chat ; une erreur (le rapport s’écrit encore, plus de réseau)
 * remonte telle quelle, pour que l’écran garde la question et le dise (voir souciQuestion), au lieu d’en faire une réponse.
 */
export async function askQuestion(question: string): Promise<QuestionAnswer> {
  if (BACKEND) return enQuestion(question, await reel.sendToBlush(question));
  return (await demo()).askQuestion(question);
}

export async function getQuestion(): Promise<QuestionAnswer | null> {
  /* Back-end : la question passe par le chat, son historique est sur l’accueil */
  if (BACKEND) return null;
  return (await demo()).getQuestion();
}

/* ———— Au quotidien ———— */

export async function analyzeMessage(file: File | null): Promise<Reply> {
  void file;
  return (await demo()).analyzeMessage();
}

/**
 * Le chat de l’accueil. Simulation : un texte qui finit par « ? » est une question pour BLUSH,
 * tout le reste (texte collé, captures, export) est lu comme sa réponse à elle.
 */
export type { BlushAnswer };
export type { AvanceVideo, HistoriqueChat, SuiviChat };
export { CoupureChat };

/** L’historique du chat (back-end) : les derniers échanges, ou ceux d’avant `avant`. En démo, il n’y en a pas. */
export async function getChatHistory(avant?: number): Promise<HistoriqueChat> {
  if (BACKEND) return reel.historiqueChat(avant);
  return { echanges: [], plus: false };
}

/** Les questions toutes prêtes du chat (celles que promet la landing). */
export async function getQuickQuestions(storyId?: string): Promise<string[]> {
  return (await demo()).getQuickQuestions(storyId);
}

/**
 * `about` : le point d’une réponse de BLUSH que tu creuses (tu l’as glissée vers la droite) ; ta question porte dessus.
 * Démo : la réponse arrive comme du back-end (voir ./demo).
 */
export async function sendToBlush(input: { text?: string; files?: File[]; about?: string }, suivi?: SuiviChat): Promise<BlushAnswer> {
  if (BACKEND) {
    if (input.files?.length) return envoyerAuChat(() => reel.sendFilesToBlush(input.files!, input.text?.trim(), suivi));
    const texte = input.text?.trim();
    if (!texte) return bulle("j’ai rien reçu, renvoie-moi ça");
    return envoyerAuChat(() => reel.sendToBlush(input.about ? `(à propos de « ${input.about} ») ${texte}` : texte, suivi));
  }
  return (await demo()).sendToBlush(input.text?.trim(), suivi);
}

/** Un vocal pour BLUSH. Simulation : en vrai, le back-end le transcrit, puis BLUSH répond à ce qui est dit. */
export async function sendVoiceToBlush(input: { audio: Blob; seconds: number }, suivi?: SuiviChat): Promise<BlushAnswer> {
  if (BACKEND) return envoyerAuChat(() => reel.sendVoiceToBlush(input.audio, suivi));
  return (await demo()).sendVoiceToBlush(suivi);
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

/** Pourquoi une question n’a pas pu partir, dit par BLUSH, en une phrase (le code d’erreur du serveur). */
export function souciQuestion(e: unknown): string {
  const code = e instanceof ErreurApi ? e.code : "";
  if (code.startsWith("refus")) return "là-dessus je peux pas t’aider, reformule ta question";
  const m = ERREURS_CHAT[code];
  return m ? (Array.isArray(m) ? m.join(", ") : m) : "j’ai eu un bug, renvoie-moi ta question";
}

async function envoyerAuChat(envoyer: () => Promise<BlushAnswer>): Promise<BlushAnswer> {
  try {
    return await envoyer();
  } catch (e) {
    /* Le réseau a coupé en route : l’accueil garde les bulles reçues et propose de réessayer */
    if (e instanceof CoupureChat) throw e;
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
  return (await demo()).getFiche(storyId);
}

export async function updateFiche(facts: FicheFact[]): Promise<Fiche> {
  if (BACKEND) return reel.updateFiche(facts);
  return (await demo()).updateFiche(facts);
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
  return (await demo()).addToFiche(files);
}

/* ———— Compte ———— */

export async function getAccount(): Promise<Account> {
  if (BACKEND) return reel.getAccount();
  return (await demo()).getAccount();
}

export async function setPaused(paused: boolean): Promise<void> {
  if (BACKEND) return void (await reel.setPaused(paused));
  return (await demo()).setPaused(paused);
}

export async function cancelSubscription(): Promise<void> {
  /* Back-end v1 : pas de paiement, donc rien à résilier */
  if (BACKEND) return;
  return (await demo()).cancelSubscription();
}

/**
 * Le lien public du verdict (/v/<id>) : le verdict seul, le prénom de l’autre masqué, jamais la conv. Toujours le même lien
 * tant qu’on ne le désactive pas. En démo : le lien « demo ».
 */
export async function creerLienPartage(): Promise<{ url: string; verdict: VerdictMontre | null; story?: string }> {
  const { id, verdict, v } = BACKEND
    ? ((await reel.creerLienPartage()) as { id: string; verdict: VerdictMontre | null; v?: string })
    : await (await demo()).creerLienPartage();
  const url = `${window.location.origin}/v/${id}`;
  /* `story` : l’image story à sa version (`v`, donnée par le serveur), que le CDN garde : la feuille l’a tout de suite */
  return { url, verdict, story: `${url}/image?format=story${v ? `&v=${encodeURIComponent(v)}` : ""}` };
}

/** Le verdict tel que le montre un lien partagé : le prénom de l’autre en initiale, le tien en clair (« C. t’attend, Hugo »). */
export type VerdictMontre = { emoji: string; title: string };

/** Ce qu’on partage en image : une réponse de BLUSH (son échange), ou la chute d’un chapitre (sa place). */
export type CibleImage = { type: "reponse"; echange: number } | { type: "moment"; chapitre: number; bloc: number };

/** L’image « Partager en image » (story), dessinée par le serveur d’après le contenu du compte. En démo : un exemple. */
export async function imagePartage(cible: CibleImage): Promise<Blob> {
  const r = BACKEND
    ? await fetch("/api/partage/image", { method: "POST", headers: avecConv({ "content-type": "application/json" }), body: JSON.stringify(cible), credentials: "same-origin" })
    : await fetch(`/apercu/carte?type=${cible.type}`);
  if (!r.ok) throw new ErreurApi("image", r.status);
  return r.blob();
}

/** Une image vraiment partagée ou enregistrée (« Partager en image ») : comptée côté serveur. Rien en démo. */
export function compterImagePartagee(): void {
  if (BACKEND) void reel.compterImagePartagee();
}

export async function desactiverLienPartage(): Promise<void> {
  if (BACKEND) return reel.desactiverLienPartage();
  return (await demo()).desactiverLienPartage();
}

/** Supprime l’histoire : le rapport, la fiche et les captures. */
export async function deleteStory(): Promise<void> {
  if (BACKEND) return void (await reel.deleteStory());
  return (await demo()).deleteStory();
}

/** Ouvre une autre conv du compte : l’accueil s’ouvre sur elle, maintenant et les fois suivantes (sur cet appareil). */
export function openConv(storyId: string) {
  writeStoryCookie(storyId);
}

/** Tout effacer : le compte et toutes les histoires. */
export async function deleteAccount(): Promise<void> {
  if (BACKEND) return void (await reel.deleteAccount());
  return (await demo()).deleteAccount();
}
