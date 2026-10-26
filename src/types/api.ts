/*
 * Le contrat HTTP entre le navigateur et le back-end : ce que chaque route /api reçoit et ce qu’elle répond, et les types
 * qui passent sur le réseau. Sans server-only ni client-only. Le serveur en lit les schémas (lireCorps, src/server/http.ts)
 * et répond sous le type de sa ligne (repondre) ; le navigateur n’en importe que des types (appel, src/services/api.ts),
 * par `import type` : zod n’entre pas dans ses pages. Une route ajoutée, retirée, ou une méthode de plus change sa ligne
 * ici : tests/unit/contrat.test.ts compare la table aux routes de src/app/api, et vérifie ces imports.
 */
import { z } from "zod";
import { INVITATIONS_PAR_LOT, NOM_TOURNAGE_MAX, PRENOM_MAX } from "@/lib/limites";
import {
  DESINSCRIPTIONS,
  ETAPES_VISITE,
  EVENEMENTS_ECOUTE,
  GENRES_VENDUS,
  GESTES_DE_LA_ROUE,
  GOALS,
  GUESSES,
  ISSUES_DU_FAUX_WHOP,
  JALONS,
  METRIQUES_WEB,
  OFFRES,
  OFFRES_PROPOSEES,
  PRONOMS,
  SECTIONS_FICHE,
} from "@/types";
import type {
  AnalysisProgress,
  BlushAnswer,
  Echec,
  EtapeVisite,
  Fiche,
  FicheUpdate,
  GenreFil,
  LotDeLaRoue,
  OffreId,
  OffreProposee,
  Report,
  SoberReport,
  Source,
  SourceVisite,
  StatutAchat,
  Story,
  VocalRapport,
} from "@/types";
import type { MethodeClientOAuth } from "@/server/db/enums";
import type { metadonneesDeLaRessource, metadonneesDuServeur, reponseDeJeton } from "@/server/mcp/oauth";
import type { CodeErreur } from "./erreurs-api";

/* ———— Ce qui passe sur le réseau ———— */

/** Le compte, ses droits et ses bulles (src/server/droits.ts). */
export type Account = {
  email: string | null;
  /** Son solde de bulles (une réponse de BLUSH en coûte). Il peut être négatif après un remboursement. */
  bulles: number;
  /** Un client : au moins un rapport débloqué, ou un achat payé (sa fiche s’ouvre). */
  client: boolean;
  /** Un compte de l’équipe (BLUSH_ACCES_LIBRE) : tous ses rapports ouverts, bulles illimitées, rien à payer. */
  equipe: boolean;
  storyDeleted: boolean;
};

/** Un chapitre pendant l’écriture du rapport : en attente, en train de s’écrire, ou prêt. */
export type EtatChapitre = "attente" | "en_cours" | "ecrit";
/** Pendant que le rapport s’écrit : la vraie avancée, lue sur ce que le modèle écrit. */
export type EcritureRapport = {
  etape: "plan" | "chapitres";
  /** De 0 à 1 : le plan jusqu’à 0,35 (PART_DU_PLAN, src/server/avancement.ts), puis les chapitres. */
  progres: number;
  chapitres: { number: number; title: string; etat: EtatChapitre }[];
  /** Le temps qui reste, estimé (« 1 min »), ou null tant qu’on ne sait pas. */
  restant: string | null;
};

export type ReportPayload = {
  report: Report;
  /** Le mode sobre : présent quand la conv lève une alerte de danger (détresse, mineur), le rapport court et doux. */
  sober: SoberReport | null;
  /**
   * Le verdict a levé une alerte de danger (son `mode_sobre`) : su dès le verdict, avant que le rapport doux (`sober`)
   * soit écrit. Ni scène du verdict, ni rapport joueur : l’attente sobre, puis le rapport doux. Toujours rempli par le
   * serveur (assemblerRapport) ; absent des aperçus de l’équipe, qui n’en ont pas.
   */
  alerte?: boolean;
  /** Le rapport de cette conv est débloqué (payé, offert, ou un compte de l’équipe) : tous ses chapitres. Sinon, le chapitre 1. */
  debloque: boolean;
  /** Le rapport s’écrit encore (rapport débloqué, pas fini). Le front repasse dans quelques secondes. */
  generating?: boolean;
  /** Pendant l’écriture : où en est BLUSH, chapitre par chapitre. */
  ecriture?: EcritureRapport;
  /** Le vocal de BLUSH, en haut du rapport : prêt, ou en train de s’enregistrer. */
  vocal?: VocalRapport;
  /** L’écriture a échoué pour de bon (la panne : on peut la relancer ; le refus du modèle : rien à relancer). */
  echec?: Echec;
};

/** Un échange avec BLUSH, tel que l’accueil le réaffiche : `id` (celui de ton message) sert à charger ceux d’avant. */
export type EchangeChat = { id: number; mine: string; answer: BlushAnswer; at: number };

/** Un morceau de l’historique du chat (du plus ancien au plus récent), et s’il en reste de plus anciens. */
export type HistoriqueChat = { echanges: EchangeChat[]; plus: boolean; modeVocal?: boolean };

/**
 * Où en est la lecture d’un enregistrement d’écran : la vidéo regardée dans le navigateur, puis ses lots lus par BLUSH.
 * « reprise » : le réseau a coupé pendant un envoi de captures ou d’enregistrement, il repart (voir avecReprise).
 */
export type AvanceVideo = { etape: "video"; p: number } | { etape: "lecture"; faits: number; total: number } | { etape: "reprise" };

/** Le verdict tel que le montre un lien partagé : le prénom de l’autre en initiale, le tien en clair (« C. t’attend, Hugo »). */
export type VerdictMontre = { emoji: string; title: string };

/**
 * Un paiement commencé (POST /api/paiement) : son achat, sa configuration de paiement chez Whop (ch_…), et la page où
 * payer (celle de Whop, ou du faux Whop), ou null : payé en un geste, ou dans la feuille. Dans la feuille (un jeton des
 * Elements de Whop), `paiement` : le paiement créé chez Whop (pay_…), son statut (« paid » : payé ; le reste : une étape
 * attend l’acheteur, ou la banque décide encore), et la clé qui laisse le navigateur finir l’étape (une 3-D Secure), ou
 * null. Dans tous les cas, l’achat se suit par GET /api/paiement/[achat] jusqu’à sa livraison.
 */
export type PaiementCommence = {
  achat: string;
  checkout: string | null;
  url: string | null;
  paiement: { id: string; statut: string; secret: string | null } | null;
};

/**
 * Comment payer dans la feuille : les Elements de Whop (son compte, biz_…, en ligne ou dans son bac à sable), la feuille
 * de test du faux Whop (BLUSH_PAIEMENT_FACTICE, jamais en ligne), ou rien (le paiement pas branché : « bientôt »).
 */
type PaiementDansLaFeuille = { mode: "whop"; compte: string; bacASable: boolean } | { mode: "factice" } | { mode: null };

/**
 * Ce que le compte a d’avance pour une conv pas encore débloquée : un rapport d’avance (le 2e rapport à −50 %, payé sur
 * « C’est débloqué », valable un an, et les bulles qu’il donnera, celles promises à sa commande) et le −50 % gardé
 * (7 jours), chacun avec sa fin (une date ISO), ou null.
 */
export type Avoirs = { avance: { fin: string; bulles: number } | null; garde: { fin: string } | null };

/**
 * La roue du paywall de ce compte (src/server/roue.ts) : à tourner, refusée, gagnée (la case et son lot, sa fin, une
 * date ISO, le temps qu’il lui reste à l’heure du serveur, en millisecondes, et s’il vaut encore : ni pris, ni passé), ou
 * « aucune » (l’équipe, pas de paiement branché, ou un compte qui a déjà mieux d’avance).
 */
export type RoueDuCompte = { etat: "a_tourner" | "refusee" | "aucune" } | { etat: "gagnee"; case: number; lot: LotDeLaRoue; fin: string; reste: number; valable: boolean };

/**
 * Ce que la feuille du paiement doit savoir (GET /api/paiement/feuille) : comment payer dans la feuille, les avoirs du
 * compte, sa roue, et si Premium s’est payée plus souvent que le rapport seul ces 30 derniers jours (le badge « Le plus
 * choisi » du paywall ne le dit que si c’est vrai).
 */
export type FeuilleDuPaiement = { paiement: PaiementDansLaFeuille; roue: RoueDuCompte; premiumPlusChoisi: boolean } & Avoirs;

/**
 * Un achat du compte, pour « Tes achats » (GET /api/achats) : son offre, son prix TTC (en centimes), les bulles qu’il a
 * données, son statut, et quand (son paiement, une date ISO).
 */
/**
 * Un achat payé du compte (« Tes achats ») : son offre, son montant, ses bulles, son état et son jour (une date ISO). Un
 * rapport d’avance dit aussi jusqu’à quand il vaut et quand il a servi (`avance`, des dates ISO, `utiliseLe` null tant
 * qu’il attend), et jusqu’à quand on peut s’en rétracter (`retractation`, 14 jours après l’achat ; null une fois utilisé ou passé).
 */
export type AchatDuCompte = {
  id: string;
  offre: OffreId;
  centimes: number;
  bulles: number;
  statut: StatutAchat;
  le: string;
  avance?: { fin: string; utiliseLe: string | null; retractation: string | null };
};

/** Où en est un achat (GET /api/paiement/[achat]) : son offre, son statut, les bulles qu’il donne, la conv dont il débloque le rapport. */
export type EtatAchat = { achat: string; offre: OffreId; statut: StatutAchat; bulles: number; conv: string | null };

/**
 * Une offre unique montrée (POST /api/paiement/offre) : laquelle, jusqu’à quand (une date ISO, l’heure de fin du compte
 * à rebours de ①, ou null : sans fin), le temps qu’il lui reste à l’heure du serveur (en millisecondes, ou null : sans
 * fin), et si elle se paie en un geste (un moyen de paiement gardé) ; ou aucune. Le compte à rebours part de `reste`,
 * pas de `fin` : l’horloge du téléphone peut avancer ou retarder sur celle du serveur.
 */
export type OffreUniqueMontree = { offre: OffreProposee; fin: string | null; reste: number | null; enUnGeste: boolean } | { offre: null };

/** Le webhook que le faux Whop fabrique (BLUSH_PAIEMENT_FACTICE) : son corps et ses en-têtes signés, que le navigateur poste à /api/paiement/whop ; puis l’adresse du retour. */
export type WebhookDuFauxWhop = { webhook: { corps: string; entetes: Record<string, string> }; retour: string | null };

/** Où en est la lecture d’une conv de tournage (src/server/tournage.ts) : en route, prête à rejouer, ou en échec pour de bon. */
export type StatutDuTournage = "en_lecture" | "pret" | "echec";

/**
 * Une conv de tournage vue par l’API du mode tournage (GET /api/admin/tournage/[id]) : sa lecture (`erreur` : l’étape en
 * échec et son code, ou « alerte »), et son lien, l’adresse entière, une fois prête et tant qu’elle n’est pas arrêtée.
 */
export type ConvDeTournage = { id: string; nom: string; statut: StatutDuTournage; erreur: string | null; lien: string | null; arrete: boolean };

/**
 * Pourquoi une conv ne devient pas une conv de tournage (src/server/tournage.ts) : elle n’est pas au compte de l’équipe
 * qui la choisit (ou c’est déjà une prise), elle n’est pas lue, une étape est encore en route, son rapport n’est pas
 * écrit, ou sa mémoire pas faite.
 */
export type RefusDuTournage = "aucune" | "pas_lue" | "en_cours" | "sans_rapport" | "sans_memoire";

/**
 * Le rappel du mode tournage dans « Mon compte » (rappelDuTournage, src/server/tournage.ts). `telephone` : ce navigateur
 * garde le cookie d’un lien, `nom` son nom tel que le lit la créatrice ("" s’il ne disait que le prénom d’une autre),
 * null si le lien est arrêté. `compte` : plus de cookie, mais le compte a fait une prise depuis sa dernière sortie, et
 * ses vraies lectures sont refusées.
 */
export type RappelDuTournage = { sur: "telephone"; nom: string | null } | { sur: "compte" };

/**
 * Ce qu’un geste de l’équipe a fait (POST /api/admin), en nombres : le nouveau solde de bulles, les convs débloquées
 * (null : aucun compte pour cet email), ou un lot d’invitations (les mails partis, ceux qui restent à inviter, si le
 * plafond des mails du jour l’a arrêté, les adresses refusées par le prestataire des mails, et s’il l’a arrêté : LotInvite,
 * src/server/attente.ts) ; une conv de tournage créée (`refus` : pourquoi elle ne l’a pas été), ou arrêtée.
 */
export type GesteDeLEquipe =
  | { action: "tournage"; refus: RefusDuTournage | null }
  | { action: "tournage_arret"; arretee: boolean }
  | { action: "bulles"; solde: number | null }
  | { action: "debloquer"; convs: number | null }
  | { action: "inviter"; invites: number; restent: number; plafond: boolean; refusees: number; prestataire: boolean };

/**
 * Un geste du fil d’/admin en direct : une ville (null : inconnue), quand, et ce qui va avec (la source d’une arrivée,
 * l’offre d’un paiement ou d’un achat, et le prix payé d’un achat : `centimes`, absent pour un achat noté au fil avant
 * que le fil garde son achat, avec la grille du 23 octobre 2026, qui se dit alors au prix du catalogue).
 */
export type GesteDuFil =
  | { genre: Extract<GenreFil, "arrivee">; ville: string | null; le: string; source: SourceVisite }
  | { genre: Extract<GenreFil, "paiement">; ville: string | null; le: string; offre: OffreId }
  | { genre: Extract<GenreFil, "achat">; ville: string | null; le: string; offre: OffreId; centimes?: number }
  | { genre: Extract<GenreFil, "import" | "partage">; ville: string | null; le: string };

/**
 * /admin en direct, à cet instant (GET /api/admin/direct, src/server/direct.ts) : qui est sur le site, où il en est, d’où
 * il arrive, de quelle ville, et le fil des derniers gestes. Des nombres, des villes et des écrans : ni compte, ni conv.
 */
export type Direct = {
  /** L’heure du calcul (ISO). */
  le: string;
  /** Les personnes en ligne : les onglets qui ont fait signe dans la dernière minute et demie (EN_LIGNE_S). */
  enLigne: number;
  /** Où elles en sont, par écran (toutes les étapes, même à 0, dans l’ordre d’ETAPES_VISITE). */
  etapes: { etape: EtapeVisite; n: number }[];
  /** D’où elles arrivent (les sources présentes seulement, de la plus nombreuse à la moins nombreuse). */
  sources: { source: SourceVisite; n: number }[];
  /**
   * D’où elles se connectent : la ville, son pays (code ISO à deux lettres) et ses coordonnées (celles que donne
   * l’hébergeur pour la connexion, à la ville près), de la plus nombreuse à la moins nombreuse. `ville` null : inconnue.
   */
  villes: { ville: string | null; pays: string | null; lat: number | null; lon: number | null; n: number }[];
  /** Les personnes en ligne minute par minute, sur les 30 dernières (la dernière est en cours). */
  minutes: { le: string; n: number }[];
  /** Le plus de monde en ligne en même temps aujourd’hui (jour de Paris), et la minute, ou null. */
  record: { n: number; le: string } | null;
  /** Les derniers gestes, du plus récent au plus ancien (30 au plus, des dernières 24 h). */
  fil: GesteDuFil[];
  /** Aujourd’hui (jour de Paris) : les visiteurs, les achats payés et leur montant TTC en centimes. */
  jour: { visiteurs: number; achats: number; centimes: number };
};

/** Ce qu’un passage des relances a fait (GET /api/cron/relances) : des nombres seulement, jamais un email ni un identifiant. */
export type PassageDesRelances = { dues: number; envoyees: number; ecartees: number; retenues: number; echecs: number };

/** Une erreur d’une route : son code (src/types/erreurs-api.ts), jamais de détail interne. */
/** Une erreur : son code ; « bulles » porte aussi les numéros d’aide de l’appli (src/contenu/aide.ts). */
export type ReponseErreur = { erreur: CodeErreur; aide?: readonly string[] };

/** Une conv importée (un export, des captures, un enregistrement d’écran) : sa source, et l’histoire brouillon qu’elle devient. */
type ConvImportee = { source: Source; story: Story };

/** Ce que répondent les routes qui ne disent rien de plus que « c’est fait ». */
type Ok = { ok: true };

/* ———— Ce que les routes reçoivent ———— */

/** « Qui es-tu ? » : qui tu es dans la conv (l’un de ses deux participants, p0 ou p1), ton pronom, ta devinette, ce que tu veux. */
const Qui = z.object({
  me: z.enum(["p0", "p1"]),
  pronom: z.enum(PRONOMS),
  guess: z.enum(GUESSES),
  goal: z.enum(GOALS),
  /** Des captures : son prénom (il n’y est que « Moi ») */
  prenom: z.string().trim().min(1).max(PRENOM_MAX).optional(),
  /** Des captures dont la lecture n’a pas lu le nom de l’autre : le sien */
  prenomAutre: z.string().trim().min(1).max(PRENOM_MAX).optional(),
});

/** Qui tu es dans la conv : l’`id` de l’un de ses deux participants (Story.participants), « p0 » ou « p1 ». */
export type Moi = z.output<typeof Qui>["me"];

/** Ce qu’on partage en image : une réponse de BLUSH (son échange), ou la chute d’un chapitre (sa place). */
const Cible = z.discriminatedUnion("type", [
  /* Une réponse de BLUSH dans le chat : l’échange (l’id de ton message) */
  z.object({ type: z.literal("reponse"), echange: z.number().int().positive() }),
  /* La chute d’un chapitre du rapport : le chapitre, et la place du bloc dedans */
  z.object({ type: z.literal("moment"), chapitre: z.number().int().min(1).max(20), bloc: z.number().int().min(0).max(80) }),
]);
export type CibleImage = z.input<typeof Cible>;

/* ———— Le serveur MCP et son OAuth (src/server/mcp) : Claude lit /admin ———— */

/** Une réponse JSON-RPC du serveur MCP (POST /api/mcp) : son résultat, ou son erreur. */
export type ReponseRpc = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };
/** Un refus de l’OAuth (RFC 6749 §5.2, RFC 7591 §3.2.2) : son code et sa description, la forme que Claude attend. */
type ErreurOAuth = { error: string; error_description: string };
/** Un client enregistré (RFC 7591) : son secret, cette seule fois (aucun pour un client public). */
export type ClientOAuth = {
  client_id: string;
  client_id_issued_at: number;
  client_secret?: string;
  client_secret_expires_at?: 0;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: MethodeClientOAuth;
  grant_types: ["authorization_code", "refresh_token"];
  response_types: ["code"];
};
/** Les jetons de /api/oauth/jeton. */
export type JetonOAuth = ReturnType<typeof reponseDeJeton>;

/** Les paramètres d’une demande d’autorisation, tels que la page de consentement (/admin/connecter) les a reçus. */
const ParametresDAutorisation = z.strictObject({
  response_type: z.string().max(40).optional(),
  client_id: z.string().max(200).optional(),
  redirect_uri: z.string().max(2048).optional(),
  code_challenge: z.string().max(200).optional(),
  code_challenge_method: z.string().max(20).optional(),
  state: z.string().max(2048).optional(),
  scope: z.string().max(400).optional(),
  resource: z.string().max(2048).optional(),
});

/* ———— La table des routes ———— */

/**
 * Ce que chaque route répond en cas de succès (en 200, sauf dit autrement), par sa clé « MÉTHODE /api/… ». Ses erreurs :
 * `{ erreur }` (ReponseErreur), avec le statut de son code. `Blob` : un audio, une image ou un PDF, pas du JSON.
 */
type Reponses = {
  "POST /api/admin": GesteDeLEquipe;
  "GET /api/admin/direct": Direct;
  /** Une conv de tournage préparée (ou retrouvée par sa `ref` : `nouvelle` faux), sa lecture lancée. */
  "POST /api/admin/tournage": { id: string; nouvelle: boolean; statut: StatutDuTournage };
  "GET /api/admin/tournage/[id]": ConvDeTournage;
  "POST /api/admin/tournage/[id]/arreter": { arretee: boolean };
  "GET /api/analyse": AnalysisProgress;
  "POST /api/analyse": Ok;
  "POST /api/attente": Ok;
  "POST /api/attente/retrait": Ok;
  /** Le dernier code demandé dans ce navigateur est-il revenu (son adresse n’existe pas) ? */
  "GET /api/auth/code": { revenu: boolean };
  "POST /api/auth/code": { email: string };
  "POST /api/auth/deconnexion": Ok;
  /** Un mauvais code : `{ ok: false }`, en 200, la même réponse pour tous. */
  "POST /api/auth/verifier": { ok: false } | { ok: true; email: string };
  /** Le laissez-passer du CAPTCHA, posé en cookie (src/server/captcha.ts). */
  "POST /api/captcha": Ok;
  "POST /api/captures": ConvImportee & { messagesRead: number };
  /** La lecture brute d’un lot : le navigateur ne la lit pas, il la rend à /api/captures/video. */
  "POST /api/captures/lot": { lot: unknown };
  "POST /api/captures/video": ConvImportee & { messagesRead: number };
  "GET /api/achats": { achats: AchatDuCompte[] };
  "GET /api/chat": HistoriqueChat;
  /** D’un bloc ; en flux, quand le navigateur le demande (Accept), une ligne JSON par événement (EvenementChat, src/types). */
  "POST /api/chat": BlushAnswer;
  "POST /api/chat/vocal": { modeVocal: boolean };
  /** La réponse verrouillée, payée (par la recharge, ou son coût débité) : en entier, avec ce qu’elle a coûté et ce qu’il reste. */
  "POST /api/chat/debloquer": BlushAnswer;
  "POST /api/chat/vente": Ok;
  "GET /api/compte": Account;
  "DELETE /api/compte": Ok;
  /** Ce que la purge de la nuit a effacé. */
  "GET /api/cron/chaine": Ok;
  "GET /api/cron/purge": { brouillons: number; convs: number; sessions: number };
  "GET /api/cron/relances": PassageDesRelances & { chaines: number; prises: number; sequences: number };
  "POST /api/desinscription": Ok;
  "POST /api/desinscription/un-clic": Ok;
  /** Le webhook de Resend (ce qui arrive aux mails), hors de la garde commune : sa signature (401 « interdit » sinon). */
  "POST /api/mails/resend": Ok;
  "GET /api/fiche": Fiche;
  "PUT /api/fiche": Fiche;
  "POST /api/fiche": FicheUpdate;
  "PUT /api/fiche/pronom": Fiche;
  "GET /api/histoire": Story;
  "DELETE /api/histoire": Ok;
  "POST /api/import": ConvImportee;
  "POST /api/paiement": PaiementCommence;
  "GET /api/paiement/feuille": FeuilleDuPaiement;
  "POST /api/paiement/avance": { achat: string };
  "GET /api/paiement/[achat]": EtatAchat;
  "POST /api/paiement/offre": OffreUniqueMontree;
  "POST /api/paiement/factice": WebhookDuFauxWhop;
  /** Le webhook de Whop, hors de la garde commune : sa signature (401 « interdit » sinon). */
  "POST /api/paiement/whop": Ok;
  /** `v` : la version de l’image story, gardée par le CDN à cette adresse (`/v/<id>/image?format=story&v=<v>`). */
  "POST /api/partage": { id: string; verdict: VerdictMontre; v: string };
  "DELETE /api/partage": { id: null };
  "POST /api/partage/compte": Ok;
  /** L’image story (PNG). */
  "POST /api/partage/image": Blob;
  "GET /api/rapport": ReportPayload;
  "POST /api/rapport": ReportPayload;
  /** Le rapport en PDF, tel que la lecture le rend à ce compte. */
  "GET /api/rapport/pdf": Blob;
  /** `{ ok: false }` en 503 : la base ne répond pas. */
  "POST /api/presence": Ok;
  /** Toujours `{ ok: true }` : un jalon ignoré (la limite d’une adresse, le mode tournage) ne se dit pas. */
  "POST /api/jalon": Ok;
  /** Le nom du lien de tournage de ce navigateur, pour un compte de BLUSH_ADMINS seulement ; null pour tous les autres. */
  "GET /api/tournage/repere": { nom: string | null };
  /** Toujours `{ ok: true }` : une erreur ignorée (la limite d’une adresse) ne se dit pas. */
  "POST /api/navigateur/erreur": Ok;
  "POST /api/navigateur/mesures": Ok;
  /** Le serveur MCP : une réponse JSON-RPC (202 sans corps pour une notification), ou 401 « interdit » et son défi OAuth. */
  "POST /api/mcp": ReponseRpc;
  /** Les métadonnées de la ressource (RFC 9728), aussi à /.well-known/oauth-protected-resource (next.config.ts). */
  "GET /api/mcp/metadonnees": ReturnType<typeof metadonneesDeLaRessource>;
  /** Les métadonnées du serveur d’autorisation (RFC 8414), aussi à /.well-known/oauth-authorization-server. */
  "GET /api/oauth/metadonnees": ReturnType<typeof metadonneesDuServeur>;
  /** Un client enregistré, en 201 ; un refus de l’OAuth en 400 (ou 429 : trop d’enregistrements). */
  "POST /api/oauth/enregistrement": ClientOAuth | ErreurOAuth;
  "POST /api/oauth/jeton": JetonOAuth | ErreurOAuth;
  /** Toujours `{}` en 200 pour une demande bien formée (RFC 7009 : rien ne dit si le jeton existait). */
  "POST /api/oauth/revocation": Record<string, never> | ErreurOAuth;
  /** La page de consentement autorise : où renvoyer le navigateur (le retour du client, avec son code). */
  "POST /api/oauth/autoriser": { redirection: string };
  "GET /api/reveil": { ok: boolean };
  "POST /api/roue": RoueDuCompte;
  /** L’audio du vocal du rapport (MP3). */
  "GET /api/vocal/audio": Blob;
  /** L’audio d’une réponse du chat dite en vocal (MP3). */
  "GET /api/vocal/chat/[id]": Blob;
  "POST /api/vocal/ecoute": Ok;
};

/** Ce qu’une route reçoit : un corps JSON (son schéma), un formulaire (des fichiers, lus par formData()), les deux, ou rien. */
type Entree = { corps?: z.ZodType; formulaire?: true };

/**
 * La table des routes, à l’exécution : ce que chacune reçoit. Une route sans corps reçoit tout au plus une requête
 * (`?avant=`, `?conv=`) ou des en-têtes. Ce qu’elle répond n’est qu’un type (Reponses) : rien de plus à embarquer.
 * La route lit son corps par ce schéma (lireCorps), qu’elle peut resserrer de ce que seul le serveur sait vérifier.
 */
export const ROUTES = {
  /*
   * Un geste de l’équipe (/admin) : des bulles à un compte (1 à 1 000), le rapport de sa dernière conv ou de toutes, un
   * lot de la liste d’attente à inviter (INVITATIONS_PAR_LOT au plus), une conv de tournage à créer (une conv de son
   * compte, et un nom) ou à arrêter. L’email se vérifie sur le serveur (Email)
   */
  "POST /api/admin": {
    corps: z.discriminatedUnion("action", [
      z.object({ action: z.literal("bulles"), email: z.string(), n: z.number().int().min(1).max(1000) }),
      z.object({ action: z.literal("debloquer"), email: z.string(), cible: z.enum(["derniere", "toutes"]) }),
      z.object({ action: z.literal("inviter"), n: z.number().int().min(1).max(INVITATIONS_PAR_LOT) }),
      z.object({ action: z.literal("tournage"), conv: z.string().max(64), nom: z.string().trim().min(1).max(NOM_TOURNAGE_MAX) }),
      z.object({ action: z.literal("tournage_arret"), id: z.string().max(64) }),
    ]),
  },
  "GET /api/admin/direct": {},
  /*
   * L’API du mode tournage, pour l’outil des créatrices (sa clé : Authorization: Bearer BLUSH_TOURNAGE_CLE) : un lien à
   * préparer depuis le .txt de la créatrice (son nom, le fichier, son prénom dans le fichier, ses réponses à « Qui
   * es-tu ? », et sa mission : `ref`), puis son statut, et l’arrêter
   */
  "POST /api/admin/tournage": {
    corps: z.object({
      nom: z.string().trim().min(1).max(NOM_TOURNAGE_MAX),
      fichier: z.string().min(1),
      moi: z.string().trim().min(1).max(PRENOM_MAX),
      pronom: z.enum(PRONOMS).default("elle"),
      devinette: z.enum(GUESSES).default("vus"),
      objectif: z.enum(GOALS).default("ensemble"),
      ref: z.string().trim().min(1).max(200).optional(),
    }),
  },
  "GET /api/admin/tournage/[id]": {},
  "POST /api/admin/tournage/[id]/arreter": {},
  "GET /api/analyse": {},
  /* « Qui es-tu ? » rempli (depuis /qui, ou le code reçu par email), ou rien : une relance, depuis l’écran de lecture */
  "POST /api/analyse": { corps: z.union([Qui, z.strictObject({})]) },
  /* Un email : sa forme se vérifie sur le serveur (Email, src/server/auth.ts) */
  "POST /api/attente": { corps: z.object({ email: z.string() }) },
  /* Le lien signé de son mail */
  "POST /api/attente/retrait": { corps: z.object({ id: z.string(), cle: z.string() }) },
  "GET /api/auth/code": {},
  "POST /api/auth/code": { corps: z.object({ email: z.string() }) },
  /* `partout` : toutes les sessions du compte ; sans, celle de cet appareil */
  "POST /api/auth/deconnexion": { corps: z.object({ partout: z.boolean().optional() }) },
  /* Le code reçu, et l’email à qui il a été envoyé */
  "POST /api/auth/verifier": { corps: z.object({ email: z.string(), code: z.string() }) },
  /* Le jeton du widget voyage dans l’en-tête x-blush-captcha (ENTETE_CAPTCHA, src/lib/captcha.ts), comme à la demande de code */
  "POST /api/captcha": {},
  "POST /api/captures": { formulaire: true },
  "POST /api/captures/lot": { formulaire: true },
  /*
   * Les lots lus (/api/captures/lot), rendus tels quels : le serveur les revérifie, appli comprise. `cle` : celle de
   * l’envoi, pour qu’un nouvel essai après une coupure retrouve l’histoire déjà créée. `consentement` : la version de la
   * case de l’import cochée (src/server/juridique.ts) ; sans elle, 422 `consentement`. `mode: "ajout"` : un morceau de
   * plus pour la conv qu’on importe (src/server/morceaux.ts)
   */
  "POST /api/captures/video": {
    corps: z.object({
      app: z.string(),
      lots: z.array(z.unknown()),
      cle: z.string().max(64).optional(),
      consentement: z.string().max(40).optional(),
      mode: z.literal("ajout").optional(),
    }),
  },
  "GET /api/achats": {},
  "GET /api/chat": {},
  /*
   * Un message en texte ; des captures, un export ou un vocal partent en formulaire. `question` : la question du rapport
   * (« Ta question »), en texte seulement : une réponse du chat comme une autre
   */
  /* `cle` : la clé de l’envoi, prise une fois par message par le navigateur et renvoyée telle quelle par « Réessayer » */
  "POST /api/chat": { corps: z.object({ texte: z.string(), question: z.literal(true).optional(), cle: z.string().uuid().optional() }), formulaire: true },
  "POST /api/chat/vocal": { corps: z.object({ actif: z.boolean() }) },
  /* La réponse verrouillée à lire : son message (BlushAnswer.verrouillee) */
  "POST /api/chat/debloquer": { corps: z.object({ message: z.number().int().positive() }) },
  /* Une carte d’achat du chat (src/server/vente.ts) : son bouton touché, ou « Pas maintenant » */
  "POST /api/chat/vente": { corps: z.object({ evenement: z.enum(["touchee", "refusee"]), genre: z.enum(GENRES_VENDUS) }) },
  "GET /api/compte": {},
  "DELETE /api/compte": {},
  /* Le relais de la chaîne (src/server/relais.ts) : `?histoire=<uuid>&relais=<rang>`, avec le secret CRON_SECRET */
  "GET /api/cron/chaine": {},
  "GET /api/cron/purge": {},
  "GET /api/cron/relances": {},
  /* Le lien signé d’un mail, et ce qu’il coupe (les liens d’avant les séquences : les offres) */
  "POST /api/desinscription": { corps: z.object({ id: z.string(), cle: z.string(), quoi: z.enum(DESINSCRIPTIONS).default("offres") }) },
  /* La messagerie elle-même (RFC 8058) : le lien signé est dans l’adresse, le corps ne dit rien */
  "POST /api/desinscription/un-clic": {},
  /* Resend lui-même : le corps se lit brut (la signature porte sur ses octets), src/server/delivrabilite.ts le lit */
  "POST /api/mails/resend": {},
  "GET /api/fiche": {},
  /* Sa fiche corrigée : la liste entière de ses faits */
  "PUT /api/fiche": {
    corps: z.object({ facts: z.array(z.object({ section: z.enum(SECTIONS_FICHE), text: z.string().trim().min(1).max(200) }).passthrough()).max(60) }),
  },
  "POST /api/fiche": { formulaire: true },
  /* Le pronom de l’autre, corrigé sur sa fiche */
  "PUT /api/fiche/pronom": { corps: z.object({ pronom: z.enum(PRONOMS) }) },
  "GET /api/histoire": {},
  "DELETE /api/histoire": {},
  "POST /api/import": { formulaire: true },
  /*
   * L’offre à payer, la conv dont elle débloque le rapport (sans : celle de la page), et la renonciation au délai
   * de rétractation (le geste de payer la donne) : la version de son texte (CASE_RENONCIATION.version), gardée avec l’achat. Sans elle, ou
   * une version qui n’est plus la bonne (dont l’ancien `true` d’un onglet ouvert avant la version) : 422 « renonciation »,
   * rien ne part. `jeton` : le jeton de confirmation des Elements de Whop (ctok_…), le paiement dans la feuille
   */
  "POST /api/paiement": {
    corps: z.object({
      offre: z.enum(OFFRES),
      conv: z.string().uuid().optional(),
      renonciation: z.union([z.string().max(40), z.boolean()]).optional(),
      jeton: z
        .string()
        .regex(/^ctok_[A-Za-z0-9_-]{1,200}$/)
        .optional(),
      /* Une recharge payée en un geste depuis le chat, avec la carte gardée : seulement quand l’écran le demande */
      geste: z.literal(true).optional(),
      /* La carte du chat d’où il se paie (src/server/vente.ts), notée avec l’achat pour /admin */
      vente: z.enum(GENRES_VENDUS).optional(),
    }),
  },
  "GET /api/paiement/feuille": {},
  /* Le rapport d’avance utilisé pour la conv du corps (sans : celle de la page), et la renonciation que ce geste donne, comme un paiement */
  "POST /api/paiement/avance": { corps: z.object({ conv: z.string().uuid().optional(), renonciation: z.union([z.string().max(40), z.boolean()]).optional() }) },
  /* `?paiement=pay_…` : le paiement que Whop a donné (au retour, ou dans la feuille), vérifié chez lui si le webhook tarde */
  "GET /api/paiement/[achat]": {},
  /* `achat` : pour ③, ⑤ et ⑥, l’achat du rapport qui vient d’être payé (« C’est débloqué ») */
  "POST /api/paiement/offre": { corps: z.object({ offre: z.enum(OFFRES_PROPOSEES), achat: z.string().uuid().optional() }) },
  "POST /api/paiement/factice": { corps: z.object({ achat: z.string().uuid(), issue: z.enum(ISSUES_DU_FAUX_WHOP) }) },
  /* Le corps brut, tel quel : sa signature porte sur ses octets (src/server/paiement/signature.ts) */
  "POST /api/paiement/whop": {},
  "POST /api/partage": {},
  "DELETE /api/partage": {},
  "POST /api/partage/compte": {},
  "POST /api/partage/image": { corps: Cible },
  "GET /api/rapport": {},
  "POST /api/rapport": {},
  /*
   * Le signe d’un onglet ouvert (src/lib/presence.ts) : son identifiant (tiré au hasard à l’ouverture de la page, jamais
   * gardé), l’écran, et à son premier signe d’où il vient (utm_source, le site d’avant)
   */
  "POST /api/presence": {
    corps: z.strictObject({
      onglet: z.uuid(),
      etape: z.enum(ETAPES_VISITE),
      premier: z.boolean(),
      utm: z.string().max(80).optional(),
      referent: z.string().max(200).optional(),
    }),
  },
  /** Un jalon du tunnel (src/lib/jalons.ts) : ce que le visiteur vient de faire (un fichier choisi, le paywall vu jusqu’aux avis…), rien d’autre */
  "POST /api/jalon": { corps: z.strictObject({ jalon: z.enum(JALONS) }) },
  "GET /api/tournage/repere": {},
  /** Une erreur du navigateur (src/lib/sentinelle.tsx) : son nom, son message, d’où elle vient, et l’écran. Bornés : le serveur masque le reste. */
  "POST /api/navigateur/erreur": {
    corps: z.strictObject({
      nom: z.string().max(200),
      message: z.string().max(2000),
      source: z.string().max(500).optional(),
      etape: z.enum(ETAPES_VISITE),
    }),
  },
  /** Les mesures de vitesse d’une page quittée (les Web Vitals) : l’écran, téléphone ou non, et une valeur par mesure. */
  "POST /api/navigateur/mesures": {
    corps: z.strictObject({
      etape: z.enum(ETAPES_VISITE),
      mobile: z.boolean(),
      mesures: z.array(z.strictObject({ metrique: z.enum(METRIQUES_WEB), valeur: z.number().finite().min(0).max(120_000) })).max(METRIQUES_WEB.length),
    }),
  },
  /* `?moi=` : qui est toi pour l’écran, quand le serveur ne le sait pas */
  "GET /api/rapport/pdf": {},
  /* Un message JSON-RPC (un objet : les lots ont quitté le protocole), lu par le protocole (src/server/mcp/protocole.ts) */
  "POST /api/mcp": { corps: z.looseObject({}) },
  "GET /api/mcp/metadonnees": {},
  "GET /api/oauth/metadonnees": {},
  /* Les métadonnées du client (RFC 7591), vérifiées par validerEnregistrement (src/server/mcp/oauth.ts) */
  "POST /api/oauth/enregistrement": { corps: z.looseObject({}) },
  /* RFC 6749 : en application/x-www-form-urlencoded, lu par formData() */
  "POST /api/oauth/jeton": { formulaire: true },
  "POST /api/oauth/revocation": { formulaire: true },
  /* Les paramètres de la demande, tels que la page les a reçus : la route la relit avant d’accorder quoi que ce soit */
  "POST /api/oauth/autoriser": { corps: ParametresDAutorisation },
  "GET /api/reveil": {},
  /* Tourner la roue du paywall, ou n’en pas vouloir : une fois par compte */
  "POST /api/roue": { corps: z.object({ geste: z.enum(GESTES_DE_LA_ROUE) }) },
  "GET /api/vocal/audio": {},
  "GET /api/vocal/chat/[id]": {},
  /* Un moment de l’écoute du vocal, et où elle en était (en secondes) */
  "POST /api/vocal/ecoute": { corps: z.object({ evenement: z.enum(EVENEMENTS_ECOUTE), position: z.number() }) },
} as const satisfies Record<keyof Reponses, Entree>;

/** Ce qu’une entrée laisse envoyer : son corps JSON (avant les transformations de son schéma), un formulaire, ou rien (never). */
type EnvoiDe<E extends Entree> = (E extends { corps: infer S extends z.ZodType } ? z.input<S> : never) | (E extends { formulaire: true } ? FormData : never);

/**
 * Le contrat de chaque route, par sa clé « MÉTHODE /api/… » : ce qu’on lui envoie (`corps`, never : rien) et ce qu’elle
 * répond (`reponse`). Le navigateur l’appelle sous ces types, le serveur y répond (repondre), et le compilateur relie les deux.
 */
export type Routes = { [K in keyof Reponses]: { corps: EnvoiDe<(typeof ROUTES)[K]>; reponse: Reponses[K] } };

/** La clé d’une route du contrat : « POST /api/analyse ». */
export type CleRoute = keyof Routes;

/** Les routes qui répondent du JSON. Les autres répondent un audio, une image ou un PDF (Blob), hors de repondre et d’appel. */
export type CleJson = { [K in CleRoute]: Routes[K]["reponse"] extends Blob ? never : K }[CleRoute];

/**
 * Les routes dont l’adresse est celle de leur clé, telle quelle : pas de segment à remplir (« [id] »). Le navigateur
 * n’appelle qu’elles par leur clé (requete, src/services/api.ts) : « /api/vocal/chat/[id] » n’est pas une adresse.
 */
export type CleFixe = Exclude<CleRoute, `${string}[${string}`>;

/**
 * Une requête de cette méthode modifie-t-elle quelque chose ? Tout sauf GET et HEAD : la garde commune des routes
 * (src/server/requete.ts) exige alors qu’elle vienne de l’appli, et les tests (garde-routes, l’e2e de la sécurité) en
 * tirent la liste des mutations de la table. Une seule définition pour les trois.
 */
export const estMutation = (methode: string) => !["GET", "HEAD"].includes(methode.toUpperCase());
