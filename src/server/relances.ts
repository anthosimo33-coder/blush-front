import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { empreinte, memeEmpreinte } from "./chiffrement";
import { db, schema } from "./db";
import { donneesVerdict } from "./depot";
import { estEquipe } from "./droits";
import { envoyerMail } from "./email";
import { boiteAMails, env } from "./env";
import { entre } from "./invitations";
import { journal, journalErreur } from "./journal";
import { plafondsDesMails, rendre, sousLaLimite } from "./limites";
import { mailRelance } from "./mail-relance";
import type { PassageDesRelances } from "@/types/api";

/*
 * La relance par mail (l’offre unique ②, « relance_mail ») : deux heures après une feuille de paiement fermée sans payer
 * (l’offre ① montrée, src/server/offres-uniques.ts) ou une commande restée en attente (src/server/achats.ts), un mail
 * « Ta suite t’attend » (src/server/mail-relance.ts) qui rouvre cette conv sur la feuille de paiement. Une seule fois par
 * compte (sa ligne dans offres_uniques, écrite avant le mail) ; jamais pour une conv dont le rapport est payé (ou offert),
 * ni pour une conv en alerte (le mode sobre), ni à l’équipe, ni à qui la bêta fermée ne laisse pas entrer, ni après la
 * désinscription (users.relances_coupees_le, le lien signé du mail). Elle ne compte pas dans la règle des 24 h entre deux
 * offres montrées : elle suit la ① de deux heures, par définition. Envoyée par GET /api/cron/relances (la veille de
 * GitHub, toutes les 15 minutes), dans le plafond des relances du jour puis dans le quota des mails (sorte « relance »,
 * parmi les premières retenues).
 */

/** Le délai avant la relance : deux heures après la feuille fermée ou la commande laissée en attente. */
export const DELAI_RELANCE_MS = 2 * 3600e3;
/**
 * Au-delà, plus de relance pour ce moment-là : une feuille fermée il y a plus de deux jours (une veille arrêtée, la mise
 * en ligne de ce code sur des commandes anciennes) ne déclenche pas un mail à contretemps.
 */
export const FRAICHEUR_RELANCE_MS = 48 * 3600e3;
/** Au plus, les relances d’un passage de la veille (le plafond du jour les arrête souvent avant). */
const RELANCES_PAR_PASSAGE = 50;

/* Le compteur du jour des relances parties : plafondsDesMails().relances */
const RELANCES_DU_JOUR = "relances:mails";

/** Le lien signé du mail pour couper les relances de ce compte : son id, et son empreinte (personne ne peut en désinscrire un autre). */
export const lienDesinscription = (userId: string) => `${env().BLUSH_URL}/desinscription?id=${userId}&cle=${empreinte(`desinscription:${userId}`)}`;

/**
 * Coupe les relances du compte, depuis le lien de son mail. Faux si le lien n’est pas le bon ; vrai sinon, même déjà
 * coupées ou le compte effacé depuis (le lien ne dit rien de plus).
 */
export async function desinscrire(id: string, cle: string): Promise<boolean> {
  if (!memeEmpreinte(`desinscription:${id}`, cle)) return false;
  const u = schema.users;
  await db()
    .update(u)
    .set({ relancesCoupeesLe: sql`now()` })
    .where(and(eq(u.id, id), isNull(u.relancesCoupeesLe)));
  return true;
}

/** Une relance à envoyer : le compte, son email, et la conv à rouvrir. */
type Candidate = { userId: string; email: string; storyId: string };

/**
 * Les relances dues : un compte pas encore relancé et pas désinscrit, dont une conv au rapport ni débloqué ni payé a vu
 * la ① montrée sans être prise, ou une commande de son rapport rester en attente, il y a entre DELAI_RELANCE_MS et
 * FRAICHEUR_RELANCE_MS. Une par compte : la conv du moment le plus récent.
 */
async function candidates(): Promise<Candidate[]> {
  const { users: u, stories: s, offresUniques: o, achats: a } = schema;
  const { rows } = await db().execute<{ user_id: string; email: string; story_id: string }>(sql`
    select distinct on (u.id) u.id as user_id, u.email, d.story_id
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
    order by u.id, d.quand desc
    limit ${RELANCES_PAR_PASSAGE}`);
  return rows.map((r) => ({ userId: r.user_id, email: r.email, storyId: r.story_id }));
}

/**
 * Envoie les relances dues, une par compte (voir l’en-tête), et dit ce qu’il a fait en nombres seulement (la veille de
 * GitHub les écrit dans ses logs, publics). La relance est notée (offres_uniques, « relance_mail »)
 * avant son mail : deux passages en même temps n’en envoient qu’une. Le plafond du jour atteint, ou le quota des mails,
 * arrête le passage : la relance non partie est rendue, elle repartira au passage suivant (tant qu’elle est fraîche). Un
 * mail refusé par le prestataire compte comme fait (pas de nouvel essai qui userait le quota chaque quart d’heure).
 */
export async function envoyerLesRelances(): Promise<PassageDesRelances> {
  const passage: PassageDesRelances = { dues: 0, envoyees: 0, ecartees: 0, retenues: 0, echecs: 0 };
  const boite = boiteAMails();
  const o = schema.offresUniques;
  const dues = await candidates();
  passage.dues = dues.length;
  for (const c of dues) {
    /* L’équipe ne paie rien, la bêta fermée ne laisse pas entrer tout le monde, une alerte n’appelle aucune vente */
    const verdict = await donneesVerdict(c.storyId);
    if (estEquipe(c) || !(await entre(c.email)) || !verdict || verdict.sortie.alerte || verdict.sortie.mode_sobre) {
      passage.ecartees++;
      continue;
    }
    /* Le plafond du jour, compté avant (sauf la boîte des tests de bout en bout, dont les mails ne partent pas) */
    if (!boite && !(await sousLaLimite(RELANCES_DU_JOUR, plafondsDesMails().relances))) {
      await rendre(RELANCES_DU_JOUR);
      passage.retenues = dues.length - passage.envoyees - passage.ecartees - passage.echecs;
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
      partie = await envoyerMail(c.email, mailRelance({ base: env().BLUSH_URL, lien, desinscription: lienDesinscription(c.userId) }), { sorte: "relance" });
    } catch (e) {
      journalErreur("relance : mail refusé", e);
      passage.echecs++;
      continue;
    }
    if (!partie) {
      /* Retenue par le quota du prestataire : la relance n’est pas faite, elle repartira */
      await db()
        .delete(o)
        .where(and(eq(o.userId, c.userId), eq(o.offre, "relance_mail")));
      if (!boite) await rendre(RELANCES_DU_JOUR);
      passage.retenues = dues.length - passage.envoyees - passage.ecartees - passage.echecs;
      break;
    }
    passage.envoyees++;
  }
  journal("relances", passage);
  return passage;
}
