import { bigserial, boolean, customType, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
  /** gratuit | rapport | blushplus (en v1, sans paiement : activé à la main ou par BLUSH_ACCES_LIBRE) */
  plan: text("plan").notNull().default("gratuit"),
  paused: boolean("paused").notNull().default(false),
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

/** Un code de connexion par email à la fois : son empreinte, sa date limite, les essais. */
export const loginCodes = pgTable("login_codes", {
  email: text("email").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: quand("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: quand("created_at").notNull().defaultNow(),
});

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
    /** brouillon | analyse | prete */
    status: text("status").notNull().default("brouillon"),
    messageCount: integer("message_count").notNull(),
    /** Le prochain numéro libre pour les messages ajoutés après l’import (m1074…), réservé d’un coup, sans doublon. */
    nextMessage: integer("next_message"),
    meta: chiffre("meta").notNull(),
    conv: chiffre("conv"),
    context: chiffre("context"),
    convPurgedAt: quand("conv_purged_at"),
    createdAt: quand("created_at").notNull().defaultNow(),
    updatedAt: quand("updated_at").notNull().defaultNow(),
  },
  (t) => [index("stories_user_idx").on(t.userId)],
);

/** Les sorties du modèle, chiffrées : le verdict, le rapport, la mémoire (avec sa fiche et ses messages gardés). */
export const verdicts = pgTable("verdicts", {
  storyId: uuid("story_id")
    .primaryKey()
    .references(() => stories.id, { onDelete: "cascade" }),
  data: chiffre("data").notNull(),
  createdAt: quand("created_at").notNull().defaultNow(),
});

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
    /** toi | blush */
    role: text("role").notNull(),
    data: chiffre("data").notNull(),
    createdAt: quand("created_at").notNull().defaultNow(),
  },
  (t) => [index("chat_messages_story_idx").on(t.storyId, t.id)],
);

/**
 * Les tâches longues (le verdict, le plan du rapport, ses chapitres, la mémoire, une mise à jour de la mémoire),
 * exécutées après la réponse HTTP. `heartbeatAt` périmé = tâche abandonnée, qu’on peut relancer.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    /** verdict | rapport_plan | rapport_chapitres | memoire | memoire_maj */
    kind: text("kind").notNull(),
    /** attente | en_cours | fini | echec */
    status: text("status").notNull().default("attente"),
    attempts: integer("attempts").notNull().default(0),
    /** Ce dont la tâche a besoin (par exemple l’échange à retenir), chiffré. */
    input: chiffre("input"),
    /** Le code d’erreur, jamais de contenu. */
    error: text("error"),
    /** L’avancée de 0 à 100, d’après ce que le modèle a déjà écrit (le verdict, suivi en direct par la lecture). */
    progress: integer("progress").notNull().default(0),
    /** Le détail de l’avancée (les chapitres du rapport : écrits, en cours), des numéros seulement, jamais de contenu. */
    detail: jsonb("detail"),
    heartbeatAt: quand("heartbeat_at"),
    createdAt: quand("created_at").notNull().defaultNow(),
    updatedAt: quand("updated_at").notNull().defaultNow(),
  },
  (t) => [index("tasks_story_idx").on(t.storyId, t.kind)],
);

/** La liste d’attente de la bêta fermée : l’email chiffré, et son empreinte pour ne l’inscrire qu’une fois. */
export const waitlist = pgTable("waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  emailHash: text("email_hash").notNull().unique(),
  email: chiffre("email").notNull(),
  /** D’où vient l’inscription : « accueil » (la page de la liste), « connexion » (refusé à l’écran email). */
  source: text("source").notNull(),
  createdAt: quand("created_at").notNull().defaultNow(),
});

/** Les limites (codes envoyés, imports, messages au chat) : une fenêtre et un compteur par clé. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: quand("window_start").notNull(),
  count: integer("count").notNull().default(0),
});

/** Ce que coûte chaque appel au modèle. Aucun contenu. */
export const aiUsage = pgTable("ai_usage", {
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
});
