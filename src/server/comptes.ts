import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { empreinteDeLaListe } from "./attente";
import { empreinte } from "./chiffrement";
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

/**
 * « Tout effacer » (S-30) : le compte, ses sessions et ses convs (et tout ce qui en vient), en cascade ; et ce qui ne lui
 * est pas rattaché : le brouillon de ce navigateur (une conv importée pas encore lue, `brouillon` : le secret de son
 * cookie, src/server/cookies.ts), et l’inscription de son email à la liste d’attente. Tout ou rien.
 */
export async function supprimerCompte({ id, email }: { id: string; email: string }, { brouillon }: { brouillon?: string } = {}): Promise<void> {
  await db().transaction(async (tx) => {
    if (brouillon) await tx.delete(schema.stories).where(and(eq(schema.stories.draftToken, empreinte(brouillon)), isNull(schema.stories.userId)));
    await tx.delete(schema.waitlist).where(eq(schema.waitlist.emailHash, empreinteDeLaListe(email)));
    await tx.delete(schema.users).where(eq(schema.users.id, id));
  });
}
