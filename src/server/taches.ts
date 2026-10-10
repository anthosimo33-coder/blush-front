import "server-only";
import { and, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { chiffrer, dechiffrer } from "./chiffrement";
import { db, schema } from "./db";
import type { Genre } from "./db/enums";

/*
 * Les tâches longues, rangées en base et exécutées après la réponse HTTP (after()).
 * Une tâche « en cours » dont le battement de cœur est périmé a été abandonnée (instance arrêtée) : on la reprend.
 * Leurs genres et leurs états : src/server/db/enums.ts.
 */
export type { Genre };
export type Tache = typeof schema.tasks.$inferSelect;

export const ESSAIS_MAX = 3;
/** Sans battement depuis 90 s, une tâche « en cours » est abandonnée : on la reprend (le tableau de bord la compte « bloquée »). */
export const PERIME_S = 90;

/**
 * Planifie une étape. Celles de la chaîne (verdict, rapport, vocal, mémoire) n’existent qu’une fois en attente ou en
 * cours par histoire (un index unique) : planifiée deux fois en même temps, c’est la même tâche qui revient.
 */
export async function planifier(storyId: string, kind: Genre, input?: unknown): Promise<string> {
  for (let essai = 0; essai < 2; essai++) {
    const [t] = await db()
      .insert(schema.tasks)
      .values({ storyId, kind, ...(input === undefined ? {} : { input: chiffrer(input) }) })
      .onConflictDoNothing()
      .returning({ id: schema.tasks.id });
    if (t) return t.id;
    const [deja] = await db()
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.storyId, storyId), eq(schema.tasks.kind, kind), inArray(schema.tasks.status, ["attente", "en_cours"])))
      .limit(1);
    /* Finie entre les deux requêtes : on la replanifie */
    if (deja) return deja.id;
  }
  throw new Error(`planification impossible : ${kind}`);
}

/* Une autre tâche de la même histoire tourne (son battement est frais) : la chaîne qui la tient enchaînera la suite */
const autreEnCours = sql`not exists (select 1 from ${schema.tasks} as "autre" where "autre"."story_id" = ${schema.tasks.storyId} and "autre"."id" <> ${schema.tasks.id} and "autre"."status" = 'en_cours' and "autre"."heartbeat_at" >= now() - make_interval(secs => ${PERIME_S}))`;

/**
 * Prend la tâche si personne ne la tient (atomique). Renvoie null si elle est déjà prise, finie, à bout d’essais, ou
 * si une autre tâche de la même histoire tourne déjà : jamais deux étapes d’une histoire en même temps (deux mises à
 * jour de la mémoire perdraient l’une des deux, un vocal partirait sans son rapport).
 */
export async function prendre(id: string): Promise<Tache | null> {
  const [t] = await db()
    .update(schema.tasks)
    .set({ status: "en_cours", attempts: sql`${schema.tasks.attempts} + 1`, heartbeatAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(schema.tasks.id, id),
        lt(schema.tasks.attempts, ESSAIS_MAX),
        or(eq(schema.tasks.status, "attente"), and(eq(schema.tasks.status, "en_cours"), lt(schema.tasks.heartbeatAt, sql`now() - make_interval(secs => ${PERIME_S})`))),
        autreEnCours,
      ),
    )
    .returning();
  return t ?? null;
}

export const battre = (id: string) => db().update(schema.tasks).set({ heartbeatAt: new Date() }).where(eq(schema.tasks.id, id));

export async function finir(id: string): Promise<void> {
  await db().update(schema.tasks).set({ status: "fini", error: null, updatedAt: new Date() }).where(eq(schema.tasks.id, id));
}

/**
 * Un échec : la tâche repart en attente, sauf au dernier essai, ou si réessayer ne changerait rien (`definitif` :
 * le modèle a refusé). `code` ne contient jamais de contenu.
 */
export async function echouer(t: Tache, code: string, definitif = false): Promise<void> {
  await db()
    .update(schema.tasks)
    .set({ status: definitif || t.attempts >= ESSAIS_MAX ? "echec" : "attente", error: code.slice(0, 120), updatedAt: new Date() })
    .where(eq(schema.tasks.id, t.id));
}

/**
 * Les tâches coupées à leur dernier essai (l’instance arrêtée en pleine étape : `echouer` n’a jamais tourné) passent
 * en échec. Sans ça, elles resteraient « en cours » pour toujours : plus rien ne les reprend, et rien ne le dit.
 */
export async function clore(storyId: string): Promise<Tache[]> {
  return db()
    .update(schema.tasks)
    .set({ status: "echec", error: "coupee", updatedAt: new Date() })
    .where(
      and(
        eq(schema.tasks.storyId, storyId),
        eq(schema.tasks.status, "en_cours"),
        gte(schema.tasks.attempts, ESSAIS_MAX),
        lt(schema.tasks.heartbeatAt, sql`now() - make_interval(secs => ${PERIME_S})`),
      ),
    )
    .returning();
}

/** Remet en attente, pour un nouvel essai complet, les tâches en échec de ces genres (la plus récente de chacun). */
export async function reprendre(storyId: string, genres: Genre[]): Promise<number> {
  const etat = await etatDesTaches(storyId, genres);
  const ids = Object.values(etat)
    .filter((t) => t.status === "echec")
    .map((t) => t.id);
  if (!ids.length) return 0;
  /* Pas si la même étape attend déjà (planifiée entre-temps) : elle fera le travail */
  const dejaPlanifiee = sql`not exists (select 1 from ${schema.tasks} as "autre" where "autre"."story_id" = ${schema.tasks.storyId} and "autre"."kind" = ${schema.tasks.kind} and "autre"."id" <> ${schema.tasks.id} and "autre"."status" in ('attente', 'en_cours'))`;
  const remises = await db()
    .update(schema.tasks)
    .set({ status: "attente", attempts: 0, error: null, updatedAt: new Date() })
    .where(and(inArray(schema.tasks.id, ids), dejaPlanifiee))
    .returning({ id: schema.tasks.id });
  return remises.length;
}

/** Les tâches d’une histoire à (re)lancer : en attente, ou abandonnées. */
export async function aRelancer(storyId: string): Promise<Tache[]> {
  return db()
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.storyId, storyId),
        lt(schema.tasks.attempts, ESSAIS_MAX),
        or(eq(schema.tasks.status, "attente"), and(eq(schema.tasks.status, "en_cours"), lt(schema.tasks.heartbeatAt, sql`now() - make_interval(secs => ${PERIME_S})`))),
      ),
    )
    .orderBy(schema.tasks.createdAt);
}

/**
 * Une autre exécution tient-elle déjà une tâche de l’histoire ? Elle enchaînera aussi les suivantes : on la laisse
 * faire (deux mises à jour de la mémoire en même temps perdraient l’une des deux).
 */
export async function occupee(storyId: string): Promise<boolean> {
  const [t] = await db()
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.storyId, storyId), eq(schema.tasks.status, "en_cours"), sql`${schema.tasks.heartbeatAt} >= now() - make_interval(secs => ${PERIME_S})`))
    .limit(1);
  return !!t;
}

/** Les tâches d’une histoire, par genre (la plus récente de chaque). */
export async function etatDesTaches(storyId: string, genres: Genre[]): Promise<Partial<Record<Genre, Tache>>> {
  const lignes = await db()
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.storyId, storyId), inArray(schema.tasks.kind, genres)))
    .orderBy(schema.tasks.createdAt);
  return Object.fromEntries(lignes.map((t) => [t.kind, t]));
}

export const entreeDe = <T>(t: Tache) => (t.input ? dechiffrer<T>(t.input) : null);
