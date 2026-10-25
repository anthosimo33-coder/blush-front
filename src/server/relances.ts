import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { alerteSobre } from "@prompts/lib/titres";
import { empreinte, memeEmpreinte } from "./chiffrement";
import { db, schema } from "./db";
import { donneesVerdict } from "./depot";
import { estEquipe } from "./droits";
import { envoyerMail, refusDuPrestataire } from "./email";
import { boiteAMails, env } from "./env";
import { entre } from "./invitations";
import { journal, journalErreur } from "./journal";
import { plafondsDesMails, rendre, sousLaLimite } from "./limites";
import { mailRelance } from "./mail-relance";
import { etatDesTaches } from "./taches";
import { ECART_OFFRES_UNIQUES_MS } from "@/contenu/offres";
import type { Desinscription } from "@/types";
import type { PassageDesRelances } from "@/types/api";

/*
 * La relance par mail (l’offre unique ②, « relance_mail ») : deux heures après une feuille de paiement fermée sans payer
 * (l’offre ① montrée, src/server/offres-uniques.ts) ou une commande restée en attente (src/server/achats.ts), un mail
 * « Ton rapport t’attend » (src/server/mail-relance.ts) qui rouvre cette conv sur la feuille de paiement. Une seule fois par
 * compte (sa ligne dans offres_uniques, écrite avant le mail) ; jamais pour une conv dont le rapport est payé (ou offert),
 * ni pour une conv en alerte (le mode sobre), ni à l’équipe, ni à qui la bêta fermée ne laisse pas entrer, ni après la
 * désinscription (users.relances_coupees_le, le lien signé du mail). Dans la règle des 24 h entre deux offres montrées
 * (src/server/offres-uniques.ts), seule la ① ne la retient pas : elle la suit de deux heures, par définition. Une ③ ou
 * une ④ (arrêtée le 23 octobre 2026) montrée dans les 24 h la fait attendre (tant qu’elle reste fraîche). Envoyée par GET /api/cron/relances (Vercel
 * Cron, toutes les 5 minutes), dans le plafond des relances du jour puis dans le quota des mails (sorte
 * « relance », parmi les premières retenues), du sous-domaine des relances (BLUSH_EMAIL_FROM_MARKETING, expediteurDe dans
 * src/server/email.ts) comme les séquences.
 */

/** Le délai avant la relance : deux heures après la feuille fermée ou la commande laissée en attente. */
export const DELAI_RELANCE_MS = 2 * 3600e3;
/**
 * Au-delà, plus de relance pour ce moment-là : une feuille fermée il y a plus de deux jours (une veille arrêtée, la mise
 * en ligne de ce code sur des commandes anciennes) ne déclenche pas un mail à contretemps.
 */
export const FRAICHEUR_RELANCE_MS = 48 * 3600e3;
/**
 * Au plus, les relances parties d’un passage de la veille (le plafond du jour les arrête souvent avant). Il compte les
 * mails partis, pas les relances dues : celles qu’on écarte (une alerte, l’équipe) ne prennent la place de personne.
 */
const RELANCES_PAR_PASSAGE = 50;

/* Le compteur du jour des relances parties : plafondsDesMails().relances */
const RELANCES_DU_JOUR = "relances:mails";

/**
 * Le lien signé d’un mail pour couper ce genre de mails à ce compte (`quoi` : les offres, dont la relance, ou les conseils
 * des séquences, src/server/sequences.ts) : son id, et son empreinte (personne ne peut en désinscrire un autre). La
 * signature ne dépend que du compte : sur la page, il peut aussi tout couper.
 */
export const lienDesinscription = (userId: string, quoi: Exclude<Desinscription, "tout"> = "offres") =>
  `${env().BLUSH_URL}/desinscription?id=${userId}&cle=${empreinte(`desinscription:${userId}`)}${quoi === "offres" ? "" : `&quoi=${quoi}`}`;

/**
 * L’adresse de la désinscription en un clic (RFC 8058) de ce genre de mails pour ce compte : celle des en-têtes
 * List-Unsubscribe, que la messagerie (Gmail, Yahoo…) appelle elle-même en POST quand on touche « Se désabonner » à côté
 * de l’expéditeur (POST /api/desinscription/un-clic). Signée comme le lien du pied.
 */
export const lienDesinscriptionUnClic = (userId: string, quoi: Exclude<Desinscription, "tout"> = "offres") =>
  `${env().BLUSH_URL}/api/desinscription/un-clic?id=${userId}&cle=${empreinte(`desinscription:${userId}`)}&quoi=${quoi}`;

/**
 * Les en-têtes de la désinscription en un clic d’un mail des séquences ou de la relance : List-Unsubscribe (l’adresse
 * signée) et List-Unsubscribe-Post, sans lesquels Gmail et Yahoo ne montrent pas « Se désabonner » et comptent plus de
 * signalements de spam (leurs règles des envois en nombre, février 2024).
 */
export const entetesDeDesinscription = (userId: string, quoi: Exclude<Desinscription, "tout">): Record<string, string> => ({
  "List-Unsubscribe": `<${lienDesinscriptionUnClic(userId, quoi)}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
});

/**
 * Coupe ce genre de mails au compte, depuis le lien de son mail : les offres (users.relances_coupees_le), les conseils
 * (users.conseils_coupes_le), ou les deux. Faux si le lien n’est pas le bon ; vrai sinon, même déjà coupés ou le compte
 * effacé depuis (le lien ne dit rien de plus).
 */
export async function desinscrire(id: string, cle: string, quoi: Desinscription = "offres"): Promise<boolean> {
  if (!memeEmpreinte(`desinscription:${id}`, cle)) return false;
  const u = schema.users;
  if (quoi !== "conseils")
    await db()
      .update(u)
      .set({ relancesCoupeesLe: sql`now()` })
      .where(and(eq(u.id, id), isNull(u.relancesCoupeesLe)));
  if (quoi !== "offres")
    await db()
      .update(u)
      .set({ conseilsCoupesLe: sql`now()` })
      .where(and(eq(u.id, id), isNull(u.conseilsCoupesLe)));
  return true;
}

/** Une relance à envoyer : le compte, son email, et la conv à rouvrir. */
type Candidate = { userId: string; email: string; storyId: string };

/**
 * Les relances dues : un compte pas encore relancé et pas désinscrit, dont une conv au rapport ni débloqué ni payé a vu
 * la ① montrée sans être prise, ou une commande de son rapport rester en attente, il y a entre DELAI_RELANCE_MS et
 * FRAICHEUR_RELANCE_MS, et à qui ni ③ ni ④ n’a été montrée dans les 24 h. Une par compte : la conv du moment le plus
 * récent. Toutes, les plus anciennes d’abord (les plus près de passer) : la fenêtre de 48 h les borne.
 */
async function candidates(): Promise<Candidate[]> {
  const { users: u, stories: s, offresUniques: o, achats: a } = schema;
  const { rows } = await db().execute<{ user_id: string; email: string; story_id: string }>(sql`
    select user_id, email, story_id from (
    select distinct on (u.id) u.id as user_id, u.email, d.story_id, d.quand
    from (
      select ${o.userId} as user_id, ${o.storyId} as story_id, ${o.montreeLe} as quand from ${o}
        where ${o.offre} = 'suite' and ${o.priseLe} is null and ${o.storyId} is not null
      union all
      select ${a.userId}, ${a.storyId}, ${a.creeLe} from ${a}
        where ${a.statut} = 'en_attente' and ${a.storyId} is not null and ${a.offre} in ('rapport', 'premium', 'suite')
    ) d
    join ${u} u on u.id = d.user_id
    join ${s} on ${s.id} = d.story_id and ${s.userId} = u.id and ${s.debloqueLe} is null
    where d.quand <= now() - make_interval(secs => ${DELAI_RELANCE_MS / 1000})
      and d.quand > now() - make_interval(secs => ${FRAICHEUR_RELANCE_MS / 1000})
      and u.relances_coupees_le is null
      and not exists (select 1 from ${o} r where r.user_id = u.id and r.offre = 'relance_mail')
      and not exists (select 1 from ${a} p where p.story_id = d.story_id and p.statut = 'paye')
      and not exists (select 1 from ${o} x where x.user_id = u.id and x.offre in ('premium_ajout', 'premiere_recharge')
        and x.montree_le > now() - make_interval(secs => ${ECART_OFFRES_UNIQUES_MS / 1000}))
    order by u.id, d.quand desc
    ) dues
    order by quand, user_id`);
  return rows.map((r) => ({ userId: r.user_id, email: r.email, storyId: r.story_id }));
}

/**
 * Envoie les relances dues, une par compte (voir l’en-tête), et dit ce qu’il a fait en nombres seulement (la veille de
 * GitHub les écrit dans ses logs, publics). La relance est notée (offres_uniques, « relance_mail »)
 * avant son mail : deux passages en même temps n’en envoient qu’une. Le plafond du jour atteint, ou le quota des mails,
 * arrête le passage : la relance non partie est rendue, elle repartira au passage suivant (tant qu’elle est fraîche). De
 * même quand le prestataire la refuse sans regarder l’adresse (trop vite, une panne, la clé : refusDuPrestataire) : le
 * mail n’est pas parti. Une adresse refusée, ou un mail perdu en route (il a pu partir), compte comme fait : pas de
 * nouvel essai qui userait le quota chaque quart d’heure, ni de second mail.
 */
export async function envoyerLesRelances(): Promise<PassageDesRelances> {
  const passage: PassageDesRelances = { dues: 0, envoyees: 0, ecartees: 0, retenues: 0, echecs: 0 };
  /* Les mails aux prospects allumés : S1 (src/server/sequences.ts) remplace la relance, deux heures après le paywall */
  if (env().BLUSH_MAILS_PROSPECTS) return passage;
  const boite = boiteAMails();
  const o = schema.offresUniques;
  const dues = await candidates();
  passage.dues = dues.length;
  for (const [k, c] of dues.entries()) {
    if (passage.envoyees >= RELANCES_PAR_PASSAGE) {
      passage.retenues = dues.length - k;
      break;
    }
    /*
     * L’équipe ne paie rien, la bêta fermée ne laisse pas entrer tout le monde, le mode sobre n’appelle aucun mail (la
     * règle de l’âge, ou un rapport doux gardé). « Danger » et « détresse » sont relancés comme les autres depuis le 22
     * octobre 2026 (décision validée par l’avocat). Sans
     * verdict, seule une conv qui attend son paiement (le paywall d’abord, rien de lu) est relancée
     */
    const verdict = await donneesVerdict(c.storyId);
    const attendSonPaiement = !verdict && (await etatDesTaches(c.storyId, ["verdict"])).verdict?.status === "paiement";
    if (estEquipe(c) || !(await entre(c.email)) || (!verdict && !attendSonPaiement) || (verdict && (verdict.sortie.mode_sobre || alerteSobre(verdict.sortie.alerte)))) {
      passage.ecartees++;
      continue;
    }
    /* Le plafond du jour, compté avant (sauf la boîte des tests de bout en bout, dont les mails ne partent pas) */
    if (!boite && !(await sousLaLimite(RELANCES_DU_JOUR, plafondsDesMails().relances))) {
      await rendre(RELANCES_DU_JOUR);
      passage.retenues = dues.length - k;
      break;
    }
    const [notee] = await db().insert(o).values({ userId: c.userId, offre: "relance_mail", storyId: c.storyId }).onConflictDoNothing().returning({ userId: o.userId });
    if (!notee) {
      if (!boite) await rendre(RELANCES_DU_JOUR);
      continue;
    }
    const lien = `${env().BLUSH_URL}/ouvrir/${c.storyId}?paiement=1`;
    let partie: boolean;
    try {
      partie = await envoyerMail(
        c.email,
        { ...mailRelance({ base: env().BLUSH_URL, lien, desinscription: lienDesinscription(c.userId) }), entetes: entetesDeDesinscription(c.userId, "offres") },
        { sorte: "relance" },
      );
    } catch (e) {
      journalErreur("relance : mail refusé", e);
      if (refusDuPrestataire(e)) partie = false;
      else {
        passage.echecs++;
        continue;
      }
    }
    if (!partie) {
      /* Retenue par le quota du prestataire, ou refusée par lui sans être partie : la relance n’est pas faite, elle repartira */
      await db()
        .delete(o)
        .where(and(eq(o.userId, c.userId), eq(o.offre, "relance_mail")));
      if (!boite) await rendre(RELANCES_DU_JOUR);
      passage.retenues = dues.length - k;
      break;
    }
    passage.envoyees++;
  }
  journal("relances", passage);
  return passage;
}
