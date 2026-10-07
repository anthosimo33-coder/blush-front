import "server-only";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { chiffrer, dechiffrer } from "./chiffrement";
import { db, schema } from "./db";

/*
 * Les tâches longues, rangées en base et exécutées après la réponse HTTP (after()).
 * Une tâche « en cours » dont le battement de cœur est périmé a été abandonnée (instance arrêtée) : on la reprend.
 */
export type Genre = "verdict" | "rapport_plan" | "rapport_chapitres" | "memoire" | "memoire_maj";
export type Tache = typeof schema.tasks.$inferSelect;

export const ESSAIS_MAX = 3;
const PERIME_S = 90;

export async function planifier(storyId: string, kind: Genre, input?: unknown): Promise<string> {
  const [t] = await db()
    .insert(schema.tasks)
    .values({ storyId, kind, ...(input === undefined ? {} : { input: chiffrer(input) }) })
    .returning({ id: schema.tasks.id });
  return t.id;
}

/** Prend la tâche si personne ne la tient (atomique). Renvoie null si elle est déjà prise, finie, ou à bout d’essais. */
export async function prendre(id: string): Promise<Tache | null> {
  const [t] = await db()
    .update(schema.tasks)
    .set({ status: "en_cours", attempts: sql`${schema.tasks.attempts} + 1`, heartbeatAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(schema.tasks.id, id),
        lt(schema.tasks.attempts, ESSAIS_MAX),
        or(eq(schema.tasks.status, "attente"), and(eq(schema.tasks.status, "en_cours"), lt(schema.tasks.heartbeatAt, sql`now() - make_interval(secs => ${PERIME_S})`))),
      ),
    )
    .returning();
  return t ?? null;
}

export const battre = (id: string) => db().update(schema.tasks).set({ heartbeatAt: new Date() }).where(eq(schema.tasks.id, id));

export async function finir(id: string): Promise<void> {
  await db().update(schema.tasks).set({ status: "fini", error: null, updatedAt: new Date() }).where(eq(schema.tasks.id, id));
}

/** Un échec : la tâche repart en attente, sauf au dernier essai. `code` ne contient jamais de contenu. */
export async function echouer(t: Tache, code: string): Promise<void> {
  await db()
    .update(schema.tasks)
    .set({ status: t.attempts >= ESSAIS_MAX ? "echec" : "attente", error: code.slice(0, 120), updatedAt: new Date() })
    .where(eq(schema.tasks.id, t.id));
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
