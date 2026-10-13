import { sql } from "drizzle-orm";
import { bigserial, boolean, check, customType, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
/* En chemin relatif : drizzle-kit lit ce fichier hors de Next, sans l’alias @/ */
import { EVENEMENTS_ECOUTE, OFFRES, OFFRES_UNIQUES, STATUTS_ACHAT, VOIX } from "../../types";
import { ACTIONS_EQUIPE, FOURNISSEURS_PAIEMENT, GENRES, GENRES_CHAINE, RAISONS_BULLES, ROLES_CHAT, SOURCES_ATTENTE, STATUTS_TACHE, type DetailEcriture } from "./enums";

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
    createdAt: quand("created_at").notNull().defaultNow(),
    updatedAt: quand("updated_at").notNull().defaultNow(),
  },
  (t) => [index("stories_user_idx").on(t.userId)],
);

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
    /** Les bulles qu’il donne, figées à la commande (le bonus de la première recharge compris). */
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
  },
  (t) => [index("achats_user_idx").on(t.userId), index("achats_story_idx").on(t.storyId), index("achats_cree_idx").on(t.creeLe)],
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
