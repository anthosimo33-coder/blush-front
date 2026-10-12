import "server-only";
import { and, eq, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { DUREE_FONCTION_S } from "./echeance";
import { auMieux } from "./journal";

/*
 * La question incluse avec le rapport (« Ta question », plan « rapport ») : une par conv. Elle passe par le chat
 * (POST /api/chat, marquée `question`), que ce plan n’ouvre pas : la route la laisse partir une fois, puis répond 402.
 * Posée veut dire : son échange est gardé dans le chat de la conv (chat_messages), la seule trace qui compte, effacée
 * avec la conv. Pour qu’elle ne parte qu’une fois au modèle, même envoyée deux fois d’un coup (deux onglets, un double
 * envoi), elle se prend avant de partir (stories.question_prise), en une seule requête : Postgres verrouille la ligne, la
 * seconde requête attend la première puis ne la trouve plus libre. Une réponse qui échoue la rend : la question se
 * repose. Une prise sans échange gardé et plus vieille qu’une fonction (coupée en route, sans avoir rien rendu) est libre.
 */

/** Une prise plus vieille ne peut plus être en route : la fonction qui l’a prise est coupée (DUREE_FONCTION_S), avec une marge. */
const EN_ROUTE_S = DUREE_FONCTION_S + 60;

/** Prend la question incluse de cette conv : vrai si elle était libre (ni posée, ni en route), et elle part. */
export async function prendreLaQuestion(storyId: string): Promise<boolean> {
  const s = schema.stories;
  const prises = await db()
    .update(s)
    .set({ questionPrise: sql`now()` })
    .where(
      and(
        eq(s.id, storyId),
        or(isNull(s.questionPrise), lt(s.questionPrise, sql`now() - make_interval(secs => ${EN_ROUTE_S})`)),
        notExists(
          db()
            .select({ un: sql`1` })
            .from(schema.chatMessages)
            .where(eq(schema.chatMessages.storyId, storyId)),
        ),
      ),
    )
    .returning({ id: s.id });
  return prises.length > 0;
}

/**
 * Rend la question prise : la réponse a échoué, elle se repose. Sans effet une fois son échange gardé (prendreLaQuestion
 * le voit) : on peut la rendre après n’importe quel échec. Ne fait jamais échouer la réponse (une ligne au journal).
 */
export const rendreLaQuestion = (storyId: string) =>
  auMieux(() => db().update(schema.stories).set({ questionPrise: null }).where(eq(schema.stories.id, storyId)), "question incluse non rendue", { histoire: storyId });
