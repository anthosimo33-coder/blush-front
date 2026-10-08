import "server-only";
import { chiffrer, empreinte } from "./chiffrement";
import { db, schema } from "./db";

/** Inscrit un email sur la liste d’attente de la bêta (une seule fois, même s’il revient). */
export async function inscrire(email: string, source: "accueil" | "connexion"): Promise<void> {
  const propre = email.trim().toLowerCase();
  await db()
    .insert(schema.waitlist)
    .values({ emailHash: empreinte(`attente:${propre}`), email: chiffrer(propre), source })
    .onConflictDoNothing({ target: schema.waitlist.emailHash });
}
