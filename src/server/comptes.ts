import "server-only";
import { eq } from "drizzle-orm";
import { empreinteDeLaListe } from "./attente";
import { db, schema } from "./db";
import { duBrouillon } from "./histoires";

/*
 * Ce qui change un compte (la table users), écrit une fois : son effacement. Ses bulles changent dans
 * src/server/bulles.ts, ses rapports se débloquent dans src/server/achats.ts. La connexion et les sessions sont dans
 * auth.ts ; ce qu’un écran montre du compte, dans droits.ts (compteAffiche).
 */

/**
 * « Tout effacer » (S-30) : le compte, ses sessions et ses convs (et tout ce qui en vient), en cascade ; et ce qui ne lui
 * est pas rattaché : le brouillon de ce navigateur (une conv importée pas encore lue, `brouillon` : le secret de son
 * cookie, src/server/cookies.ts), les codes de connexion de son email encore en cours (une ligne par navigateur, l’email
 * en clair), et l’inscription de son email à la liste d’attente. Celle d’un alias (lea+x@) reste : la liste range l’email
 * tel quel, jusqu’au lien de son mail ou à la purge. Tout ou rien.
 */
export async function supprimerCompte({ id, email }: { id: string; email: string }, { brouillon }: { brouillon?: string } = {}): Promise<void> {
  await db().transaction(async (tx) => {
    if (brouillon) await tx.delete(schema.stories).where(duBrouillon(brouillon));
    await tx.delete(schema.loginCodes).where(eq(schema.loginCodes.email, email));
    await tx.delete(schema.waitlist).where(eq(schema.waitlist.emailHash, empreinteDeLaListe(email)));
    await tx.delete(schema.users).where(eq(schema.users.id, id));
  });
}
