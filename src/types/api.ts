/*
 * Le contrat HTTP entre le navigateur et le back-end : ce que chaque route /api reçoit et ce qu’elle répond, et les types
 * qui passent sur le réseau. Sans server-only ni client-only. Le serveur en lit les schémas (lireCorps, src/server/http.ts)
 * et répond sous le type de sa ligne (repondre) ; le navigateur n’en importe que des types (appel, src/services/api.ts),
 * par `import type` : zod n’entre pas dans ses pages. Une route ajoutée, retirée, ou une méthode de plus change sa ligne
 * ici : tests/unit/contrat.test.ts compare la table aux routes de src/app/api, et vérifie ces imports.
 */
import { z } from "zod";
import { INVITATIONS_PAR_LOT, PRENOM_MAX } from "@/lib/limites";
import { EVENEMENTS_ECOUTE, GOALS, GUESSES, ISSUES_DU_FAUX_WHOP, OFFRES, OFFRES_PROPOSEES, PRONOMS, SECTIONS_FICHE } from "@/types";
import type { AnalysisProgress, BlushAnswer, Echec, Fiche, FicheUpdate, OffreId, OffreProposee, Report, SoberReport, Source, StatutAchat, Story, VocalRapport } from "@/types";
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
 * payer (celle de Whop, ou du faux Whop), ou null : payé en un geste (l’offre ③), l’achat se suit par
 * GET /api/paiement/[achat] jusqu’à sa livraison.
 */
export type PaiementCommence = { achat: string; checkout: string | null; url: string | null };

/**
 * Un achat du compte, pour « Tes achats » (GET /api/achats) : son offre, son prix TTC (en centimes), les bulles qu’il a
 * données, son statut, et quand (son paiement, une date ISO).
 */
export type AchatDuCompte = { id: string; offre: OffreId; centimes: number; bulles: number; statut: StatutAchat; le: string };

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

/**
 * Ce qu’un geste de l’équipe a fait (POST /api/admin), en nombres : le nouveau solde de bulles, les convs débloquées
 * (null : aucun compte pour cet email), ou un lot d’invitations (les mails partis, ceux qui restent à inviter, si le
 * plafond des mails du jour l’a arrêté, les adresses refusées par le prestataire des mails, et s’il l’a arrêté : LotInvite,
 * src/server/attente.ts).
 */
export type GesteDeLEquipe =
  | { action: "bulles"; solde: number | null }
  | { action: "debloquer"; convs: number | null }
  | { action: "inviter"; invites: number; restent: number; plafond: boolean; refusees: number; prestataire: boolean };

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

/* ———— La table des routes ———— */

/**
 * Ce que chaque route répond en cas de succès (en 200, sauf dit autrement), par sa clé « MÉTHODE /api/… ». Ses erreurs :
 * `{ erreur }` (ReponseErreur), avec le statut de son code. `Blob` : un audio ou une image, pas du JSON.
 */
type Reponses = {
  "POST /api/admin": GesteDeLEquipe;
  "GET /api/analyse": AnalysisProgress;
  "POST /api/analyse": Ok;
  "POST /api/attente": Ok;
  "POST /api/attente/retrait": Ok;
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
  "GET /api/compte": Account;
  "DELETE /api/compte": Ok;
  /** Ce que la purge de la nuit a effacé. */
  "GET /api/cron/purge": { brouillons: number; convs: number; sessions: number };
  "GET /api/cron/relances": PassageDesRelances;
  "POST /api/desinscription": Ok;
  "GET /api/fiche": Fiche;
  "PUT /api/fiche": Fiche;
  "POST /api/fiche": FicheUpdate;
  "GET /api/histoire": Story;
  "DELETE /api/histoire": Ok;
  "POST /api/import": ConvImportee;
  "POST /api/paiement": PaiementCommence;
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
  /** `{ ok: false }` en 503 : la base ne répond pas. */
  "GET /api/reveil": { ok: boolean };
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
   * Un geste de l’équipe (/admin) : des bulles à un compte (1 à 1 000), le rapport de sa dernière conv ou de toutes, ou
   * un lot de la liste d’attente à inviter (INVITATIONS_PAR_LOT au plus). L’email se vérifie sur le serveur (Email)
   */
  "POST /api/admin": {
    corps: z.discriminatedUnion("action", [
      z.object({ action: z.literal("bulles"), email: z.string(), n: z.number().int().min(1).max(1000) }),
      z.object({ action: z.literal("debloquer"), email: z.string(), cible: z.enum(["derniere", "toutes"]) }),
      z.object({ action: z.literal("inviter"), n: z.number().int().min(1).max(INVITATIONS_PAR_LOT) }),
    ]),
  },
  "GET /api/analyse": {},
  /* « Qui es-tu ? » rempli (depuis /qui, ou le code reçu par email), ou rien : une relance, depuis l’écran de lecture */
  "POST /api/analyse": { corps: z.union([Qui, z.strictObject({})]) },
  /* Un email : sa forme se vérifie sur le serveur (Email, src/server/auth.ts) */
  "POST /api/attente": { corps: z.object({ email: z.string() }) },
  /* Le lien signé de son mail */
  "POST /api/attente/retrait": { corps: z.object({ id: z.string(), cle: z.string() }) },
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
   * case de l’import cochée (src/server/juridique.ts) ; sans elle, 422 `consentement`
   */
  "POST /api/captures/video": {
    corps: z.object({ app: z.string(), lots: z.array(z.unknown()), cle: z.string().max(64).optional(), consentement: z.string().max(40).optional() }),
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
  "GET /api/compte": {},
  "DELETE /api/compte": {},
  "GET /api/cron/purge": {},
  "GET /api/cron/relances": {},
  /* Le lien signé de la relance */
  "POST /api/desinscription": { corps: z.object({ id: z.string(), cle: z.string() }) },
  "GET /api/fiche": {},
  /* Sa fiche corrigée : la liste entière de ses faits */
  "PUT /api/fiche": {
    corps: z.object({ facts: z.array(z.object({ section: z.enum(SECTIONS_FICHE), text: z.string().trim().min(1).max(200) }).passthrough()).max(60) }),
  },
  "POST /api/fiche": { formulaire: true },
  "GET /api/histoire": {},
  "DELETE /api/histoire": {},
  "POST /api/import": { formulaire: true },
  /*
   * L’offre à payer, la conv dont elle débloque le rapport (sans : celle de la page), et la case « je renonce à mon droit
   * de rétractation » cochée : la version de son texte (CASE_RENONCIATION.version), gardée avec l’achat. Sans elle, ou
   * une version qui n’est plus la bonne (dont l’ancien `true` d’un onglet ouvert avant la version) : 422 « renonciation »,
   * rien ne part
   */
  "POST /api/paiement": {
    corps: z.object({ offre: z.enum(OFFRES), conv: z.string().uuid().optional(), renonciation: z.union([z.string().max(40), z.boolean()]).optional() }),
  },
  /* `?paiement=pay_…` : le paiement que Whop a donné au retour, vérifié chez lui si le webhook tarde */
  "GET /api/paiement/[achat]": {},
  /* `achat` : pour ③, l’achat du rapport (ou de la suite) qui vient d’être payé (« C’est débloqué ») */
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
  "GET /api/reveil": {},
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

/** Les routes qui répondent du JSON. Les autres répondent un audio ou une image (Blob), hors de repondre et d’appel. */
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
