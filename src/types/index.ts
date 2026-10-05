/* Types du domaine CRUSH — contrat avec le futur back-end. */

export type AppKind = "whatsapp" | "imessage" | "instagram" | "hinge" | "autre";
export type ImportMode = "export" | "captures";
export type Confidence = "sur" | "probable" | "verifier";
export type Side = "toi" | "elle" | "pareil";
export type Plan = "gratuit" | "rapport" | "crushplus";
export type Guess = "parle" | "vus" | "flou";
export type Goal = "ensemble" | "reciproque" | "comprendre";
export type LevelId = "parle" | "voit" | "dit" | "ensemble";

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
  | { kind: "question"; label: string; text: string };

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

export type Report = {
  storyId: string;
  verdict: Verdict;
  chapters: Chapter[];
  readingTime: { free: string; full: string };
  level: LevelId;
  trend: string;
  nextStep: string;
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
  confidence: Confidence;
  limits: string;
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
  section: "aime" | "gens" | "dates" | "notes";
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

export type FicheExtraction = {
  sourceApp: AppKind;
  sourceLabel: string;
  /** Provenance affichée sur la fiche (« sa bio Hinge »). */
  factSourceLabel: string;
  quote: string;
  items: { id: string; text: string; section: FicheFact["section"]; fact: string }[];
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
  discoveries: number;
  done: boolean;
  failed?: boolean;
};

export type DemoError = "fichier" | "groupe" | "courte" | "lecture" | "capture";
