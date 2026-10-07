import "server-only";
import { and, isNotNull, isNull, lt } from "drizzle-orm";
import { db, schema } from "./db";

/*
 * La purge quotidienne (Vercel Cron) : on ne garde rien plus longtemps qu’utile.
 * - un brouillon jamais rattaché à un compte : effacé après 24 h ;
 * - la conv brute d’une histoire qui n’a pas été jusqu’au rapport : effacée après 30 jours ;
 * - les sessions expirées, les vieux codes de connexion et compteurs de limites.
 */
export async function purger(maintenant = new Date()) {
  const il_y_a = (jours: number) => new Date(maintenant.getTime() - jours * 86400e3);
  const brouillons = await db()
    .delete(schema.stories)
    .where(and(isNull(schema.stories.userId), lt(schema.stories.createdAt, il_y_a(1))))
    .returning({ id: schema.stories.id });
  const convs = await db()
    .update(schema.stories)
    .set({ conv: null, convPurgedAt: maintenant })
    .where(and(isNotNull(schema.stories.conv), lt(schema.stories.createdAt, il_y_a(30))))
    .returning({ id: schema.stories.id });
  const sessions = await db().delete(schema.sessions).where(lt(schema.sessions.expiresAt, maintenant)).returning({ id: schema.sessions.id });
  await db().delete(schema.loginCodes).where(lt(schema.loginCodes.expiresAt, il_y_a(1)));
  await db().delete(schema.rateLimits).where(lt(schema.rateLimits.windowStart, il_y_a(2)));
  return { brouillons: brouillons.length, convs: convs.length, sessions: sessions.length };
}
