import "server-only";
import { and, isNotNull, isNull, lt, not } from "drizzle-orm";
import { purgerLaListe } from "./attente";
import { db, schema } from "./db";
import { PREDICATS } from "./depot";

/*
 * La purge quotidienne (Vercel Cron) : on ne garde rien plus longtemps qu’utile.
 * - un brouillon jamais rattaché à un compte : effacé après 24 h ;
 * - une conv rattachée à un compte mais jamais lue (connecté, puis arrêté avant « Qui es-tu ? ») : pareil ;
 * - la conv brute d’une histoire dont le rapport est écrit, mais dont la mémoire n’a jamais pu se faire : effacée après
 *   30 jours (sinon, elle part dès la mémoire faite). Sans rapport, elle reste, chiffrée, jusqu’au déblocage : c’est
 *   d’elle que le rapport s’écrira (choix du 9 octobre 2026). Supprimer l’histoire ou le compte l’efface ;
 * - les sessions expirées, les vieux codes de connexion et compteurs de limites ;
 * - les inscriptions à la liste d’attente de plus d’un an (ATTENTE_GARDEE_JOURS, src/server/attente.ts).
 */
export async function purger(maintenant = new Date()) {
  const il_y_a = (jours: number) => new Date(maintenant.getTime() - jours * 86400e3);
  const brouillons = await db()
    .delete(schema.stories)
    .where(and(isNull(schema.stories.userId), lt(schema.stories.createdAt, il_y_a(1))))
    .returning({ id: schema.stories.id });
  /* Les tâches restent une fois finies : une histoire sans aucune tâche n’a jamais été lue */
  const jamaisLues = await db()
    .delete(schema.stories)
    .where(
      and(
        isNotNull(schema.stories.userId),
        lt(schema.stories.createdAt, il_y_a(1)),
        not(PREDICATS.lue),
      ),
    )
    .returning({ id: schema.stories.id });
  const convs = await db()
    .update(schema.stories)
    .set({ conv: null, convPurgedAt: maintenant })
    .where(
      and(
        PREDICATS.convGardee,
        lt(schema.stories.createdAt, il_y_a(30)),
        PREDICATS.rapportPret,
      ),
    )
    .returning({ id: schema.stories.id });
  const sessions = await db().delete(schema.sessions).where(lt(schema.sessions.expiresAt, maintenant)).returning({ id: schema.sessions.id });
  await db().delete(schema.loginCodes).where(lt(schema.loginCodes.expiresAt, il_y_a(1)));
  await db().delete(schema.rateLimits).where(lt(schema.rateLimits.windowStart, il_y_a(2)));
  await purgerLaListe(maintenant);
  return { brouillons: brouillons.length + jamaisLues.length, convs: convs.length, sessions: sessions.length };
}
