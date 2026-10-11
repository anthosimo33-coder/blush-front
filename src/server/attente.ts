import "server-only";
import { eq, lt } from "drizzle-orm";
import { empreinte, memeEmpreinte } from "./chiffrement";
import * as coffre from "./coffre";
import { db, schema } from "./db";
import type { SourceAttente } from "./db/enums";
import { envoyerMail } from "./email";
import { boiteAMails, env, peutEntrer } from "./env";
import { LIMITES, sousLaLimite } from "./limites";
import { mailAttente } from "./mail-attente";

/**
 * Combien de temps une inscription reste sur la liste (S-30) : au-delà, la purge de nuit l’efface (purgerLaListe), et
 * supprimer son compte l’efface tout de suite (src/server/comptes.ts). TODO(produit): 12 mois.
 */
export const ATTENTE_GARDEE_JOURS = 365;

/** Ce qui retrouve un email sur la liste : l’empreinte de l’email en minuscules, jamais l’email en clair. */
export const empreinteDeLaListe = (email: string) => empreinte(`attente:${email.trim().toLowerCase()}`);

/** Le lien du mail pour se retirer de la liste : l’empreinte de l’email, signée (personne ne peut en retirer un autre). */
export const lienRetrait = (emailHash: string) => `${env().BLUSH_URL}/attente/retirer?id=${emailHash}&cle=${empreinte(`retrait:${emailHash}`)}`;

/**
 * Inscrit un email sur la liste d’attente de la bêta (une seule fois, même s’il revient), et le lui écrit : l’inscription a pu
 * venir de quelqu’un d’autre, le mail donne de quoi se retirer. Un email déjà invité apprend que sa place est prête. Trois
 * mails par jour au plus pour un même email, vingt pour tous (LIMITES.mailsAttenteParJour). `convEffacee` : la conv qu’il
 * venait d’importer n’a pas été gardée.
 */
export async function inscrire(email: string, source: SourceAttente, { convEffacee = false } = {}): Promise<void> {
  const propre = email.trim().toLowerCase();
  const emailHash = empreinteDeLaListe(propre);
  await db()
    .insert(schema.waitlist)
    .values({ emailHash, email: coffre.ecrire("waitlist.email", propre), source })
    .onConflictDoNothing({ target: schema.waitlist.emailHash });
  /* Pas de rafale chez une même personne, et un plafond pour tous (le quota des mails sert d’abord aux codes, aux rapports et aux alertes) : au-delà, on inscrit sans écrire */
  if (!(await sousLaLimite(`attente:mail:${emailHash}`, LIMITES.mailAttenteParEmail))) return;
  /* Le plafond pour tous ne compte que les mails qui partent : pas ceux de la boîte des tests de bout en bout (comme les codes) */
  if (!boiteAMails() && !(await sousLaLimite("attente:mails", LIMITES.mailsAttenteParJour))) return;
  await envoyerMail(propre, mailAttente({ base: env().BLUSH_URL, place: peutEntrer(propre) ? "prete" : "liste", retrait: lienRetrait(emailHash), convEffacee }));
}

/** Retire un email de la liste, depuis le lien de son mail. Faux si le lien n’est pas le bon. */
export async function retirer(id: string, cle: string): Promise<boolean> {
  if (!memeEmpreinte(`retrait:${id}`, cle)) return false;
  await db().delete(schema.waitlist).where(eq(schema.waitlist.emailHash, id));
  return true;
}

/** Efface les inscriptions de plus de ATTENTE_GARDEE_JOURS (la purge de nuit, src/server/purge.ts). Renvoie leur nombre. */
export async function purgerLaListe(maintenant = new Date()): Promise<number> {
  const limite = new Date(maintenant.getTime() - ATTENTE_GARDEE_JOURS * 86400e3);
  return (await db().delete(schema.waitlist).where(lt(schema.waitlist.createdAt, limite)).returning({ id: schema.waitlist.id })).length;
}
