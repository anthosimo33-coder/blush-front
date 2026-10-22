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
export const EXPORTS = ["whatsapp", "instagram"] as const satisfies readonly AppKind[];
export type ExportApp = (typeof EXPORTS)[number];
type ImportMode = "export" | "captures";
export type Confidence = "sur" | "probable" | "verifier";
type Side = "toi" | "elle" | "pareil";
/**
 * Les offres du catalogue (src/contenu/offres.ts) : ce qu’on achète, une fois (achats.offre). Le rapport d’une conv seul
 * ou avec des bulles (les deux formules, la suite de l’offre unique ①, et le rapport à −50 % que le repli de « C’est
 * débloqué » a gardé), des bulles en plus après le rapport (③), le 2e rapport à −50 % (un rapport d’avance, pour la conv
 * de son choix), et les recharges.
 */
export const OFFRES = ["rapport", "premium", "suite", "rapport_garde", "premium_ajout", "second", "pack30", "pack80", "pack200"] as const;
export type OffreId = (typeof OFFRES)[number];
/** Les deux formules de la feuille du paiement : le rapport seul, ou Premium (choisie d’avance). */
export const FORMULES = ["rapport", "premium"] as const satisfies readonly OffreId[];
export type Formule = (typeof FORMULES)[number];
/**
 * Les offres uniques, chacune une fois par compte au plus, décidée par le serveur (src/server/offres-uniques.ts) : ① la
 * suite moins chère pendant 5 minutes, ② le mail de relance, ③ Premium pour 5 € de plus après le paiement, ④ le bonus
 * de la première recharge, ⑤ le 2e rapport à −50 % après le paiement, et ⑥ son repli : le −50 % gardé 7 jours pour la
 * conv suivante.
 */
export const OFFRES_UNIQUES = ["suite", "relance_mail", "premium_ajout", "premiere_recharge", "second_rapport", "garde_second"] as const;
export type OffreUnique = (typeof OFFRES_UNIQUES)[number];
/**
 * Les offres uniques que l’écran demande à montrer (POST /api/paiement/offre) : ① en fermant la feuille sans payer, ③ et
 * ⑤ sur « C’est débloqué », ④ en ouvrant la recharge, ⑥ quand « C’est débloqué » garde le −50 % refusé (« Garde-le-moi »).
 */
export const OFFRES_PROPOSEES = ["suite", "premium_ajout", "premiere_recharge", "second_rapport", "garde_second"] as const satisfies readonly OffreUnique[];
export type OffreProposee = (typeof OFFRES_PROPOSEES)[number];
/**
 * Les lots de la roue du paywall (src/contenu/roue.ts, src/server/roue.ts), un tour par compte : des bulles en plus
 * (10, 20, 30), une remise sur la formule (−10 %, −15 %), le 2e rapport à −50 % gardé 30 jours, ou Premium au prix du
 * rapport. Chacun vaut 15 minutes, sur la formule payée ensuite.
 */
export const LOTS_DE_LA_ROUE = ["bulles10", "bulles20", "bulles30", "moins10", "moins15", "second50", "premium_prix"] as const;
export type LotDeLaRoue = (typeof LOTS_DE_LA_ROUE)[number];
/** Ce que le compte fait de la roue (POST /api/roue) : la tourner, ou n’en pas vouloir. */
export const GESTES_DE_LA_ROUE = ["tourner", "refuser"] as const;
export type GesteDeLaRoue = (typeof GESTES_DE_LA_ROUE)[number];
/** Ce que le faux Whop (BLUSH_PAIEMENT_FACTICE, jamais en ligne) fait d’un achat : le payer, le refuser, ou le rembourser (un moyen de test). */
export const ISSUES_DU_FAUX_WHOP = ["payer", "refuser", "rembourser"] as const;
export type IssueDuFauxWhop = (typeof ISSUES_DU_FAUX_WHOP)[number];
/**
 * achats.statut : commandé (en_attente : la configuration de paiement créée, pas encore payé), payé (livré), échoué,
 * remboursé ou contesté (repris : la conv re-verrouillée, les bulles retirées). La page du retour du paiement le lit.
 */
export const STATUTS_ACHAT = ["en_attente", "paye", "echoue", "rembourse", "conteste"] as const;
export type StatutAchat = (typeof STATUTS_ACHAT)[number];
/** Les deux voix de l’A/B test (vocals, chat_vocals, vocal_ecoutes) : A, créée pour BLUSH, et B, de la bibliothèque du prestataire (leurs noms : NOMS_VOIX, src/server/ia/voix.ts). */
export const VOIX = ["A", "B"] as const;
export type Voix = (typeof VOIX)[number];
/** vocal_ecoutes.evenement : un moment de l’écoute du vocal (le début, la fin, une réécoute, fermé avant la fin). */
export const EVENEMENTS_ECOUTE = ["debut", "fin", "reecoute", "ferme"] as const;
export type EvenementEcoute = (typeof EVENEMENTS_ECOUTE)[number];
/**
 * Ce que coupe le lien de désinscription d’un mail (/desinscription?quoi=…) : les conseils (les séquences après l’achat,
 * users.conseils_coupes_le), les offres (les relances et les mails des bulles, users.relances_coupees_le), ou tout.
 */
export const DESINSCRIPTIONS = ["conseils", "offres", "tout"] as const;
export type Desinscription = (typeof DESINSCRIPTIONS)[number];
/**
 * L’écran où se trouve un visiteur en ce moment (presences.etape, /admin en direct), d’après son adresse : l’accueil, un
 * verdict partagé (/v/…), l’import, le verdict, le rapport, le paiement, le chat, son compte, ou ailleurs (src/lib/presence.ts).
 */
export const ETAPES_VISITE = ["accueil", "partage", "import", "verdict", "rapport", "paiement", "chat", "compte", "autre"] as const;
export type EtapeVisite = (typeof ETAPES_VISITE)[number];
/**
 * Les jalons du tunnel (jalons, /admin « L’import, écran par écran » et « Le paywall, jusqu’au paiement ») : ce qu’un
 * visiteur a fait, compté une fois par personne et par jour (src/lib/jalons.ts, src/server/visites.ts).
 * L’import : l’écran « Choisis ton appli » (`commencer`), une appli choisie (`appli` : l’écran de l’export ou des
 * captures), un fichier choisi (`fichier`), l’envoi raté (`envoi_rate` : un fichier illisible, une conv trop courte, le
 * réseau) ou réussi (`importee`), « Qui es-tu ? » rempli (`qui`), le code demandé (`email`) puis validé (`code`), la
 * lecture lancée (`lecture`).
 * Le paywall : arrivé (`paywall`), les offres, les avis, les questions et le bas de l’écran vus, la carte du rapport ou
 * de Premium touchée, le bouton qui paie touché (`payer`, et `payer_premium` avec Premium choisie).
 * Le paiement du paywall : la feuille de la carte ouverte (`carte`), le formulaire de Whop affiché ou Apple Pay ouvert
 * (`whop`), le paiement envoyé (`envoye`), payé (`paye`), refusé par la banque (`refuse`), la carte refermée ou Apple
 * Pay annulé sans payer (`ferme`), parti payer sur la page de Whop (`page_whop`, quand la feuille n’est pas possible).
 */
export const JALONS = [
  "commencer",
  "appli",
  "fichier",
  "envoi_rate",
  "importee",
  "qui",
  "email",
  "code",
  "lecture",
  "paywall",
  "offres",
  "avis",
  "questions",
  "bas",
  "touche_rapport",
  "touche_premium",
  "payer",
  "payer_premium",
  "carte",
  "whop",
  "envoye",
  "paye",
  "refuse",
  "ferme",
  "page_whop",
] as const;
export type Jalon = (typeof JALONS)[number];

/** Les mesures de vitesse que les navigateurs envoient (les Web Vitals : src/lib/sentinelle.tsx), en millisecondes sauf CLS. */
export const METRIQUES_WEB = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type MetriqueWeb = (typeof METRIQUES_WEB)[number];
/** La famille d’un navigateur, tirée de son User-Agent par le serveur (src/server/navigateur.ts) : jamais l’User-Agent lui-même. */
export const FAMILLES_NAVIGATEUR = ["iphone", "iphone-appli", "android", "android-appli", "ordinateur", "autre"] as const;
export type FamilleNavigateur = (typeof FAMILLES_NAVIGATEUR)[number];
/**
 * D’où vient un visiteur (visites.source, users.source) : le lien d’une créatrice (utm_source), sinon le site d’où il
 * arrive, sinon le navigateur intégré de l’appli qui l’a ouvert, sinon « direct » (src/server/visites.ts, sourceDe).
 * « partage » : le lien d’un verdict partagé (/v/…).
 */
export const SOURCES_VISITE = ["tiktok", "instagram", "snapchat", "partage", "google", "autre", "direct"] as const;
export type SourceVisite = (typeof SOURCES_VISITE)[number];
/**
 * Les gestes du fil d’/admin en direct (fil_direct.genre) : une première visite du jour, une conv importée, la page du
 * paiement ouverte, un achat payé, un verdict partagé. Une ville et un geste, jamais un compte ni une conv.
 */
export const GENRES_FIL = ["arrivee", "import", "paiement", "achat", "partage"] as const;
export type GenreFil = (typeof GENRES_FIL)[number];
/** La devinette de « Qui es-tu ? » : où vous en êtes, d’après toi. */
export const GUESSES = ["parle", "vus", "flou", "ensemble"] as const;
export type Guess = (typeof GUESSES)[number];
/** Avant d’être ensemble : ensemble, reciproque, comprendre. En couple : mieux, point, comprendre. */
export const GOALS = ["ensemble", "reciproque", "comprendre", "mieux", "point"] as const;
export type Goal = (typeof GOALS)[number];
/** Le pronom d’une personne : un garçon et une fille, deux filles ou deux garçons, jamais « iel ». */
export const PRONOMS = ["il", "elle"] as const;
export type Pronom = (typeof PRONOMS)[number];
/** Les rubriques de sa fiche, dans l’ordre (leurs titres : src/contenu/fiche.ts). « notes » : ce que tu ajoutes toi-même. */
export const SECTIONS_FICHE = ["infos", "aime", "gens", "dates", "notes"] as const;
/**
 * Pourquoi une lecture ou une écriture a échoué : le refus du modèle (rien à relancer), le budget de l’IA du jour atteint
 * (« souffle » : rien à relancer non plus, elle repart d’elle-même après minuit), ou une panne.
 */
export type Echec = "panne" | "refus" | "souffle";
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

/**
 * Un déséquilibre que le code a compté entre vous deux, sans le modèle (src/server/ecrans/haut-du-paywall.ts) : le haut
 * du paywall en tire son titre (src/contenu/haut-du-paywall.ts). `cote` : qui y met le plus (qui ouvre, reprend, relance,
 * répond le plus vite, écrit le plus long), ou personne nettement (« pareil »). `toi` et `elle` : des jours ou des fois
 * (ouvre, reprend, relance), des millisecondes (delai, le délai de réponse médian), des mots (longueur, par message).
 */
export type SignalDuPaywall = { id: "ouvre" | "reprend" | "relance" | "delai" | "longueur"; cote: Side; toi: number; elle: number };

/**
 * Ses messages ont chuté, et ne sont pas remontés depuis (src/server/ecrans/tendance.ts). `depuis` : le premier jour de
 * la chute (AAAA-MM-JJ) ; `avant` et `apres` : ses messages par jour, avant et depuis ; `semaines` : ses messages par
 * jour, semaine par semaine (la courbe), et `coupure` la place de la première semaine de la chute ; `delai` : son délai
 * de réponse médian avant et depuis, en millisecondes, quand il a nettement grandi.
 */
export type TendanceDuPaywall = {
  depuis: string;
  avant: number;
  apres: number;
  semaines: number[];
  coupure: number;
  delai: { avant: number; apres: number } | null;
};

/** Ce que le haut du paywall montre d’une conv qui attend son paiement : les déséquilibres comptés, et la chute s’il y en a une. */
export type ApercuDuPaywall = { signaux: SignalDuPaywall[]; tendance: TendanceDuPaywall | null };

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
export type VocalRapport = { etat: "en_cours" } | { etat: "pret"; audio: string; duree: number; voix: Voix; sobre: boolean; lignes: VocalLigne[] };

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
  /** Une pastille « initiale » : sa photo à la place, carrée, dans public/convs/ (« /convs/lea.webp »). */
  photo?: string;
  verdict: Pick<Verdict, "emoji" | "title" | "subtitle">;
  /** La preuve : un de ses messages, daté. */
  proof: { text: string; caption: string };
  confidence: Confidence;
  proofs: number;
  next: string;
};

/** Landing et paywall : un vrai avis, publié avec l’accord de la personne. */
export type Testimonial = {
  name: string;
  /** Sa situation (« Situationship »). */
  label: string;
  /** La teinte de sa situation : son rond et son étiquette (rose : un crush, vert : en couple, violet : c’est flou). */
  teinte: "elle" | "vrai" | "flou";
  /** Ce que BLUSH a vu pour elle, sous « BLUSH a vu » (« qui relance sans réponse »). */
  vu: string;
  /** La phrase qui reste, en grand : un morceau de `text`, mot pour mot. */
  citation: string;
  /** Le passage sur BLUSH, surligné dans `text` : un morceau de `text`, mot pour mot. */
  surligne: string;
  text: string;
  /** Sa photo, carrée, dans public/avis/ (« /avis/sonia.webp »), avec son accord. Sans elle : son initiale. */
  photo?: string;
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
  /** Écrite à 0 bulle : verrouillée, sans rien d’elle (elle attend dans le chat, à lire une fois rechargé). */
  verrouillee?: true;
  /** Ce qu’elle a coûté en bulles, et ce qu’il en reste (le serveur le dit avec elle, voir BlushAnswer). Absent pour l’équipe. */
  bulles?: BlushAnswer["bulles"];
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
  /**
   * Ce que cette réponse a coûté en bulles (0 : offerte, une alerte de danger), et ce qu’il en reste après elle. Dit au
   * moment où elle arrive (POST /api/chat, sa lecture une fois payée), jamais gardé en base. Absent : un compte de
   * l’équipe (bulles illimitées), ou une réponse de l’historique.
   */
  bulles?: { depensees: number; restantes: number };
  /**
   * Une réponse écrite à 0 bulle, verrouillée : elle est écrite et gardée, mais ce qui se paie ne quitte pas le serveur
   * avant d’être payé. `message` : de quoi la lire une fois rechargé (POST /api/chat/debloquer, qui débite son `cout`,
   * sauf après une recharge, qui la paie). `cache` : ce qui attend, en forme seulement (VerrouDeLaReponse).
   */
  verrouillee?: { message: number; cout: number; cache: VerrouDeLaReponse };
  /**
   * Jamais du serveur : le mot de BLUSH que le navigateur pose à la place d’une réponse refusée faute de bulles (402
   * « bulles », src/services/api.ts). L’accueil ouvre alors la recharge.
   */
  plusDeBulles?: true;
  /**
   * Ce que BLUSH propose d’acheter, sous sa réponse : il l’a demandé, ou BLUSH a vu le moment (OffreDuChat). Une
   * proposition du 22 octobre 2026, montrée seulement dans l’aperçu de l’équipe (/apercu/achat) tant qu’elle n’est pas validée.
   */
  offre?: OffreDuChat;
};

/**
 * Une offre posée dans le chat, sous la réponse de BLUSH (src/server/vente.ts la choisit, la carte la montre :
 * src/app/app/accueil/achat.tsx). Le chat n’est ouvert qu’avec un rapport payé (ou un rapport doux, offert) : tout s’y
 * vend à quelqu’un qui a déjà payé. Les prix et les packs viennent du catalogue (src/contenu/offres.ts, recharge.ts).
 * - `bulles` : une recharge. `solde` : ce qu’il lui en reste (à zéro, sa réponse attend, verrouillée, et se lit dès la
 *   recharge) ;
 * - `premium` : Premium pour qui a pris le rapport seul (l’offre unique ③, montrée par le serveur avec la carte) ;
 * - `autre` : une conv avec quelqu’un d’autre (`prenom`, s’il l’a dit), importée d’abord, puis payée sur son paywall ;
 * - `a_jour` : la conv de la même personne (`prenom`) réimportée, pour un rapport qui lit aussi ce qui a suivi son
 *   rapport (`depuis` : le jour de ce rapport, en lettres, ou null sans rapport écrit) ;
 * - `reimport` : un ancien rapport doux (une alerte « danger » d’avant le 21 octobre 2026), à réimporter pour le rapport complet.
 * `enUnGeste` : une carte est gardée, le paiement se fait d’un toucher ; sinon la feuille de la recharge (ou la page du
 * paiement) s’ouvre. `reponse`, `envoi` : dans l’aperçu de l’équipe seulement, la réponse que la recharge ouvre.
 */
export type OffreDuChat =
  | { genre: "bulles"; solde: number; enUnGeste: boolean; reponse?: string[]; envoi?: string[] }
  | { genre: "premium"; enUnGeste: boolean }
  | { genre: "autre"; prenom: string | null }
  | { genre: "a_jour"; prenom: string; depuis: string | null }
  | { genre: "reimport"; prenom: string };

/** Ce qui se vend dans le chat (OffreDuChat), et ce qu’on en compte (src/server/vente.ts, /admin, achats.vente). */
export const GENRES_VENDUS = ["bulles", "premium", "autre", "a_jour", "reimport"] as const satisfies readonly OffreDuChat["genre"][];
export type GenreVendu = (typeof GENRES_VENDUS)[number];
/** Ce qu’on compte d’une carte du chat, par jour : posée sous une réponse, touchée (son bouton), ou « Pas maintenant ». Payée : achats.vente. */
export type EvenementDeVente = "vue" | "touchee" | "refusee";

/**
 * Ce qu’une réponse verrouillée cache, et sa forme : la longueur (en caractères) de chacune de ses lignes, jamais leur
 * texte ; l’écran dessine à leur place des lignes neutres, floutées, de la même longueur. `reponse` : la réponse à lui
 * envoyer (« Ta meilleure réponse », ses `lignes`), avec son pourquoi, la relance et le geste ; la lecture de BLUSH, elle,
 * se lit en clair (`bubbles`). `tout` : une réponse sans réponse à envoyer (une question, un geste, une lecture seule)
 * se verrouille en entier : `bubbles` est vide, et `lignes` dit ses bulles, dans l’ordre.
 */
type VerrouDeLaReponse = { quoi: "reponse" | "tout"; lignes: number[] };

/** Une bulle de BLUSH dans le chat, et les messages qu’elle cite. */
export type BulleChat = BlushAnswer["bubbles"][number];

/**
 * La réponse du chat en flux (POST /api/chat, une ligne JSON par événement). Ses bulles une à une, pendant
 * qu’il écrit ; la réponse validée (elle peut remplacer ces bulles) ; puis, si elle part en vocal, l’audio (null : elle
 * reste écrite). Une erreur en route remplace la suite.
 */
export type EvenementChat =
  | { bulle: BulleChat }
  | { reponse: BlushAnswer }
  /* `bulles` : la voix a échoué, la réponse a coûté moins que dit (ce qu’elle a coûté en fin de compte, ce qu’il reste) */
  | { vocal: NonNullable<BlushAnswer["vocal"]> | null; bulles?: BlushAnswer["bulles"] }
  | { erreur: CodePublic };

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
  /** Rien n’a pu être lu, et pourquoi : des captures illisibles, un fichier qui n’est pas un export, une autre conv, trop d’ajouts aujourd’hui, le budget de l’IA du jour, un refus de l’IA, un bug. */
  problem?: Extract<CodeErreur, "capture" | "fichier" | "autre_conv" | "trop" | "souffle" | "refus"> | "bug";
};

export type AnalysisProgress = {
  progress: number;
  messagesRead: number;
  stepsDone: number;
  /** Ce que BLUSH a déjà remarqué pendant la lecture (« Elle relance après 22 h »). */
  discoveries: string[];
  done: boolean;
  failed?: boolean;
  /** Pourquoi : « refus » (le modèle a refusé de lire cette conv, réessayer n’y changerait rien), « souffle » (le budget du jour, elle repart demain), sinon une panne. */
  failReason?: Echec;
  /** La conv attend son paiement : rien n’est lu par le modèle avant (le paywall d’abord). L’écran montre ce que le code a vu, puis la feuille du paiement. */
  paiement?: boolean;
  /** Une prise du mode tournage : sa lecture, recopiée de la conv de tournage, est déjà finie. L’écran qui vient de la lancer la déroule en quelques secondes. */
  rejouee?: boolean;
};
