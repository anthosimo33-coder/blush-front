import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";

/*
 * Ce qui change un compte (la table users), écrit une fois : son plan, sa pause, son effacement. La connexion et les
 * sessions sont dans auth.ts ; ce qu’un écran montre du compte, dans donnees.ts (compteDe).
 */

/**
 * Le compte passe à BLUSH+. v1, sans paiement : au déblocage d’un email de la bêta (POST /api/debloquer), ou à la
 * connexion d’un email ajouté à BLUSH_ACCES_LIBRE après coup (src/server/auth.ts, compteDe).
 */
export async function passerEnBlushPlus(userId: string): Promise<void> {
  await db().update(schema.users).set({ plan: "blushplus" }).where(eq(schema.users.id, userId));
}

/** Met BLUSH en pause pour ce compte, ou le reprend. */
export async function mettreEnPause(userId: string, paused: boolean): Promise<void> {
  await db().update(schema.users).set({ paused }).where(eq(schema.users.id, userId));
}

/** Efface le compte, ses sessions et ses convs (et tout ce qui en vient), en cascade. */
export async function supprimerCompte(userId: string): Promise<void> {
  await db().delete(schema.users).where(eq(schema.users.id, userId));
}
