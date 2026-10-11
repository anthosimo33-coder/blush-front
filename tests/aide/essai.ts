import { join, resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import * as coffre from "@/server/coffre";
import { db, schema } from "@/server/db";
import { ligneRapport } from "@/server/depot";
import type { DonneesRapport } from "@/server/stockage/types";

/*
 * Ce que partagent les essais avec le vrai modèle (scripts/essai-*.mts, `npm run essai:*`) et les tests de la chaîne
 * (tests/chaine.test.ts) : relire en base ce qu’une lecture a laissé d’une histoire (ses tâches dans l’ordre, son
 * rapport, son coût), et des chemins de fichiers qui ne dépendent pas du dossier d’où l’on lance. Sans vitest : les
 * scripts le chargent hors des tests (tsx, avec la condition react-server de server-only).
 */

/** Le banc d’essai des prompts, dans le sous-module privé : ses cas (cas.json) et ses convs (convs/). */
export const EVALS = join(import.meta.dirname, "../../prompts/evals");

/**
 * Un chemin donné en argument d’un essai, lu depuis le dossier où la commande a été tapée : `npm run` se place à la
 * racine du dépôt, et garde ce dossier dans INIT_CWD. Un argument manquant (`process.argv[k]`, undefined) arrête l’essai
 * en le disant : chaque script écrit son usage dans son en-tête.
 */
export function cheminDonne(chemin: string | undefined): string {
  if (chemin === undefined) throw new Error("un chemin manque parmi les arguments de l’essai (son usage : l’en-tête du script)");
  return resolve(process.env.INIT_CWD ?? process.cwd(), chemin);
}

/**
 * Les tâches d’une histoire, dans l’ordre de leur création : sans tri, Postgres les rend dans l’ordre de leur dernière
 * mise à jour, et une tâche relancée passerait en dernier.
 */
export const tachesDe = (storyId: string) => db().select().from(schema.tasks).where(eq(schema.tasks.storyId, storyId)).orderBy(schema.tasks.createdAt);

/** Le rapport assemblé d’une histoire, déchiffré, ou null : il n’est pas (encore) écrit. */
export async function rapportEnBase(storyId: string): Promise<DonneesRapport | null> {
  const r = await ligneRapport(storyId);
  return r?.data ? coffre.lire("reports.data", r.data) : null;
}

/** Ce qu’ont coûté les appels au modèle d’une histoire (ai_usage), en dollars, et leur nombre. */
export async function coutDe(storyId: string): Promise<{ dollars: number; appels: number }> {
  const c = (await db()
    .select({ micros: sql<string | null>`sum(${schema.aiUsage.costMicros})`, appels: sql<number>`count(*)::int` })
    .from(schema.aiUsage)
    .where(eq(schema.aiUsage.storyId, storyId)))[0]!;
  return { dollars: Number(c.micros ?? 0) / 1e6, appels: c.appels };
}
