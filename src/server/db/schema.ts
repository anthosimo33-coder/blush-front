import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
/* En chemin relatif : drizzle-kit lit ce fichier hors de Next, sans l’alias @/ */
import {
  ETAPES_VISITE,
  EVENEMENTS_ECOUTE,
  FAMILLES_NAVIGATEUR,
  GENRES_FIL,
  GENRES_VENDUS,
  JALONS,
  LOTS_DE_LA_ROUE,
  METRIQUES_WEB,
  OFFRES,
  OFFRES_UNIQUES,
  SOURCES_VISITE,
  STATUTS_ACHAT,
  VOIX,
} from "../../types";
import {
  ACTIONS_EQUIPE,
  FOURNISSEURS_PAIEMENT,
  GENRES,
  GENRES_CHAINE,
  METHODES_CLIENT_OAUTH,
  RAISONS_BULLES,
  ROLES_CHAT,
  SOURCES_ATTENTE,
  STATUTS_TACHE,
  TYPES_EVENEMENTS_MAILS,
  type DetailEcriture,
} from "./enums";

/*
 * Le schéma de BLUSH. Règle : tout ce qui contient la conv, ou ce qu’on en a tiré, est dans une colonne
 * `bytea` chiffrée (src/server/chiffrement.ts). En clair, seulement ce qui ne dit rien de l’histoire :
 * des identifiants, des états, des dates, des compteurs.
 */
const chiffre = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
const quand = (nom: string) => timestamp(nom, { withTimezone: true });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  /**
   * L’accès d’avant le paiement (la bêta), par compte : plus rien ne le lit ni ne l’écrit. Seule l’étape des testeurs de
   * la bêta (RATTRAPAGE_BETA, scripts/base.mjs, après les migrations) s’en sert, une fois, pour leur donner leurs rapports et leurs
   * bulles. Elle reste déclarée tant que la version en ligne la nomme ; son retrait part dans un déploiement à part
   * (BACKEND.md, « Les migrations »), comme `paused`. Ses valeurs ne s’écrivent qu’ici.
   * TODO(produit): choisir quand retirer users.plan et users.paused (une migration seule, après la mise en ligne de ce code).
   */
  plan: text("plan", { enum: ["gratuit", "rapport", "blushplus"] })
    .notNull()
    .default("gratuit"),
  /** La pause de l’abonnement d’avant le paiement : plus rien ne la lit ni ne l’écrit (voir `plan`). */
  paused: boolean("paused").notNull().default(false),
  /**
   * Le solde de bulles : une réponse de BLUSH en coûte (src/contenu/offres.ts). Toujours changé dans la même transaction
   * qu’une ligne de mouvements_bulles (src/server/bulles.ts), et jamais sous zéro par une dépense ; un remboursement peut
   * l’y faire passer (le chat demande alors une recharge).
   */
  bulles: integer("bulles").notNull().default(0),
  /**
   * Le lien de désinscription d’un mail de relance (src/server/relances.ts) touché : l’heure. Plus aucune relance ne part
   * à ce compte ; les mails qu’il demande (son code, son rapport prêt) partent toujours.
   */
  relancesCoupeesLe: quand("relances_coupees_le"),
  /**
   * Le lien de désinscription d’un mail de conseils (les séquences après l’achat, src/server/sequences.ts : « il t’a
   * répondu ? », le vocal, le prochain pas, le chat endormi) touché : l’heure. Plus aucun conseil ne part à ce compte ;
   * les offres et les relances suivent `relancesCoupeesLe`, et les mails qu’il demande partent toujours.
   */
  conseilsCoupesLe: quand("conseils_coupes_le"),
  /**
   * Son code de parrainage (src/server/parrainage.ts) : le lien /p/<code> qu’elle donne à une amie. Créé la première fois
   * qu’on le lui montre ; rien de la conv, rien de son email.
   */
  codeParrainage: text("code_parrainage").unique(),
  /**
   * La marraine : le compte dont le lien de parrainage a mené à la création de ce compte (le cookie de /p/<code>), ou
   * null. Au premier rapport payé de ce compte, chacune reçoit ses bulles (src/server/parrainage.ts).
   */
  parrainId: uuid("parrain_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  /**
   * D’où il est venu (SOURCES_VISITE) : la source de sa visite du jour, retrouvée à la création du compte par l’empreinte
   * anonyme de sa connexion (src/server/visites.ts). null : un compte d’avant le suivi des visites, ou sa visite pas
   * retrouvée. Le tableau de bord en tire les ventes par source.
   */
  source: text("source", { enum: SOURCES_VISITE }),
  /**
   * « Quitter le mode tournage » touché, connecté à ce compte : l’heure. Ses prises d’avant ne font plus de lui le compte
   * d’une créatrice, à qui une vraie lecture est refusée (src/server/tournage.ts, estCreatrice) ; une nouvelle prise, si.
   */
  tournageQuitteLe: quand("tournage_quitte_le"),
  createdAt: quand("created_at").notNull().defaultNow(),
});

/** Une session : l’empreinte du jeton du cookie, jamais le jeton. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: quand("expires_at").notNull(),
    createdAt: quand("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/**
 * Un code de connexion par email et par navigateur : son empreinte, sa date limite, les essais. Le code ne vaut que dans
 * le navigateur qui l’a demandé : `navigateur` est l’empreinte du jeton de son cookie (src/server/auth.ts).
 */
export const loginCodes = pgTable(
  "login_codes",
  {
    email: text("email").notNull(),
    navigateur: text("navigateur").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: quand("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: quand("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.email, t.navigateur] })],
);

/**
 * Une histoire : une conv importée. D’abord un brouillon anonyme (avant l’email), puis rattachée à un compte.
 * `meta` : les participants, qui est qui, les pronoms, la devinette, l’objectif, les sources.
 * `conv` : l’export brut, effacé dès le rapport et la mémoire faits (ou après 30 jours).
 * `context` : ce qu’on garde de la conv une fois effacée (les blocs <chiffres> et <style>, la date de fin).
 */
export const stories = pgTable(
  "stories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** Empreinte du jeton du cookie de brouillon, tant que l’histoire n’a pas de compte. */
    draftToken: text("draft_token").unique(),
    /**
     * Ni lue ni écrite (la base y met son défaut) : rien ne la lit plus. Elle reste déclarée tant que la version en ligne
     * la nomme dans ses requêtes ; sa migration de retrait part à un déploiement à part (BACKEND.md, « Les migrations »).
     * TODO(produit): choisir quand retirer stories.status (une migration seule, après la mise en ligne de ce code).
     */
    status: text("status").notNull().default("brouillon"),
    messageCount: integer("message_count").notNull(),
    /** Le prochain numéro libre pour les messages ajoutés après l’import (m1074…), réservé d’un coup, sans doublon. */
    nextMessage: integer("next_message"),
    meta: chiffre("meta").notNull(),
    conv: chiffre("conv"),
    context: chiffre("context"),
    convPurgedAt: quand("conv_purged_at"),
    /** Le chat en vocal : il a demandé à BLUSH de lui parler en vocal (jusqu’à ce qu’il repasse à l’écrit). */
    chatVocal: boolean("chat_vocal").notNull().default(false),
    /**
     * La question incluse avec le rapport, d’avant les bulles : plus rien ne la lit ni ne l’écrit (« Ta question » est une
     * réponse du chat comme une autre). Elle reste déclarée tant que la version en ligne la nomme ; son retrait part dans
     * un déploiement à part (BACKEND.md, « Les migrations »).
     * TODO(produit): choisir quand retirer stories.question_prise (une migration seule, après la mise en ligne de ce code).
     */
    questionPrise: quand("question_prise"),
    /**
     * Le rapport de cette conv est débloqué (payé, offert par l’équipe, ou donné aux testeurs de la bêta) : l’heure. null :
     * le chapitre 1 seul. Remis à null quand l’achat qui l’a débloqué est remboursé ou contesté (src/server/achats.ts).
     */
    debloqueLe: quand("debloque_le"),
    /**
     * L’accord de l’import (sa ligne au-dessus du bouton, src/contenu/consentements.ts) : l’heure où la conv est
     * arrivée avec lui, et la version de son texte. Toute conv importée par l’API l’a (src/server/juridique.ts) ;
     * vides pour les convs d’avant l’accord.
     */
    consentementLe: quand("consentement_le"),
    consentementVersion: text("consentement_version"),
    /**
     * Le mode tournage (src/server/tournage.ts) : la conv de tournage dont cette conv est une prise. Posé sur le brouillon
     * de captures importées en mode tournage (sans conv brute : rien n’est lu), ou à la relecture. null : une conv comme
     * une autre, ou sa conv de tournage effacée depuis (`tournageLe` le dit encore).
     */
    tournageId: uuid("tournage_id").references((): AnyPgColumn => tournages.id, { onDelete: "set null" }),
    /**
     * L’heure où la lecture déjà faite de la conv de tournage a été recopiée ici : l’écran de lecture la rejoue à partir
     * de là, sans modèle, et la chaîne des tâches ne lance plus rien pour cette conv (src/server/pipeline.ts, executer).
     */
    tournageLe: quand("tournage_le"),
    createdAt: quand("created_at").notNull().defaultNow(),
    updatedAt: quand("updated_at").notNull().defaultNow(),
  },
  (t) => [index("stories_user_idx").on(t.userId), index("stories_tournage_idx").on(t.tournageId)],
);

/**
 * Une conv de tournage (src/server/tournage.ts) : une conv de l’équipe, lue une fois par le vrai modèle, que le lien de
 * tournage rejoue chez les créatrices, sans modèle, autant de fois qu’il faut. `cle` : le secret du lien (chiffré, pour
 * que /admin le remontre) ; `cleHash` : son empreinte, par laquelle le lien la retrouve. Arrêtée (`arreteLe`), son lien ne
 * pose plus le mode tournage ; les prises déjà faites restent lisibles.
 */
export const tournages = pgTable("tournages", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Son nom dans /admin (la campagne : « A · Il répond plus pareil »). Jamais montré aux créatrices au-delà de leur page du mode tournage. */
  nom: text("nom").notNull(),
  /** La conv lue une fois, celle qu’on rejoue : l’effacer efface la conv de tournage. */
  storyId: uuid("story_id")
    .notNull()
    .references(() => stories.id, { onDelete: "cascade" }),
  cle: chiffre("cle").notNull(),
  cleHash: text("cle_hash").notNull().unique(),
  /** Le compte de l’équipe qui l’a créée (null : effacé depuis, ou créée par l’API du tournage). */
  creeParId: uuid("cree_par_id").references(() => users.id, { onDelete: "set null" }),
  /**
   * La référence que l’outil des créatrices lui a donnée (POST /api/admin/tournage, `ref` : sa mission) : la même rend la
   * même conv de tournage, sans la relire (un double clic, un nouvel essai après une coupure ne paient pas deux lectures).
   */
  ref: text("ref").unique(),
  arreteLe: quand("arrete_le"),
  creeLe: quand("cree_le").notNull().defaultNow(),
});

/** Le verdict de l’histoire (prompt 04) et ses scores, chiffrés. */
export const verdicts = pgTable("verdicts", {
  storyId: uuid("story_id")
    .primaryKey()
    .references(() => stories.id, { onDelete: "cascade" }),
  data: chiffre("data").notNull(),
  createdAt: quand("created_at").notNull().defaultNow(),
});

/** Le rapport (prompt 05), chiffré : son plan, puis le rapport assemblé. */
export const reports = pgTable("reports", {
  storyId: uuid("story_id")
    .primaryKey()
    .references(() => stories.id, { onDelete: "cascade" }),
  /** Le plan (étape 1), puis le rapport assemblé. */
  plan: chiffre("plan"),
  data: chiffre("data"),
  /** Pendant l’écriture : les chapitres déjà finis, prêts à lire (effacés une fois le rapport assemblé). */
  partiel: chiffre("partiel"),
  createdAt: quand("created_at").notNull().defaultNow(),
  updatedAt: quand("updated_at").notNull().defaultNow(),
});

/** La mémoire (prompt 07), chiffrée, avec sa fiche et les messages qu’elle cite. `version` : contre les écritures croisées. */
export const memories = pgTable("memories", {
  storyId: uuid("story_id")
    .primaryKey()
    .references(() => stories.id, { onDelete: "cascade" }),
  data: chiffre("data").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: quand("updated_at").notNull().defaultNow(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES_CHAT }).notNull(),
    data: chiffre("data").notNull(),
    /**
     * Ce que la réponse de BLUSH a coûté (ou coûtera, verrouillée), en bulles ; null : offerte (une alerte, une réponse
     * verrouillée payée par une recharge), ou d’avant les bulles.
     */
    cout: integer("cout"),
    /**
     * Une réponse de BLUSH écrite à 0 bulle : gardée (chiffrée dans `data`, comme toutes), mais ce qui se paie n’est jamais
     * envoyé au navigateur avant (sa lecture, si elle a une réponse à envoyer, se lit en clair). Une recharge payée après
     * elle la débloque sans débit ; d’autres bulles, en débitant son `cout` (src/server/bulles.ts, deverrouiller).
     */
    verrouillee: boolean("verrouillee").notNull().default(false),
    createdAt: quand("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("chat_messages_story_idx").on(t.storyId, t.id),
    /* Les réponses verrouillées en attente : une par compte au plus (src/server/bulles.ts), trouvée sans parcourir le chat */
    index("chat_messages_verrouillees_idx")
      .on(t.storyId)
      .where(sql`${t.verrouillee}`),
  ],
);

/**
 * Les tâches longues (le verdict, le plan du rapport, ses chapitres, le vocal, la mémoire, une mise à jour de la
 * mémoire), exécutées après la réponse HTTP. `heartbeatAt` périmé = tâche abandonnée, qu’on peut relancer (BACKEND.md,
 * « Les tâches »).
 */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: GENRES }).notNull(),
    status: text("status", { enum: STATUTS_TACHE }).notNull().default("attente"),
    attempts: integer("attempts").notNull().default(0),
    /** Ce dont la tâche a besoin (par exemple l’échange à retenir), chiffré. */
    input: chiffre("input"),
    /** Le code d’erreur, jamais de contenu. */
    error: text("error"),
    /** L’avancée de 0 à 100, d’après ce que le modèle a déjà écrit (le verdict, suivi en direct par la lecture). */
    progress: integer("progress").notNull().default(0),
    /** Le détail de l’avancée (les chapitres du rapport : écrits, en cours), des numéros seulement, jamais de contenu. */
    detail: jsonb("detail").$type<DetailEcriture>(),
    heartbeatAt: quand("heartbeat_at"),
    /**
     * Une mise à jour de la mémoire groupée (memoire_maj) ne part pas avant cette heure : le chat se calme d’abord
     * (src/server/memoire-groupee.ts). Null : elle part tout de suite, comme toute autre tâche.
     */
    pasAvant: quand("pas_avant"),
    createdAt: quand("created_at").notNull().defaultNow(),
    updatedAt: quand("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("tasks_story_idx").on(t.storyId, t.kind),
    /*
     * Une seule étape de la chaîne en attente ou en cours par histoire : deux déblocages, deux onglets ou deux relances
     * en même temps ne font pas écrire (et payer) deux rapports. Les mises à jour de la mémoire, elles, s’empilent.
     */
    uniqueIndex("tasks_une_par_etape")
      .on(t.storyId, t.kind)
      .where(sql`${t.status} in ('attente', 'en_cours') and ${t.kind} in (${sql.raw(GENRES_CHAINE.map((g) => `'${g}'`).join(", "))})`),
  ],
);

/**
 * Un verdict partagé : le lien public (/v/<id>) qui montre le verdict seul, le prénom de l’autre masqué, jamais la conv.
 * Un lien par histoire ; le désactiver efface la ligne (le lien ne montre plus rien), supprimer l’histoire aussi.
 */
export const shares = pgTable("shares", {
  id: text("id").primaryKey(),
  storyId: uuid("story_id")
    .notNull()
    .unique()
    .references(() => stories.id, { onDelete: "cascade" }),
  /** Ce que montre le lien (l’emoji, le titre et le sous-titre du verdict, le prénom de l’autre masqué), chiffré. */
  data: chiffre("data").notNull(),
  createdAt: quand("created_at").notNull().defaultNow(),
});

/**
 * Des compteurs par jour (heure de Paris), pour le tableau de bord : ce que les tables ne gardent pas, comme les
 * visites d’un lien partagé. Un nom et un nombre, jamais de contenu, ni d’email, ni d’adresse IP.
 */
export const counters = pgTable(
  "counters",
  {
    day: date("day").notNull(),
    key: text("key").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.key] })],
);

/**
 * Le vocal du rapport : le script minuté (ce que dit BLUSH, quand, les messages qu’elle cite) et l’audio, chiffrés.
 * `voix` : celle de l’A/B test (A ou B), en clair, comme la durée : ils ne disent rien de l’histoire.
 */
export const vocals = pgTable("vocals", {
  storyId: uuid("story_id")
    .primaryKey()
    .references(() => stories.id, { onDelete: "cascade" }),
  voix: text("voix", { enum: VOIX }).notNull(),
  data: chiffre("data").notNull(),
  audio: chiffre("audio").notNull(),
  dureeMs: integer("duree_ms").notNull(),
  createdAt: quand("created_at").notNull().defaultNow(),
});

/** Les réponses du chat dites en vocal : l’audio, chiffré (le texte est dans le message du chat). */
export const chatVocals = pgTable(
  "chat_vocals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    voix: text("voix", { enum: VOIX }).notNull(),
    audio: chiffre("audio").notNull(),
    dureeMs: integer("duree_ms").notNull(),
    createdAt: quand("created_at").notNull().defaultNow(),
  },
  (t) => [index("chat_vocals_story_idx").on(t.storyId)],
);

/** Comment on écoute le vocal, pour comparer les deux voix : des événements, une position, jamais de contenu. */
export const vocalEcoutes = pgTable(
  "vocal_ecoutes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    voix: text("voix", { enum: VOIX }).notNull(),
    evenement: text("evenement", { enum: EVENEMENTS_ECOUTE }).notNull(),
    /** Où en était l’écoute, en millisecondes. */
    positionMs: integer("position_ms").notNull().default(0),
    createdAt: quand("created_at").notNull().defaultNow(),
  },
  /* Par histoire aussi : supprimer une histoire efface ses écoutes, sans parcourir toute la table */
  (t) => [index("vocal_ecoutes_voix_idx").on(t.voix, t.evenement), index("vocal_ecoutes_story_idx").on(t.storyId)],
);

/**
 * La liste d’attente de la bêta fermée : l’email chiffré, et son empreinte pour ne l’inscrire qu’une fois. `invite_le` :
 * l’équipe l’a invité depuis /admin (src/server/attente.ts, inviterLaListe) et le mail « Ta place est prête » est parti ;
 * en bêta fermée, il entre alors comme un invité de BLUSH_ACCES_LIBRE, sans en avoir les droits (il paie).
 */
export const waitlist = pgTable(
  "waitlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailHash: text("email_hash").notNull().unique(),
    email: chiffre("email").notNull(),
    source: text("source", { enum: SOURCES_ATTENTE }).notNull(),
    inviteLe: quand("invite_le"),
    createdAt: quand("created_at").notNull().defaultNow(),
  },
  /* Les prochains à inviter, du plus ancien au plus récent */
  (t) => [
    index("waitlist_a_inviter_idx")
      .on(t.createdAt)
      .where(sql`${t.inviteLe} is null`),
  ],
);

/** Les limites (codes envoyés, imports, messages au chat) : une fenêtre et un compteur par clé. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: quand("window_start").notNull(),
  count: integer("count").notNull().default(0),
  /**
   * La fin de la fenêtre en cours (window_start + sa durée), écrite par compter() : la purge efface une clé après elle,
   * jamais avant (le compteur du mois de la voix vit 40 jours). Vide sur les lignes d’avant la colonne : la purge s’y
   * règle alors sur window_start, comme avant.
   */
  expiresAt: quand("expires_at"),
});

/** Ce que coûte chaque appel au modèle. Aucun contenu. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    storyId: uuid("story_id").references(() => stories.id, { onDelete: "set null" }),
    task: text("task").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    /** En millionièmes de dollar. */
    costMicros: integer("cost_micros").notNull().default(0),
    ms: integer("ms").notNull().default(0),
    createdAt: quand("created_at").notNull().defaultNow(),
  },
  /*
   * Supprimer une histoire met ses lignes à vide (set null) : sans index, toute la table serait parcourue. La dépense du
   * jour (src/server/budget.ts) et le tableau de bord (src/server/stats.ts) la lisent par date.
   */
  (t) => [index("ai_usage_story_idx").on(t.storyId), index("ai_usage_created_idx").on(t.createdAt)],
);

/**
 * Un achat : une offre du catalogue (src/contenu/offres.ts), commandée puis payée une fois, par Whop (ou le faux Whop des
 * tests). Le prix et les bulles sont figés à la commande, d’après le catalogue du serveur. Rien de la conv : seulement
 * laquelle il débloque (`story_id`, vide pour des bulles seules). Un compte effacé laisse ses achats sans compte (les
 * ventes, les remboursements à rapprocher) ; une conv effacée, sans conv.
 */
export const achats = pgTable(
  "achats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    storyId: uuid("story_id").references(() => stories.id, { onDelete: "set null" }),
    offre: text("offre", { enum: OFFRES }).notNull(),
    /** Le prix payé, TTC, en centimes : celui du catalogue à la commande, jamais un prix venu du navigateur. */
    centimes: integer("centimes").notNull(),
    devise: text("devise", { enum: ["eur"] })
      .notNull()
      .default("eur"),
    /** Les bulles qu’il donne, figées à la commande (le lot de la roue compris, et le bonus de la première recharge d’avant le 23 octobre 2026). */
    bulles: integer("bulles").notNull(),
    /** L’offre unique dont il profite (src/server/offres-uniques.ts), prise à la livraison, ou null. */
    offreUnique: text("offre_unique", { enum: OFFRES_UNIQUES }),
    statut: text("statut", { enum: STATUTS_ACHAT }).notNull().default("en_attente"),
    fournisseur: text("fournisseur", { enum: FOURNISSEURS_PAIEMENT }).notNull(),
    /** La configuration de paiement chez Whop (ch_…). */
    checkoutId: text("checkout_id"),
    /** Le paiement chez Whop (pay_…) : un paiement ne livre qu’un achat. */
    paiementId: text("paiement_id").unique(),
    /** Le membre Whop (mber_…) et son moyen de paiement gardé (payt_…) : le paiement en un geste de l’offre ③. */
    membreId: text("membre_id"),
    moyenId: text("moyen_id"),
    /**
     * La renonciation au délai de rétractation (src/contenu/consentements.ts), que le geste de payer donne : la version
     * de son texte et l’heure où le serveur l’a reçue, avec la commande. Null pour un achat sans paiement (l’équipe, un
     * achat d’avant la renonciation).
     */
    renonciationVersion: text("renonciation_version"),
    renonciationLe: quand("renonciation_le"),
    creeLe: quand("cree_le").notNull().defaultNow(),
    payeLe: quand("paye_le"),
    /** Remboursé, contesté ou échoué : l’heure. */
    annuleLe: quand("annule_le"),
    /**
     * Le rapport d’avance (l’offre « second », RAPPORT_D_AVANCE) : l’heure où il a débloqué la conv de son choix (alors
     * `storyId`, et la renonciation donnée à ce moment-là), ou null tant qu’il attend. Null pour toute autre offre.
     */
    utiliseLe: quand("utilise_le"),
    /** Le lot de la roue dont il profite (src/contenu/roue.ts), figé à la commande et pris à la livraison, ou null. */
    lotRoue: text("lot_roue", { enum: LOTS_DE_LA_ROUE }),
    /** La carte du chat d’où il est payé (src/server/vente.ts : une recharge, Premium), ou null : payé ailleurs. */
    vente: text("vente", { enum: GENRES_VENDUS }),
  },
  (t) => [index("achats_user_idx").on(t.userId), index("achats_story_idx").on(t.storyId), index("achats_cree_idx").on(t.creeLe)],
);

/**
 * La roue du paywall (src/server/roue.ts) : un tour par compte. La case tirée par le serveur et son lot, valable jusqu’à
 * `expireLe`, pris par l’achat qui en profite (`priseLe`, `achatId`) ; ou la roue refusée (« Je ne veux pas de cadeau » :
 * ni case, ni lot). Aucun contenu.
 */
export const roue = pgTable(
  "roue",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** La case tirée (0 à 7, CASES_DE_LA_ROUE), ou null : la roue refusée. */
    caseTiree: smallint("case_tiree"),
    lot: text("lot", { enum: LOTS_DE_LA_ROUE }),
    tireeLe: quand("tiree_le").notNull().defaultNow(),
    expireLe: quand("expire_le"),
    priseLe: quand("prise_le"),
    achatId: uuid("achat_id").references(() => achats.id, { onDelete: "set null" }),
  },
  (t) => [index("roue_tiree_idx").on(t.tireeLe)],
);

/**
 * Le journal des bulles : chaque changement du solde (users.bulles), dans la même transaction que lui. Une raison et sa
 * référence (l’achat, la réponse, le compte pour la bêta) ne s’écrivent qu’une fois : un webhook rejoué, une livraison
 * refaite ou deux débits de la même réponse ne comptent qu’une fois.
 */
export const mouvementsBulles = pgTable(
  "mouvements_bulles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Positif : des bulles reçues ; négatif : dépensées ou reprises. */
    delta: integer("delta").notNull(),
    raison: text("raison", { enum: RAISONS_BULLES }).notNull(),
    ref: text("ref").notNull(),
    creeLe: quand("cree_le").notNull().defaultNow(),
  },
  (t) => [unique("mouvements_bulles_une_fois").on(t.raison, t.ref), index("mouvements_bulles_user_idx").on(t.userId), check("mouvements_bulles_delta", sql`${t.delta} <> 0`)],
);

/**
 * Les offres uniques montrées à un compte (src/server/offres-uniques.ts) : chacune une fois au plus, jamais deux à moins
 * de 24 h l’une de l’autre. `expire_le` : la fin de l’offre ① ; `prise_le` : payée ; `story_id` : la conv pour laquelle
 * elle a été montrée.
 */
export const offresUniques = pgTable(
  "offres_uniques",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    offre: text("offre", { enum: OFFRES_UNIQUES }).notNull(),
    storyId: uuid("story_id").references(() => stories.id, { onDelete: "set null" }),
    montreeLe: quand("montree_le").notNull().defaultNow(),
    expireLe: quand("expire_le"),
    priseLe: quand("prise_le"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.offre] }), index("offres_uniques_montree_idx").on(t.montreeLe)],
);

/**
 * Les mails des séquences (src/server/sequences.ts) partis : à qui, lequel (`cle`, MAILS : « s3_repondre »…), pour quelle
 * occasion (la conv d’un mail d’une fois par conv, les bulles reçues d’un mail qui revient à chaque recharge, la réponse
 * prête), et quand. Écrite avant le mail (deux passages du cron n’en envoient qu’un, l’index unique y veille), effacée si
 * le mail n’est pas parti. `parti` faux : écarté au moment de l’écrire (une alerte, un 🧊), gardé pour ne pas repasser,
 * sans compter pour le mail du jour. Rien de la conv : ni prénom, ni texte.
 */
export const envoisMails = pgTable(
  "envois_mails",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storyId: uuid("story_id").references(() => stories.id, { onDelete: "set null" }),
    cle: text("cle").notNull(),
    occasion: text("occasion").notNull(),
    parti: boolean("parti").notNull().default(true),
    envoyeLe: quand("envoye_le").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("envois_mails_occasion_idx").on(t.userId, t.cle, t.occasion), index("envois_mails_compte_idx").on(t.userId, t.envoyeLe)],
);

/** Les webhooks de paiement déjà traités, par leur `webhook-id` : un webhook rejoué est ignoré. Aucun contenu. */
export const evenementsPaiement = pgTable("evenements_paiement", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  recuLe: quand("recu_le").notNull().defaultNow(),
});

/**
 * Le journal des actions de l’équipe depuis /admin ou l’outil du terminal (src/server/equipe.ts) : qui (son compte, ou
 * aucun depuis le terminal), quoi, pour quel compte, combien. Ni email, ni conv : des identifiants et des nombres.
 */
export const actionsEquipe = pgTable(
  "actions_equipe",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Le compte de l’équipe qui l’a faite, ou null : l’outil du terminal (npm run acces), ou un compte effacé depuis. */
    parId: uuid("par_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action", { enum: ACTIONS_EQUIPE }).notNull(),
    /** Le compte qui l’a reçue (des bulles, une conv débloquée), ou null : une invitation de la liste d’attente. */
    compteId: uuid("compte_id").references(() => users.id, { onDelete: "set null" }),
    /** Combien : les bulles données, les convs débloquées, les invitations parties. */
    nombre: integer("nombre").notNull(),
    creeLe: quand("cree_le").notNull().defaultNow(),
  },
  (t) => [index("actions_equipe_cree_idx").on(t.creeLe)],
);

/**
 * Les visiteurs, un par jour (de Paris) : l’empreinte anonyme de sa connexion (src/server/visites.ts : son adresse IP et
 * son navigateur, mêlés au sel du jour, qui s’efface le surlendemain ; jamais l’adresse elle-même), et d’où il est venu
 * ce jour-là. Sans cookie : la même personne revenue un autre jour compte une fois de plus. Gardés VISITES_GARDEES_JOURS.
 */
export const visites = pgTable(
  "visites",
  {
    jour: date("jour").notNull(),
    empreinte: text("empreinte").notNull(),
    source: text("source", { enum: SOURCES_VISITE }).notNull(),
    arriveLe: quand("arrive_le").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.jour, t.empreinte] }), index("visites_arrive_idx").on(t.arriveLe)],
);

/**
 * Les jalons du tunnel (src/server/visites.ts, noterJalon) : une ligne par personne, par jour (de Paris) et par jalon,
 * avec l’empreinte de sa connexion ce jour-là (celle des visites : son sel s’efface le surlendemain) et l’heure de la
 * première fois. Ni compte, ni conv, ni adresse IP. Gardés VISITES_GARDEES_JOURS, comme les visites.
 */
export const jalons = pgTable(
  "jalons",
  {
    jour: date("jour").notNull(),
    empreinte: text("empreinte").notNull(),
    jalon: text("jalon", { enum: JALONS }).notNull(),
    le: quand("le").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.jour, t.empreinte, t.jalon] }), index("jalons_le_idx").on(t.le)],
);

/** Le sel du jour (de Paris) des empreintes des visites : tiré au hasard, effacé le surlendemain (la purge). */
export const selsDesVisites = pgTable("sels_des_visites", {
  jour: date("jour").primaryKey(),
  sel: text("sel").notNull(),
});

/**
 * Les onglets ouverts sur le site, minute par minute (src/server/visites.ts) : chacun fait signe toutes les 40 secondes
 * tant qu’il est visible. `onglet` : un identifiant tiré au hasard à l’ouverture de la page, jamais gardé dans le
 * navigateur. L’écran où il est, d’où il est venu, et la ville de sa connexion (celle que donne l’hébergeur, avec ses
 * coordonnées) : ni compte, ni adresse IP. Gardées PRESENCES_GARDEES_JOURS, pour /admin en direct.
 */
export const presences = pgTable(
  "presences",
  {
    onglet: uuid("onglet").notNull(),
    /** La minute du signe (son début) : une ligne par onglet et par minute. */
    minute: quand("minute").notNull(),
    vuLe: quand("vu_le").notNull().defaultNow(),
    etape: text("etape", { enum: ETAPES_VISITE }).notNull(),
    source: text("source", { enum: SOURCES_VISITE }).notNull(),
    ville: text("ville"),
    pays: text("pays"),
    lat: real("lat"),
    lon: real("lon"),
  },
  (t) => [primaryKey({ columns: [t.onglet, t.minute] }), index("presences_vu_idx").on(t.vuLe), index("presences_minute_idx").on(t.minute)],
);

/**
 * Le registre des effacements demandés (« Tout effacer », « Supprimer l’histoire » : src/server/comptes.ts,
 * src/server/histoires.ts) : quoi (un compte, une conv, une inscription à la liste d’attente), son identifiant (l’id,
 * ou l’empreinte de l’email pour la liste : jamais l’email), et quand. Une base restaurée à un instant passé (BACKEND.md,
 * « Les sauvegardes ») ramène ce qui a été effacé depuis : ce registre, lu avant la restauration, dit quoi ré-effacer.
 * Gardé EFFACEMENTS_GARDES_JOURS (la purge).
 */
export const effacements = pgTable(
  "effacements",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    quoi: text("quoi", { enum: ["compte", "conv", "liste"] }).notNull(),
    cible: text("cible").notNull(),
    le: quand("le").notNull().defaultNow(),
  },
  (t) => [index("effacements_le_idx").on(t.le)],
);

/**
 * Les erreurs des navigateurs (src/server/navigateur.ts) : une ligne par signature et par jour (de Paris), son nombre de
 * fois, l’écran et la famille du navigateur de la première. Le message est coupé et masqué (emails, longs nombres), la
 * source réduite à un fichier de l’appli : ni compte, ni adresse IP, ni adresse de page. Gardées NAVIGATEUR_GARDE_JOURS.
 */
export const erreursNavigateur = pgTable(
  "erreurs_navigateur",
  {
    jour: date("jour").notNull(),
    signature: text("signature").notNull(),
    nom: text("nom").notNull(),
    message: text("message").notNull(),
    source: text("source"),
    etape: text("etape", { enum: ETAPES_VISITE }).notNull(),
    famille: text("famille", { enum: FAMILLES_NAVIGATEUR }).notNull(),
    fois: integer("fois").notNull().default(1),
    premiereLe: quand("premiere_le").notNull().defaultNow(),
    derniereLe: quand("derniere_le").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.jour, t.signature] }), index("erreurs_navigateur_derniere_idx").on(t.derniereLe)],
);

/**
 * Les mesures de vitesse des navigateurs (les Web Vitals, src/server/navigateur.ts) : l’écran, téléphone ou non, la
 * mesure et sa valeur. Ni compte, ni adresse IP. Gardées NAVIGATEUR_GARDE_JOURS, pour les médianes d’/admin.
 */
export const mesuresNavigateur = pgTable(
  "mesures_navigateur",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    le: quand("le").notNull().defaultNow(),
    etape: text("etape", { enum: ETAPES_VISITE }).notNull(),
    mobile: boolean("mobile").notNull(),
    metrique: text("metrique", { enum: METRIQUES_WEB }).notNull(),
    valeur: real("valeur").notNull(),
  },
  (t) => [index("mesures_navigateur_le_idx").on(t.le)],
);

/**
 * Le fil d’/admin en direct (GENRES_FIL) : une ville et un geste. `source` : d’où vient une arrivée ; `offre` : celle
 * d’un paiement ouvert ou d’un achat payé ; `ref` : l’achat d’un paiement ouvert, pour retrouver sa ville quand il est
 * payé (le webhook n’a pas de connexion à situer), ou celui d’un achat payé, pour dire son prix payé (depuis le
 * 23 octobre 2026). Ni compte, ni conv. Gardé PRESENCES_GARDEES_JOURS.
 */
export const filDirect = pgTable(
  "fil_direct",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    le: quand("le").notNull().defaultNow(),
    genre: text("genre", { enum: GENRES_FIL }).notNull(),
    ville: text("ville"),
    source: text("source", { enum: SOURCES_VISITE }),
    offre: text("offre", { enum: OFFRES }),
    ref: text("ref"),
  },
  (t) => [index("fil_direct_le_idx").on(t.le), index("fil_direct_ref_idx").on(t.ref)],
);

/**
 * Ce qui arrive aux mails, que Resend nous rend par son webhook (src/server/delivrabilite.ts) : leur sorte (le tag posé
 * à l’envoi, SorteSuivie dans src/server/email.ts, ou « inconnue »), l’événement, quand, et le compte du destinataire
 * s’il en a un (null sinon, ou effacé depuis). Ni adresse, ni sujet, ni contenu. `id` : l’identifiant de l’envoi du
 * webhook (svix-id), le même à chaque nouvel essai : un événement ne compte qu’une fois. Gardé EVENEMENTS_MAILS_GARDES_JOURS.
 */
export const evenementsMails = pgTable(
  "evenements_mails",
  {
    id: text("id").primaryKey(),
    le: quand("le").notNull().defaultNow(),
    type: text("type", { enum: TYPES_EVENEMENTS_MAILS }).notNull(),
    sorte: text("sorte").notNull(),
    compteId: uuid("compte_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("evenements_mails_le_idx").on(t.le)],
);

/*
 * L’OAuth du serveur MCP (src/server/mcp/acces.ts) : Claude lit les chiffres de /admin au nom d’un compte de
 * BLUSH_ADMINS. Que des empreintes (empreinte, src/server/chiffrement.ts) : aucun secret ni jeton en clair.
 */

/**
 * Un client enregistré par Claude (RFC 7591) : son identifiant (public), l’empreinte de son secret (null : un client
 * public, PKCE seul), le nom qu’il s’est donné et ses retours. Un client sans accès part après MCP_CLIENTS_GARDES_JOURS.
 */
export const mcpClients = pgTable(
  "mcp_clients",
  {
    id: text("id").primaryKey(),
    secretHash: text("secret_hash"),
    methode: text("methode", { enum: METHODES_CLIENT_OAUTH }).notNull(),
    nom: text("nom").notNull(),
    retours: jsonb("retours").$type<string[]>().notNull(),
    creeLe: quand("cree_le").notNull().defaultNow(),
  },
  (t) => [index("mcp_clients_cree_idx").on(t.creeLe)],
);

/** Un code d’autorisation, le temps de l’échanger (dix minutes, une fois) : à qui, pour quel retour, et son défi PKCE. */
export const mcpCodes = pgTable("mcp_codes", {
  codeHash: text("code_hash").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => mcpClients.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  retour: text("retour").notNull(),
  defi: text("defi").notNull(),
  portee: text("portee").notNull(),
  ressource: text("ressource"),
  expireLe: quand("expire_le").notNull(),
});

/**
 * Un accès accordé à Claude par un compte de l’équipe : son jeton d’accès (une heure) et son jeton de rafraîchissement
 * (glissant), par leurs empreintes. `precedentHash` : le jeton de rafraîchissement d’avant la dernière rotation, qui vaut
 * encore une fois (une réponse perdue en route ne déconnecte pas Claude). `hote` : l’hôte du retour (claude.ai), montré
 * à l’équipe. `utiliseLe` : le dernier appel, écrit toutes les cinq minutes au plus.
 */
export const mcpAcces = pgTable(
  "mcp_acces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id")
      .notNull()
      .references(() => mcpClients.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nom: text("nom").notNull(),
    hote: text("hote").notNull(),
    portee: text("portee").notNull(),
    accesHash: text("acces_hash").notNull().unique(),
    accesExpireLe: quand("acces_expire_le").notNull(),
    rafraichissementHash: text("rafraichissement_hash").notNull().unique(),
    precedentHash: text("precedent_hash").unique(),
    rafraichissementExpireLe: quand("rafraichissement_expire_le").notNull(),
    creeLe: quand("cree_le").notNull().defaultNow(),
    utiliseLe: quand("utilise_le"),
  },
  (t) => [index("mcp_acces_user_idx").on(t.userId)],
);
