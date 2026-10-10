/* Types du domaine BLUSH — contrat avec le back-end. */
import type { CodeErreur, CodePublic } from "./erreurs-api";

/*
 * Le vocabulaire du domaine : chaque liste fermée n’est écrite qu’ici, et ses types (et les z.enum des routes) en
 * dérivent. Le sous-module des prompts a les siens (Devinette, Objectif, Pronom) : tests/vocabulaire.test.ts vérifie
 * qu’ils restent les mêmes.
 */

/**
 * Les applis d’où vient une conv, et leur nom. Des captures d’une autre appli (« autre ») se disent « Captures » une
 * fois importées ; là où on choisit son appli, « Autre appli » (NOM_AUTRE_APPLI).
 */
export const APPLIS = { whatsapp: "WhatsApp", imessage: "iMessage", instagram: "Instagram", hinge: "Hinge", autre: "Captures" } as const;
export type AppKind = keyof typeof APPLIS;
/** « autre », là où on choisit son appli (« Vous vous parlez où ? ») : des captures d’une appli qu’on ne nomme pas. */
export const NOM_AUTRE_APPLI = "Autre appli";
/** Les applis qui s’exportent (écran 02). iMessage ne s’exporte pas : on filme son écran (/importer/captures). */
export type ExportApp = Extract<AppKind, "whatsapp" | "instagram">;
type ImportMode = "export" | "captures";
export type Confidence = "sur" | "probable" | "verifier";
type Side = "toi" | "elle" | "pareil";
/** Ce que le compte a (users.plan) : l’offre achetée en donne un (src/contenu/offres.ts). Du moins au plus : src/lib/acces.ts lit cet ordre. */
export const PLANS = ["gratuit", "rapport", "blushplus"] as const;
export type Plan = (typeof PLANS)[number];
/** Les deux voix de l’A/B test (vocals, chat_vocals, vocal_ecoutes) : A (E2, créée pour BLUSH) et B (L2, Harmonie, de la bibliothèque ElevenLabs). */
export const VOIX = ["A", "B"] as const;
export type Voix = (typeof VOIX)[number];
/** vocal_ecoutes.evenement : un moment de l’écoute du vocal (le début, la fin, une réécoute, fermé avant la fin). */
export const EVENEMENTS_ECOUTE = ["debut", "fin", "reecoute", "ferme"] as const;
export type EvenementEcoute = (typeof EVENEMENTS_ECOUTE)[number];
/** La devinette de « Qui es-tu ? » : où vous en êtes, d’après toi. */
export const GUESSES = ["parle", "vus", "flou", "ensemble"] as const;
export type Guess = (typeof GUESSES)[number];
/** Avant d’être ensemble : ensemble, reciproque, comprendre. En couple : mieux, point, comprendre. */
export const GOALS = ["ensemble", "reciproque", "comprendre", "mieux", "point"] as const;
export type Goal = (typeof GOALS)[number];
/** Le pronom d’une personne (BLUSH accompagne un garçon qui parle à une fille, ou l’inverse). */
export const PRONOMS = ["il", "elle"] as const;
export type Pronom = (typeof PRONOMS)[number];
/** Les rubriques de sa fiche, dans l’ordre (leurs titres : src/contenu/fiche.ts). « notes » : ce que tu ajoutes toi-même. */
export const SECTIONS_FICHE = ["infos", "aime", "gens", "dates", "notes"] as const;
/** Pourquoi une lecture ou une écriture a échoué pour de bon : le refus du modèle (rien à relancer), ou une panne. */
export type Echec = "panne" | "refus";
/** Avant d’être ensemble, les étapes : parle → voit → dit → ensemble. En couple, la température : eloigne → coince → va → soudes. */
export type LevelId = "parle" | "voit" | "dit" | "ensemble" | "eloigne" | "coince" | "va" | "soudes";

/** Un vrai message, toujours daté. */
export type Message = {
  from: "toi" | "elle";
  text: string;
  /** Légende affichée sous la bulle (« Sophie · 23:41 », « 13 févr. »). */
  caption?: string;
};

export type Person = {
  id: string;
  name: string;
  initial: string;
  /** Son pronom. Sans : « elle ». */
  pronoun?: Pronom;
};

/** Une source importée : un export ou un lot de captures. */
export type Source = {
  id: string;
  app: AppKind;
  mode: ImportMode;
  /** Nom du fichier (export) ou nombre de captures. */
  fileName?: string;
  screenshotCount?: number;
  /** Libellé de la période (« Le match · 2 sept. »). */
  label: string;
  period: string;
  messageCount: number;
  voiceCount?: number;
  /** Un export trop long pour partir en entier : BLUSH n’en lit que les derniers mois (combien). */
  moisLus?: number;
};

/** Une conv du compte, telle que la liste « Tes convs » la montre : qui, où vous en êtes, quand BLUSH en a parlé pour la dernière fois. */
export type ConvSummary = {
  storyId: string;
  person: Person;
  /** null : BLUSH est encore en train de la lire. */
  verdict: Pick<Verdict, "emoji" | "title"> | null;
  level: LevelId | null;
  trend: string;
  /** « aujourd’hui », « hier », « lun. » */
  lastLabel: string;
  /** Celle qui s’ouvre sur l’accueil (la dernière ouverte). */
  current: boolean;
};

export type Story = {
  id: string;
  participants: [Person, Person];
  sources: Source[];
  totalMessages: number;
  voiceCount: number;
  /** « 14 déc. → 12 mars » */
  period: string;
  durationLabel: string;
  updatedLabel: string;
  /** Qui est l’utilisateur (une fois « Qui es-tu ? » rempli). Sans, l’écran se fie au parcours de l’onglet. */
  me?: Person["id"];
};

export type ScoreRow = {
  label: string;
  winner: Side;
  /** Part de « toi » dans la barre, en %. */
  toiPercent: number;
  captionLeft?: string;
  captionRight?: string;
};

export type ChapterBlock =
  | { kind: "essential"; text: string }
  | { kind: "seen"; title?: string; facts?: string[]; messages?: Message[]; factsAfter?: string[] }
  | { kind: "meaning"; text: string }
  | { kind: "play"; text: string }
  | { kind: "confidence"; level: Confidence; text: string }
  | { kind: "scores"; rows: ScoreRow[] }
  | { kind: "timeline"; items: { title: string; text: string; message?: Message }[] }
  | { kind: "duo"; title: string; text: string; trophies: { title: string; text: string; side: "toi" | "elle" }[] }
  | { kind: "scenarios"; items: { title: string; text: string; tag: "probable" | "meilleur" }[] }
  | { kind: "plan"; items: { when: string; title: string; text: string }[] }
  | { kind: "question"; label: string; text: string }
  /* Le rapport raconté (prompt 05) : l’ouverture, un moment du récit avec ses messages, la chute d’un chapitre, ce qu’on arrête, le mot de la fin. */
  | { kind: "lead"; text: string }
  | { kind: "story"; text: string; messages?: Message[] }
  | { kind: "punchline"; text: string }
  | { kind: "stop"; items: { title: string; text: string; messages?: Message[] }[] }
  | { kind: "ending"; text: string };

export type Chapter = {
  number: number;
  title: string;
  kicker?: string;
  /** Titre court dans le sommaire et la liste verrouillée. */
  tocTitle: string;
  free: boolean;
  /** Un chapitre payant, sans l’accès : verrouillé, et sans contenu. */
  locked?: boolean;
  blocks: ChapterBlock[];
};

export type Verdict = {
  emoji: "🤏" | "🔥" | "🤔" | "🧊";
  short: string;
  title: string;
  subtitle: string;
  /* Le serveur envoie aussi `difficult` (prompts/lib/front.ts), que le front ne lit pas : une alerte de danger se voit à `ReportPayload.sober` (src/services/api.ts) */
};

/** Une ligne du vocal de BLUSH : ce qu’elle dit, quand (en secondes), mot par mot, et le message de leur conv qu’elle cite. */
export type VocalLigne = {
  texte: string;
  /** Une punchline : affichée en rose pendant qu’elle la dit. */
  punch: boolean;
  debut: number;
  fin: number;
  mots: { t: string; debut: number }[];
  recu?: Message;
};

/**
 * Le vocal du rapport (la story en haut). `en_cours` : BLUSH l’enregistre. `pret` : l’audio et ses sous-titres minutés.
 * `voix` : celle de l’A/B test, A ou B.
 */
export type VocalRapport =
  | { etat: "en_cours" }
  | { etat: "pret"; audio: string; duree: number; voix: Voix; sobre: boolean; lignes: VocalLigne[] };

export type Report = {
  storyId: string;
  verdict: Verdict;
  chapters: Chapter[];
  readingTime: { free: string; full: string };
  level: LevelId;
  trend: string;
  nextStep: string;
};

/** Landing : une conv d’exemple du bandeau qui défile, et le verdict qu’en tire BLUSH (exemple fictif). */
export type LandingConv = {
  id: string;
  /** Le nom tel qu’il est enregistré dans le téléphone. */
  name: string;
  /** Ce que la personne est pour toi (« Ton crush »). */
  label: string;
  app: AppKind;
  /** La pastille : l’icône de l’appli, ou l’initiale (rose : l’autre personne). */
  avatar: "app" | "initial";
  verdict: Pick<Verdict, "emoji" | "title" | "subtitle">;
  /** La preuve : un de ses messages, daté. */
  proof: { text: string; caption: string };
  confidence: Confidence;
  proofs: number;
  next: string;
};

/** Landing : un vrai avis, publié avec l’accord de la personne. */
export type Testimonial = {
  name: string;
  /** Sa situation (« Situationship »). */
  label: string;
  text: string;
};

/** Le mode sobre, sur une alerte de danger (détresse, mineur) : un rapport court et doux, offert, jamais partagé. */
export type SoberReport = {
  intro: string;
  title: string;
  facts: string;
  reassurance: string;
  steps: string[];
  draftLabel: string;
  draft: string;
  helpLabel: string;
};

export type QuestionAnswer = {
  question: string;
  title: string;
  evidenceLabel: string;
  evidence: string;
  /** Le vrai message sur lequel s’appuie la réponse, s’il y en a un. */
  message?: Message;
  confidence: Confidence;
  limits: string;
};

/**
 * La réponse de BLUSH dans le chat, en bulles, comme un pote qui écrit : chaque bulle suivie des messages qu’elle cite,
 * puis, s’il y a lieu, les messages à envoyer, une question (quand la suite dépend de lui) ou un geste (liker son message).
 * `incoming` : les messages qu’il a reçus, montrés d’abord.
 */
export type BlushAnswer = {
  kind: "bubbles";
  incoming?: Message[];
  bubbles: { text: string; messages?: Message[] }[];
  send?: string[];
  why?: string;
  ask?: string;
  react?: string;
  /** Le nouveau niveau (ou la nouvelle température) que ce message vous fait atteindre. Une fois par niveau. */
  levelUp?: LevelId;
  /** La réponse dite en vocal : l’audio, sa durée (en secondes) et son onde. Ses bulles ne s’affichent pas. */
  vocal?: { audio: string; duree: number; peaks: number[] };
  /** Le vocal se prépare encore (il arrive juste après la réponse, voir EvenementChat) ; sa bulle attend. Jamais en base. */
  vocalEnCours?: boolean;
  /** Le chat est en vocal après cette réponse (il a demandé à BLUSH de lui parler en vocal). */
  modeVocal?: boolean;
  /** L’échange (l’id de ton message) auquel cette réponse appartient, pour la partager en image. */
  echange?: number;
};

/** Une bulle de BLUSH dans le chat, et les messages qu’elle cite. */
export type BulleChat = BlushAnswer["bubbles"][number];

/**
 * La réponse du chat en flux (POST /api/chat, une ligne JSON par événement). Ses bulles une à une, pendant
 * qu’il écrit ; la réponse validée (elle peut remplacer ces bulles) ; puis, si elle part en vocal, l’audio (null : elle
 * reste écrite). Une erreur en route remplace la suite.
 */
export type EvenementChat = { bulle: BulleChat } | { reponse: BlushAnswer } | { vocal: NonNullable<BlushAnswer["vocal"]> | null } | { erreur: CodePublic };

type FicheSource = "conv" | "capture" | "note";

export type FicheFact = {
  id: string;
  section: (typeof SECTIONS_FICHE)[number];
  text: string;
  /** Libellé de provenance (« conv · sa bio Hinge », « ajouté par toi »). */
  sourceLabel: string;
  sources: FicheSource[];
};

export type Fiche = {
  person: Person;
  portrait: string;
  updatedLabel: string;
  facts: FicheFact[];
  summary: string;
  summaryShort: string;
  /** Une mise à jour de la mémoire est en attente ou en cours : ce qui arrive n’est pas encore dans la fiche, l’écran la relit. */
  updating?: boolean;
};

/** Ce que BLUSH a trouvé dans des captures ou un export, déjà rangé dans sa fiche. */
export type FicheUpdate = {
  fiche: Fiche;
  added: FicheFact[];
  /**
   * Lu, pas encore rangé : ce qu’on lit sur son profil, et le nombre de nouveaux messages. La mémoire se met à jour après
   * la réponse ; `added` arrive quand la fiche ne dit plus `updating`.
   */
  pending?: { profile: string[]; messages: number };
  /** Rien n’a pu être lu, et pourquoi : des captures illisibles, un fichier qui n’est pas un export, une autre conv, trop d’ajouts aujourd’hui, un bug. */
  problem?: Extract<CodeErreur, "capture" | "fichier" | "autre_conv" | "trop"> | "bug";
};

export type Subscription = {
  plan: Plan;
  priceLabel: string;
  renewLabel: string;
  stopLabel: string;
  active: boolean;
  paused: boolean;
};

export type Offer = {
  id: Exclude<Plan, "gratuit">;
  title: string;
  titleDesktop: string;
  price: string;
  note: string;
  noteDesktop: string;
  recommended: boolean;
};

export type AnalysisProgress = {
  progress: number;
  messagesRead: number;
  stepsDone: number;
  /** Ce que BLUSH a déjà remarqué pendant la lecture (« Elle relance après 22 h »). */
  discoveries: string[];
  done: boolean;
  failed?: boolean;
  /** Pourquoi : « refus » (le modèle a refusé de lire cette conv, réessayer n’y changerait rien), sinon une panne. */
  failReason?: Echec;
};
