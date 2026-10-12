import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { empreinte } from "./chiffrement";
import { db, schema } from "./db";
import { peutEntrer } from "./env";

/*
 * Qui entre en bêta fermée : l’équipe et ses invités (BLUSH_ACCES_LIBRE, peutEntrer de src/server/env.ts), et les emails
 * de la liste d’attente que l’équipe a invités depuis /admin (waitlist.invite_le, posé par inviterLaListe dans
 * src/server/attente.ts). Ceux-là entrent sans les droits de l’équipe : ils paient leurs rapports et leurs bulles comme
 * tout le monde. Bêta ouverte, tout le monde entre, sans requête.
 */

/** Ce qui retrouve un email sur la liste : l’empreinte de l’email en minuscules, jamais l’email en clair. */
export const empreinteDeLaListe = (email: string) => empreinte(`attente:${email.trim().toLowerCase()}`);

/** Cet email est-il sur la liste d’attente, invité par l’équipe ? */
async function estInviteDeLaListe(email: string): Promise<boolean> {
  const w = schema.waitlist;
  const [ligne] = await db()
    .select({ id: w.id })
    .from(w)
    .where(and(eq(w.emailHash, empreinteDeLaListe(email)), isNotNull(w.inviteLe)));
  return !!ligne;
}

/**
 * Cet email peut-il se connecter ? Bêta ouverte : oui. Fermée : l’équipe et ses invités (lus dans la variable, sans
 * requête), puis les invités de la liste d’attente (lus en base). La seule question à poser pour le savoir : la demande du
 * code, sa vérification, chaque session (src/server/auth.ts) et le mail de la liste la posent ici.
 */
export const entre = async (email: string): Promise<boolean> => peutEntrer(email) || (await estInviteDeLaListe(email));
