/* Types du domaine BLUSH — contrat avec le futur back-end. */

export type AppKind = "whatsapp" | "imessage" | "instagram" | "hinge" | "autre";
export type ImportMode = "export" | "captures";
export type Confidence = "sur" | "probable" | "verifier";
export type Side = "toi" | "elle" | "pareil";
export type Plan = "gratuit" | "rapport" | "blushplus";
export type Guess = "parle" | "vus" | "flou" | "ensemble";
/** Avant d’être ensemble : ensemble, reciproque, comprendre. En couple : mieux, point, comprendre. */
export type Goal = "ensemble" | "reciproque" | "comprendre" | "mieux" | "point";
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
  /** Back-end : son pronom (BLUSH accompagne un garçon qui parle à une fille, ou l’inverse). Sans : « elle ». */
  pronoun?: "il" | "elle";
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
  /** Le back-end peut renvoyer un chapitre verrouillé sans contenu. */
  locked?: boolean;
  blocks: ChapterBlock[];
};

export type Verdict = {
  emoji: "🤏" | "🔥" | "🤔" | "🧊";
  short: string;
  title: string;
  subtitle: string;
  /** Verdict négatif : le rapport bascule en mode sobre. */
  difficult: boolean;
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
  | { etat: "pret"; audio: string; duree: number; voix: "A" | "B"; sobre: boolean; lignes: VocalLigne[] };

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

/** Le mode sobre (verdict difficile). */
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
 * La réponse de BLUSH dans le chat : l’analyse d’un message (ce qu’il veut dire et ta meilleure réponse),
 * la meilleure réponse seule, une réponse à une question, ou où vous en êtes (avec les niveaux).
 * `quoted` : BLUSH montre d’abord le message qu’il a lu.
 */
export type BlushAnswer = (
  | { kind: "analysis"; reply: Reply; quoted?: boolean }
  | { kind: "best"; reply: Reply }
  | { kind: "answer"; answer: QuestionAnswer }
  | { kind: "level"; answer: QuestionAnswer }
  /* La réponse en bulles, comme un pote qui écrit : chaque bulle suivie des messages qu’elle cite, puis, s’il y a lieu,
     les messages à envoyer, une question (quand la suite dépend de lui) ou un geste (liker son message). */
  | { kind: "bubbles"; incoming?: Message[]; bubbles: { text: string; messages?: Message[] }[]; send?: string[]; why?: string; ask?: string; react?: string }
) & {
  /** Le nouveau niveau (ou la nouvelle température) que ce message vous fait atteindre. Une fois par niveau. */
  levelUp?: LevelId;
  /** La réponse dite en vocal : l’audio, sa durée (en secondes) et son onde. Ses bulles ne s’affichent pas. */
  vocal?: { audio: string; duree: number; peaks: number[] };
  /** Le chat est en vocal après cette réponse (il a demandé à BLUSH de lui parler en vocal). */
  modeVocal?: boolean;
};

export type Reply = {
  messageId: string;
  incoming: Message;
  sourceLabel: string;
  meaningTitle: string;
  meaningProof: string;
  best: string;
  why: string;
};

export type FicheSource = "conv" | "capture" | "note";

export type FicheFact = {
  id: string;
  section: "infos" | "aime" | "gens" | "dates" | "notes";
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
};

/** Ce que BLUSH a trouvé dans des captures ou un export, déjà rangé dans sa fiche. */
export type FicheUpdate = {
  fiche: Fiche;
  added: FicheFact[];
  /** Ce qu’il savait déjà : l’info reste une seule fois, sa nouvelle source s’ajoute. */
  confirmed: FicheFact[];
  /** Rien n’a pu être lu, et pourquoi : des captures illisibles, un fichier qui n’est pas un export, une autre conv, trop d’ajouts aujourd’hui, un bug. */
  problem?: "capture" | "fichier" | "autre_conv" | "trop" | "bug";
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
  failReason?: "refus" | "panne";
};

export type DemoError = "fichier" | "groupe" | "courte" | "lecture" | "capture" | "video" | "longue";
