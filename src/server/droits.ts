import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Account } from "@/types/api";
import type { Utilisateur } from "./auth";
import { db, schema } from "./db";
import { accesLibre } from "./env";

/*
 * Les droits d’un compte, depuis le paiement à l’unité : ils se lisent par conv (son rapport débloqué, stories.debloque_le)
 * et par compte (un client, l’équipe), jamais par un plan. Le chat est ouvert à tout compte connecté : ce qu’il coûte se
 * paie en bulles (src/server/bulles.ts). L’équipe (BLUSH_ACCES_LIBRE) a tout : ses rapports ouverts, des bulles qui ne se
 * débitent jamais, rien à payer (« * », tout le monde, est refusé en production : src/server/env.ts).
 */

/** Ce qui suffit d’un compte pour savoir ses droits : son email (l’équipe). */
type Qui = Pick<Utilisateur, "email">;

/** Un compte de l’équipe (BLUSH_ACCES_LIBRE) : tous ses rapports ouverts, bulles illimitées, rien à payer. */
export const estEquipe = (compte: Qui) => accesLibre(compte.email);

/**
 * Le rapport de cette conv est-il ouvert à ce compte ? Débloqué (payé, offert, donné aux testeurs de la bêta), ou lu
 * par un compte de l’équipe. Sans compte (un brouillon), seulement s’il est débloqué.
 */
export const rapportOuvert = (story: { debloqueLe: Date | null }, compte: Qui | null) => !!story.debloqueLe || (!!compte && estEquipe(compte));

/**
 * Le rapport de cette conv est-il ouvert, lu en base : celui du compte de la conv, jamais celui que croit l’appelant (la
 * chaîne des tâches le relit à chaque étape, src/server/pipeline.ts). Une conv sans compte (un brouillon) : non.
 */
export async function rapportOuvertEnBase(storyId: string): Promise<boolean> {
  const [l] = await db()
    .select({ debloqueLe: schema.stories.debloqueLe, email: schema.users.email })
    .from(schema.stories)
    .innerJoin(schema.users, eq(schema.users.id, schema.stories.userId))
    .where(eq(schema.stories.id, storyId));
  return !!l && rapportOuvert(l, l);
}

/**
 * Un client : au moins un rapport débloqué, ou un achat payé, ou l’équipe. Sa fiche s’ouvre (la lire, la corriger, y
 * ajouter des captures).
 */
export async function estClient(compte: Pick<Utilisateur, "id" | "email">): Promise<boolean> {
  if (estEquipe(compte)) return true;
  const { stories: s, achats: a } = schema;
  const { rows } = await db().execute<{ client: boolean }>(
    sql`select exists (select 1 from ${s} where ${s.userId} = ${compte.id} and ${s.debloqueLe} is not null)
      or exists (select 1 from ${a} where ${a.userId} = ${compte.id} and ${a.statut} = 'paye') as client`,
  );
  return !!rows[0]?.client;
}

/**
 * Le compte, tel que l’écran le lit (GET /api/compte, les pages) : son email, son solde de bulles (lu avec sa session),
 * s’il est client, s’il est de l’équipe. `storyDeleted` : sa conv ouverte n’existe plus.
 */
export async function compteAffiche(utilisateur: Utilisateur, { storyDeleted }: { storyDeleted: boolean }): Promise<Account> {
  return { email: utilisateur.email, bulles: utilisateur.bulles, client: await estClient(utilisateur), equipe: estEquipe(utilisateur), storyDeleted };
}
