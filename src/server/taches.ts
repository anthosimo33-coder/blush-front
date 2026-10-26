import "server-only";
import { and, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import * as coffre from "./coffre";
import { db, schema } from "./db";
import type { Genre } from "./db/enums";
import { memoireEnLot } from "./env";

/*
 * Les tâches longues, rangées en base et exécutées après la réponse HTTP (after()).
 * Une tâche « en cours » dont le battement de cœur est périmé a été abandonnée (instance arrêtée) : on la reprend.
 * Leurs genres et leurs états : src/server/db/enums.ts.
 */
export type Tache = typeof schema.tasks.$inferSelect;

export const ESSAIS_MAX = 3;
/** Sans battement depuis 90 s, une tâche « en cours » est abandonnée : on la reprend (le tableau de bord la compte « bloquée »). */
export const PERIME_S = 90;

/**
 * Planifie une étape. Celles de la chaîne (verdict, rapport, vocal, mémoire) n’existent qu’une fois en attente ou en
 * cours par histoire (un index unique) : planifiée deux fois en même temps, c’est la même tâche qui revient. Une mise à
 * jour de la mémoire (memoire_maj) ne passe pas par ici : ses échanges se regroupent (retenir, src/server/memoire-groupee.ts).
 */
export async function planifier(storyId: string, kind: Genre): Promise<string> {
  for (let essai = 0; essai < 2; essai++) {
    const [t] = await db().insert(schema.tasks).values({ storyId, kind }).onConflictDoNothing().returning({ id: schema.tasks.id });
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

/**
 * Le verdict d’une conv pas encore payée : sa tâche est posée, au statut `paiement`, que ni la chaîne ni le cron ne
 * prennent (ils ne prennent que l’attente) ; le paiement la lance (lancerApresPaiement, src/server/pipeline.ts). La conv compte ainsi pour lue (la purge la garde, « Tes convs » la montre),
 * sans que rien parte au modèle. Une seule par conv : une deuxième demande ne fait rien.
 */
export async function attendreLePaiement(storyId: string, kind: Genre): Promise<void> {
  await db().transaction(async (tx) => {
    /* Le verrou de la conv : deux onglets qui envoient « Qui es-tu ? » en même temps ne posent pas deux tâches */
    await tx.select({ id: schema.stories.id }).from(schema.stories).where(eq(schema.stories.id, storyId)).for("update");
    const [deja] = await tx
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.storyId, storyId), eq(schema.tasks.kind, kind)))
      .limit(1);
    if (!deja) await tx.insert(schema.tasks).values({ storyId, kind, status: "paiement" });
  });
}

/** Le paiement reçu (ou l’accès donné) : les tâches de la conv qui l’attendaient partent (en attente). Rend leur nombre. */
export async function paiementRecu(storyId: string): Promise<number> {
  const lancees = await db()
    .update(schema.tasks)
    .set({ status: "attente", updatedAt: new Date() })
    .where(and(eq(schema.tasks.storyId, storyId), eq(schema.tasks.status, "paiement")))
    .returning({ id: schema.tasks.id });
  return lancees.length;
}

/**
 * Une tâche en attente qu’on peut prendre : pas une mise à jour de la mémoire qui attend que le chat se calme (son heure,
 * `pas_avant`, pas encore venue : src/server/memoire-groupee.ts). Avec la mémoire en lot (BLUSH_MEMOIRE_EN_LOT), celle
 * dont le chat s’est calmé non plus : elle est au passage des 5 minutes, qui l’envoie en lot (src/server/memoire-en-lot.ts).
 * Seules les mises à jour de la mémoire ont une heure : toute autre tâche est à prendre.
 */
export const aPrendre = () => (memoireEnLot() ? isNull(schema.tasks.pasAvant) : or(isNull(schema.tasks.pasAvant), lte(schema.tasks.pasAvant, sql`now()`)));

/** Aucune autre tâche de la même histoire ne tourne (son battement est frais) : sinon, la chaîne qui la tient enchaînera la suite. */
export const autreEnCours = sql`not exists (select 1 from ${schema.tasks} as "autre" where "autre"."story_id" = ${schema.tasks.storyId} and "autre"."id" <> ${schema.tasks.id} and "autre"."status" = 'en_cours' and "autre"."heartbeat_at" >= now() - make_interval(secs => ${PERIME_S}))`;

/**
 * Pas de lot en vol pour la mémoire de l’histoire, ou une tâche qui n’y touche pas : une mise à jour (ou la mémoire) ne
 * part pas pendant que la réponse d’une autre est attendue en lot (src/server/memoire-en-lot.ts). Elle trouverait la
 * mémoire changée et se referait, ou ferait refaire l’autre : la même mise à jour payée deux fois. Ce qui doit partir
 * tout de suite rapatrie le lot d’abord (rapatrier).
 */
export const sansLotEnVol = sql`(${schema.tasks.kind} not in ('memoire', 'memoire_maj') or not exists (select 1 from ${schema.tasks} as "lot" where "lot"."story_id" = ${schema.tasks.storyId} and "lot"."id" <> ${schema.tasks.id} and "lot"."status" = 'lot'))`;

/**
 * Prend la tâche si personne ne la tient (atomique). Renvoie null si elle est déjà prise, finie, à bout d’essais, ou
 * si une autre tâche de la même histoire tourne déjà : jamais deux étapes d’une histoire en même temps (deux mises à
 * jour de la mémoire perdraient l’une des deux, un vocal partirait sans son rapport). Ni une mise à jour de la mémoire
 * pendant qu’une autre est en lot (sansLotEnVol).
 */
export async function prendre(id: string): Promise<Tache | null> {
  const [t] = await db()
    .update(schema.tasks)
    .set({ status: "en_cours", attempts: sql`${schema.tasks.attempts} + 1`, heartbeatAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(schema.tasks.id, id),
        lt(schema.tasks.attempts, ESSAIS_MAX),
        or(
          and(eq(schema.tasks.status, "attente"), aPrendre()),
          and(eq(schema.tasks.status, "en_cours"), lt(schema.tasks.heartbeatAt, sql`now() - make_interval(secs => ${PERIME_S})`)),
        ),
        autreEnCours,
        sansLotEnVol,
      ),
    )
    .returning();
  return t ?? null;
}

export const battre = (id: string) => db().update(schema.tasks).set({ heartbeatAt: new Date() }).where(eq(schema.tasks.id, id));

/**
 * Une tâche finie. Son entrée (les échanges d’une mise à jour de la mémoire : ce qu’il a dit, ce qu’il a ajouté) est
 * effacée avec, et la mémoire gardée pour son lot s’il y en a eu un : la mémoire l’a retenue, rien ne la relira (S-34).
 * Une tâche en échec garde son entrée, pour repartir.
 */
export async function finir(id: string): Promise<void> {
  await db().update(schema.tasks).set({ status: "fini", error: null, input: null, lotAvant: null, updatedAt: new Date() }).where(eq(schema.tasks.id, id));
}

/**
 * Un échec : la tâche repart en attente, sauf au dernier essai, ou si réessayer ne changerait rien (`definitif` :
 * le modèle a refusé). `code` ne contient jamais de contenu. La mémoire gardée pour un lot (une réponse de lot que la
 * base a empêché d’appliquer, reprise en direct) s’efface : rien ne la relira, le direct part de la mémoire du moment.
 */
export async function echouer(t: Tache, code: string, definitif = false): Promise<void> {
  await db()
    .update(schema.tasks)
    .set({ status: definitif || t.attempts >= ESSAIS_MAX ? "echec" : "attente", error: code.slice(0, 120), lotAvant: null, updatedAt: new Date() })
    .where(eq(schema.tasks.id, t.id));
}

/**
 * Les tâches coupées à leur dernier essai (l’instance arrêtée en pleine étape : `echouer` n’a jamais tourné) passent
 * en échec. Sans ça, elles resteraient « en cours » pour toujours : plus rien ne les reprend, et rien ne le dit. La
 * mémoire gardée pour un lot s’efface avec (echouer).
 */
export async function clore(storyId: string): Promise<Tache[]> {
  return db()
    .update(schema.tasks)
    .set({ status: "echec", error: "coupee", lotAvant: null, updatedAt: new Date() })
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

/**
 * Les tâches d’une histoire à (re)lancer : en attente (sauf une mise à jour qui attend que le chat se calme, ou que la
 * réponse d’une autre revienne de son lot), ou abandonnées.
 */
export async function aRelancer(storyId: string): Promise<Tache[]> {
  return db()
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.storyId, storyId),
        lt(schema.tasks.attempts, ESSAIS_MAX),
        or(
          and(eq(schema.tasks.status, "attente"), aPrendre()),
          and(eq(schema.tasks.status, "en_cours"), lt(schema.tasks.heartbeatAt, sql`now() - make_interval(secs => ${PERIME_S})`)),
        ),
        sansLotEnVol,
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

/** L’entrée d’une tâche (les échanges d’une mise à jour de la mémoire, dans l’ordre), ou null. */
export const entreeDe = (t: Tache) => (t.input ? coffre.lire("tasks.input", t.input) : null);
