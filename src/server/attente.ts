import "server-only";
import { eq } from "drizzle-orm";
import { chiffrer, empreinte, memeEmpreinte } from "./chiffrement";
import { db, schema } from "./db";
import { envoyerMail } from "./email";
import { env, peutEntrer } from "./env";
import { LIMITES, sousLaLimite } from "./limites";
import { mailAttente } from "./mail-attente";

/** Le lien du mail pour se retirer de la liste : l’empreinte de l’email, signée (personne ne peut en retirer un autre). */
export const lienRetrait = (emailHash: string) => `${env().BLUSH_URL}/attente/retirer?id=${emailHash}&cle=${empreinte(`retrait:${emailHash}`)}`;

/**
 * Inscrit un email sur la liste d’attente de la bêta (une seule fois, même s’il revient), et le lui écrit : l’inscription a pu
 * venir de quelqu’un d’autre, le mail donne de quoi se retirer. Un email déjà invité apprend que sa place est prête. Trois
 * mails par jour au plus pour un même email. `convEffacee` : la conv qu’il venait d’importer n’a pas été gardée.
 */
export async function inscrire(email: string, source: "accueil" | "connexion", { convEffacee = false } = {}): Promise<void> {
  const propre = email.trim().toLowerCase();
  const emailHash = empreinte(`attente:${propre}`);
  await db()
    .insert(schema.waitlist)
    .values({ emailHash, email: chiffrer(propre), source })
    .onConflictDoNothing({ target: schema.waitlist.emailHash });
  if (!(await sousLaLimite(`attente:mail:${emailHash}`, LIMITES.mailAttenteParEmail))) return;
  await envoyerMail(propre, mailAttente({ base: env().BLUSH_URL, place: peutEntrer(propre) ? "prete" : "liste", retrait: lienRetrait(emailHash), convEffacee }));
}

/** Retire un email de la liste, depuis le lien de son mail. Faux si le lien n’est pas le bon. */
export async function retirer(id: string, cle: string): Promise<boolean> {
  if (!memeEmpreinte(`retrait:${id}`, cle)) return false;
  await db().delete(schema.waitlist).where(eq(schema.waitlist.emailHash, id));
  return true;
}
