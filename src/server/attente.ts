import "server-only";
import { and, asc, count, eq, isNull, lt, sql } from "drizzle-orm";
import { empreinte, memeEmpreinte } from "./chiffrement";
import * as coffre from "./coffre";
import { db, schema } from "./db";
import type { SourceAttente } from "./db/enums";
import { envoyerMail } from "./email";
import { boiteAMails, env } from "./env";
import { empreinteDeLaListe, entre } from "./invitations";
import { compteDe, LIMITES, plafondsDesMails, rendre, sousLaLimite } from "./limites";
import { journalErreur } from "./journal";
import { mailAttente } from "./mail-attente";
import { INVITATIONS_PAR_LOT } from "@/lib/limites";

/**
 * Combien de temps une inscription reste sur la liste (S-30) : au-delà, la purge de nuit l’efface (purgerLaListe), et
 * supprimer son compte l’efface tout de suite (src/server/comptes.ts). Douze mois, comptés depuis l’invitation pour un
 * invité (il entre tant qu’il est sur la liste).
 */
export const ATTENTE_GARDEE_JOURS = 365;

/** Le lien du mail pour se retirer de la liste : l’empreinte de l’email, signée (personne ne peut en retirer un autre). */
export const lienRetrait = (emailHash: string) => `${env().BLUSH_URL}/attente/retirer?id=${emailHash}&cle=${empreinte(`retrait:${emailHash}`)}`;

/**
 * Inscrit un email sur la liste d’attente de la bêta (une seule fois, même s’il revient), et le lui écrit : l’inscription a pu
 * venir de quelqu’un d’autre, le mail donne de quoi se retirer. Un email déjà invité apprend que sa place est prête. Trois
 * mails par jour au plus pour un même email, vingt pour tous au défaut (plafondsDesMails().attente). `convEffacee` : la conv qu’il
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
  if (!boiteAMails() && !(await sousLaLimite(MAILS_DE_LA_LISTE, plafondsDesMails().attente))) return;
  /* Le moins nécessaire des mails : le premier retenu quand le quota du prestataire se remplit (plafondsDesMails) */
  await envoyerMail(propre, mailAttente({ base: env().BLUSH_URL, place: (await entre(propre)) ? "prete" : "liste", retrait: lienRetrait(emailHash), convEffacee }), {
    sorte: "attente",
  });
}

/** Retire un email de la liste, depuis le lien de son mail. Faux si le lien n’est pas le bon. */
export async function retirer(id: string, cle: string): Promise<boolean> {
  if (!memeEmpreinte(`retrait:${id}`, cle)) return false;
  await db().delete(schema.waitlist).where(eq(schema.waitlist.emailHash, id));
  return true;
}

/** Efface les inscriptions de plus de ATTENTE_GARDEE_JOURS, depuis l’invitation pour un invité (la purge de nuit, src/server/purge.ts). */
export async function purgerLaListe(maintenant = new Date()): Promise<void> {
  const limite = new Date(maintenant.getTime() - ATTENTE_GARDEE_JOURS * 86400e3);
  const w = schema.waitlist;
  await db()
    .delete(w)
    .where(lt(sql`coalesce(${w.inviteLe}, ${w.createdAt})`, limite));
}

/* Le compteur du jour des mails de la liste (inscriptions et invitations ensemble) : plafondsDesMails().attente */
const MAILS_DE_LA_LISTE = "attente:mails";

/** Ce qu’un lot d’invitations a fait : les mails partis, ceux qui restent à inviter, et si le plafond des mails du jour l’a arrêté. */
export type LotInvite = { invites: number; restent: number; plafond: boolean };

/**
 * Invite les `n` plus anciens de la liste d’attente pas encore invités (INVITATIONS_PAR_LOT au plus) : à chacun, le mail
 * « Ta place est prête », et son invitation (waitlist.invite_le), qui le laisse entrer en bêta fermée (entre,
 * src/server/invitations.ts), sans les droits de l’équipe. Un par un, dans le plafond des mails de la liste
 * (plafondsDesMails().attente, partagé avec les inscriptions) puis dans le quota du prestataire (sorte « attente », la
 * première retenue) : le premier mail retenu arrête le lot, et la personne reste à inviter. Un invité n’est noté qu’une
 * fois son mail parti : personne n’entre sans le savoir. Deux lots en même temps ne prennent jamais la même personne
 * (la ligne est prise avant le mail). L’équipe le voit dans /admin, et l’action va au journal de l’équipe (equipe.ts).
 */
export async function inviterLaListe(n: number): Promise<LotInvite> {
  const w = schema.waitlist;
  const base = env().BLUSH_URL;
  const boite = boiteAMails();
  let invites = 0;
  let plafond = false;
  const aInviter = await db()
    .select({ id: w.id })
    .from(w)
    .where(isNull(w.inviteLe))
    .orderBy(asc(w.createdAt))
    .limit(Math.max(0, Math.min(n, INVITATIONS_PAR_LOT)));
  for (const { id } of aInviter) {
    /* Le plafond des mails de la liste, compté avant : sans place, le lot s’arrête là (sauf la boîte des tests, comme inscrire) */
    if (!boite && !(await sousLaLimite(MAILS_DE_LA_LISTE, plafondsDesMails().attente))) {
      await rendre(MAILS_DE_LA_LISTE);
      plafond = true;
      break;
    }
    /* La ligne prise (personne d’autre ne l’invite en même temps), le mail envoyé, puis gardée ou rendue */
    const [prise] = await db()
      .update(w)
      .set({ inviteLe: sql`now()` })
      .where(and(eq(w.id, id), isNull(w.inviteLe)))
      .returning({ email: w.email, emailHash: w.emailHash });
    if (!prise) {
      if (!boite) await rendre(MAILS_DE_LA_LISTE);
      continue;
    }
    const email = coffre.lire("waitlist.email", prise.email);
    let parti = false;
    try {
      parti = await envoyerMail(email, mailAttente({ base, place: "prete", retrait: lienRetrait(prise.emailHash) }), { sorte: "attente" });
    } catch (e) {
      journalErreur("invitation de la liste : mail refusé", e);
    }
    if (!parti) {
      await db().update(w).set({ inviteLe: null }).where(eq(w.id, id));
      if (!boite) await rendre(MAILS_DE_LA_LISTE);
      plafond = true;
      break;
    }
    invites++;
  }
  const [reste] = await db().select({ n: count() }).from(w).where(isNull(w.inviteLe));
  return { invites, restent: reste?.n ?? 0, plafond };
}

/** La liste d’attente, pour /admin : combien sont inscrits, combien invités, et combien de mails de la liste peuvent encore partir aujourd’hui. */
export async function etatDeLaListe(): Promise<{ inscrits: number; invites: number; mailsPossibles: number }> {
  const w = schema.waitlist;
  const [l] = await db()
    .select({ inscrits: count(), invites: count(w.inviteLe) })
    .from(w);
  const { max, fenetreS } = plafondsDesMails().attente;
  const partis = await compteDe(MAILS_DE_LA_LISTE, { fenetreS });
  return { inscrits: l?.inscrits ?? 0, invites: l?.invites ?? 0, mailsPossibles: Math.max(0, max - partis) };
}
