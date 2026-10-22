import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql, type SQL } from "drizzle-orm";
import {
  mailAnniversaire,
  mailApresGlace,
  mailAvance,
  mailEndormi,
  mailGarde,
  mailChapitres,
  mailDerniereChance,
  mailGlace,
  mailHautDuPaywall,
  mailParfait,
  mailParrainage,
  mailPeuDeBulles,
  mailProchainPas,
  mailRepondre,
  mailReponsePrete,
  mailSansConv,
  mailSansConvPeur,
  mailSansConvQuestion,
  mailTemperature,
  mailVocal,
  mailZeroBulle,
  NIVEAUX_A_FRANCHIR,
  NOMS_DES_MAILS,
  type MailDeSequence,
  type Personnes,
} from "@/contenu/mails";
import { hautDuPaywall } from "@/contenu/haut-du-paywall";
import { scaleOf } from "@/contenu/niveaux";
import { RAPPORT_D_AVANCE } from "@/contenu/offres";
import type { LevelId } from "@/types";
import { dateDAnniversaire, prochainAnniversaire } from "./anniversaires";
import { db, schema } from "./db";
import { donneesMemoire, donneesVerdict } from "./depot";
import { estEquipe } from "./droits";
import { envoyerMail, refusDuPrestataire } from "./email";
import { boiteAMails, env } from "./env";
import { histoireDe, metaDe, quiRempli, type Meta } from "./histoires";
import { entre } from "./invitations";
import { alerter } from "./alertes";
import { auMieux, journal, journalErreur } from "./journal";
import { LIMITES, rendre, sousLaLimite } from "./limites";
import { mailDeSequence } from "./mail-sequence";
import { montrer, rouvrirLaSuite } from "./offres-uniques";
import { suiteVendable } from "./paiement/commande";
import { lienDeParrainage } from "./parrainage";
import { entetesDeDesinscription, lienDesinscription } from "./relances";
import { rechargeDejaPayee } from "./achats";

/*
 * Les séquences de mails (la V3 du canvas « BLUSH · Séquences mail », le 17 octobre ; leurs textes dans
 * src/contenu/mails.ts, leur gabarit dans src/server/mail-sequence.ts). Le lot 1 :
 * - S3, après l’achat, sur la dernière conv débloquée du compte : J0 « ton rapport est prêt » (src/server/analyse.ts,
 *   noté ici), J+1 « il t’a répondu ? » (rien dit au chat depuis), J+2 le vocal (pas encore écouté), J+4 son prochain pas
 *   (🔥 🤏 🤔), ou après un 🧊, « comment tu vas, vraiment ? » (rien à vendre, le 3114). Des conseils. Puis, après un
 *   🔥 seulement, J+5 le parrainage (src/server/parrainage.ts) : une offre.
 * - S4, les bulles : la réponse écrite à 0 bulle qui attend sa recharge, 2 bulles ou moins, puis à zéro depuis 3 jours.
 *   Des offres.
 * Le lot 3, allumé par BLUSH_MAILS_PROSPECTS (« 1 » en production depuis le 17 octobre : le juriste l’a validé sans case
 * d’accord à l’inscription) :
 * - S1, le paywall vu sans payer : H+2 le titre de son paywall et ses chiffres, J+1 ses 8 chapitres. Ils remplacent la
 *   relance ② (src/server/relances.ts), qui s’arrête quand ils s’allument. Des offres.
 * - S2, un compte sans conv : H+1, J+1, J+4, vers une nouvelle conv. Des offres.
 *   J+6, la « dernière fois », en A/B (groupeDuJ6) : la moitié reçoit la one time offer ① rouverte jusqu’à après-demain
 *   minuit (rouvrirLaSuite), l’autre rien (le témoin).
 * S1 J+3, une réponse offerte, est abandonnée (le 17 octobre : pas rentable).
 * Le lot 2 :
 * - S5, le chat endormi, sur la dernière conv débloquée, à qui il reste des bulles : 7 jours sans un mot au chat (leur
 *   niveau, avant d’être ensemble), 21 jours (« parfait, ou abandonné ? »), et un couple chaque mois depuis le rapport
 *   (sa température). Jamais après un 🧊. Des conseils.
 * - S6, les offres gardées : le −50 % gardé (⑥) un à trois jours avant sa fin, le rapport d’avance (⑤) payé qui dort
 *   depuis une semaine. Des offres.
 * - S7, trois semaines après un 🧊, sans nouvelle conv depuis : rien de l’ancienne histoire. Une offre.
 * - S8, son anniversaire dans deux ou trois jours, quand un fait de sa fiche en dit la date entière
 *   (src/server/anniversaires.ts) : cherché deux fois par jour au plus (il faut lire les fiches). Un conseil.
 * Les règles, pour tous :
 * - jamais la nuit (HEURES_CALMES, à Paris), et un mail des séquences par jour au plus (aucun s’il en est parti un, ou la
 *   relance ②, dans les ECART_ENTRE_DEUX_MAILS_MS) ;
 * - chaque mail une fois par occasion (envois_mails : la conv pour S3, la recharge ou la réponse prête pour S4), noté
 *   avant de partir (deux passages en même temps n’en envoient qu’un) et effacé s’il ne part pas ;
 * - jamais à l’équipe, ni à qui la bêta fermée ne laisse pas entrer, ni sur une conv en alerte (le mode sobre), ni sans
 *   « Qui es-tu ? » rempli (ni prénom ni pronom à accorder) ;
 * - les conseils s’arrêtent à users.conseils_coupes_le, les offres à users.relances_coupees_le (le lien de leur pied) ;
 * - un garde-fou de LIMITES.sequencesParJour (300) par 24 h, contre un envoi anormal (l’équipe prévenue), puis le quota
 *   des mails du prestataire (sorte « relance ») ; plus le plafond de la relance (décidé le 17 octobre : s’il en faut 60,
 *   il en part 60) ;
 * - la désinscription en un clic dans leurs en-têtes (List-Unsubscribe, entetesDeDesinscription), que Gmail et Yahoo
 *   montrent à côté de l’expéditeur : moins de signalements de spam, la délivrabilité du domaine gardée ;
 * - ils partent du sous-domaine des relances (BLUSH_EMAIL_FROM_MARKETING, expediteurDe dans src/server/email.ts) : leurs
 *   plaintes n’entraînent pas les codes de connexion. Les rebonds et les plaintes de chacun se lisent dans /admin
 *   (src/server/delivrabilite.ts).
 * Envoyés par GET /api/cron/relances (Vercel Cron, toutes les 5 minutes), juste après les relances.
 * TODO(produit): à relire par un juriste : des mails commerciaux (S4, S6, S7) à des clients, pour des services analogues
 * (article L34-5 du Code des postes et des communications électroniques), et leur lien de désinscription.
 */

/** Les heures de Paris où rien ne part : de 23 h à 8 h. */
const HEURES_CALMES = { de: 23, a: 8 } as const;

/** Entre deux mails des séquences au même compte, au moins ce temps : un par jour, à quelques heures près. */
export const ECART_ENTRE_DEUX_MAILS_MS = 20 * 3600e3;

/** Au plus, les mails des séquences partis d’un passage des 5 minutes : les suivants partent au passage d’après. */
const MAILS_PAR_PASSAGE = 50;

/* Le compteur des mails des séquences partis en 24 h : le garde-fou LIMITES.sequencesParJour */
const SEQUENCES_DU_JOUR = "sequences:mails";

const HEURE = 3600e3;
const JOUR = 24 * HEURE;

/**
 * Les mails des séquences (envois_mails.cle) : ce qu’ils sont pour la désinscription, ou null pour « ton rapport est
 * prêt », qu’elle a demandé (il part toujours, et compte pour le mail du jour).
 */
const MAILS = {
  s3_rapport: null,
  s3_repondre: "conseils",
  s3_vocal: "conseils",
  s3_pas: "conseils",
  s3_parrainage: "offres",
  s4_prete: "offres",
  s4_peu: "offres",
  s4_zero: "offres",
  s5_endormi: "conseils",
  s5_parfait: "conseils",
  s5_couple: "conseils",
  s6_garde: "offres",
  s6_avance: "offres",
  s7_glace: "offres",
  s8_anniv: "conseils",
  s1_haut: "offres",
  s1_chapitres: "offres",
  s1_derniere: "offres",
  s2_heure: "offres",
  s2_peur: "offres",
  s2_question: "offres",
} as const satisfies Record<keyof typeof NOMS_DES_MAILS, "conseils" | "offres" | null>;
export type CleDeMail = keyof typeof MAILS;

/** Les clés des mails des séquences, dans l’ordre des séquences (/admin). */
export const CLES_DES_MAILS = Object.keys(NOMS_DES_MAILS) as CleDeMail[];

/** Est-ce la clé d’un mail des séquences (le `?m=` de leurs liens, compté par /ouvrir/<conv>) ? */
export const estUnMail = (m: string | null): m is CleDeMail => m !== null && Object.hasOwn(MAILS, m);

/** Les fenêtres de S3, depuis le déblocage de la conv : chaque mail part dedans, ou jamais (une veille arrêtée ne les envoie pas à contretemps). */
const FENETRES_S3 = { s3_repondre: [1 * JOUR, 3 * JOUR], s3_vocal: [2 * JOUR, 4 * JOUR], s3_pas: [4 * JOUR, 6 * JOUR], s3_parrainage: [5 * JOUR, 7 * JOUR] } as const;

/** Les fenêtres de S5, depuis son dernier mot au chat (ou le déblocage) : 7 et 21 jours, une semaine chacune ; un couple, chaque mois (30 jours) depuis le déblocage. */
const FENETRES_S5 = { s5_endormi: [7 * JOUR, 14 * JOUR], s5_parfait: [21 * JOUR, 28 * JOUR], mois: 30 * JOUR, semaine: 7 * JOUR } as const;

/** La recherche des anniversaires (S8) : au plus une fois dans ce temps, elle lit les fiches de toutes les convs débloquées. */
const ANNIVERSAIRES = { cle: "sequences:anniversaires", limite: { max: 1, fenetreS: 12 * 3600 } } as const;

/** Est-ce une heure calme à Paris (rien ne part) ? */
export function heureCalme(maintenant = new Date()): boolean {
  const heure = Number(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "numeric", hourCycle: "h23" }).formatToParts(maintenant).find((p) => p.type === "hour")?.value,
  );
  return heure >= HEURES_CALMES.de || heure < HEURES_CALMES.a;
}

/** Leurs prénoms et leurs pronoms, pour accorder les mails, ou null : « Qui es-tu ? » n’est pas rempli. */
export function personnesDe(meta: Meta): Personnes | null {
  if (!quiRempli(meta)) return null;
  const h = histoireDe(meta);
  const prenom = (p: string) => p.trim() || null;
  return { moi: { prenom: prenom(h.utilisateur.prenom), elle: h.utilisateur.pronom === "elle" }, autre: { prenom: prenom(h.autre.prenom), il: h.autre.pronom === "il" } };
}

/** A-t-elle pris Premium pour cette conv : Premium d’emblée, ou ③ (Premium pour 5 € de plus) payée après son rapport ? */
export async function aPrisPremium(storyId: string, userId: string): Promise<boolean> {
  const { rows } = await db().execute<{ premium: boolean }>(sql`
    select exists (
      select 1 from ${schema.achats} a where a.statut = 'paye' and (
        (a.story_id = ${storyId} and a.offre = 'premium')
        or (a.user_id = ${userId} and a.offre = 'premium_ajout'
          and a.paye_le >= (select ${schema.stories.debloqueLe} from ${schema.stories} where ${schema.stories.id} = ${storyId})))
    ) as premium`);
  return !!rows[0]?.premium;
}

/** Note un mail des séquences avant qu’il parte : faux s’il l’était déjà (un autre passage l’a pris). */
export async function noterLEnvoi(userId: string, cle: CleDeMail, occasion: string, storyId: string | null): Promise<boolean> {
  const e = schema.envoisMails;
  const [notee] = await db().insert(e).values({ userId, cle, occasion, storyId }).onConflictDoNothing().returning({ id: e.id });
  return !!notee;
}

/** Oublie un mail noté qui n’est pas parti : il repartira (tant que sa fenêtre est ouverte). `ecarte` : il ne repartira pas, sans compter pour le mail du jour. */
async function oublierLEnvoi(userId: string, cle: CleDeMail, occasion: string, { ecarte = false }: { ecarte?: boolean } = {}) {
  const e = schema.envoisMails;
  const ce = and(eq(e.userId, userId), eq(e.cle, cle), eq(e.occasion, occasion));
  if (ecarte) await db().update(e).set({ parti: false }).where(ce);
  else await db().delete(e).where(ce);
}

/**
 * Un mail des séquences à envoyer : le compte, la conv dont il parle, son occasion, et ce qu’il faut pour l’écrire. Sans
 * conv (S2, un compte qui n’en a pas encore), ni prénom ni pronom : `storyId` null, écrit sans eux.
 */
type Candidat = { userId: string; email: string; cle: Exclude<CleDeMail, "s3_rapport">; occasion: string } & (
  { storyId: string; ecrire: (p: Personnes) => Promise<MailDeSequence | null> } | { storyId: null; ecrire: () => Promise<MailDeSequence | null> }
);

/** Ce qu’un passage des séquences a fait : des nombres seulement (les logs de la veille sont publics). */
export type PassageDesSequences = { dues: number; envoyes: number; ecartes: number; retenus: number; echecs: number };

/* Les comptes à qui un mail des séquences, ou la relance ②, est parti il y a moins d’ECART_ENTRE_DEUX_MAILS_MS */
const MAIL_RECENT = sql`(
  exists (select 1 from ${schema.envoisMails} r where r.user_id = u.id and r.parti and r.envoye_le > now() - make_interval(secs => ${ECART_ENTRE_DEUX_MAILS_MS / 1000}))
  or exists (select 1 from ${schema.offresUniques} r where r.user_id = u.id and r.offre = 'relance_mail' and r.montree_le > now() - make_interval(secs => ${ECART_ENTRE_DEUX_MAILS_MS / 1000}))
)`;

/**
 * Le prochain pas, l’emoji et l’alerte du verdict de cette conv, ou null : pas de verdict, ou une alerte, quelle qu’elle
 * soit (rien ne part). Une alerte « danger » ou « détresse » se vend dans l’appli (21 et 22 octobre 2026), mais aucun
 * mail sur leur histoire ne part : sa boîte mail peut être lue par l’autre (« son téléphone exigé ou fouillé », le socle des prompts).
 */
async function verdictSansAlerte(storyId: string) {
  const v = await donneesVerdict(storyId);
  if (!v || v.sortie.alerte || v.sortie.mode_sobre) return null;
  return v.sortie;
}

/**
 * S3 : la dernière conv débloquée de chaque compte (il y a 1 à 6 jours), son rapport écrit, et le premier de ses mails
 * dû : « il t’a répondu ? » (rien dit au chat depuis le déblocage, jamais après un 🧊), le vocal (pas encore écouté),
 * puis le prochain pas (rien dit au chat ces dernières 24 h : elle est déjà en train d’en parler).
 */
async function candidatsS3(): Promise<Candidat[]> {
  const { stories: s, users: u0, chatMessages: m, vocals: v, vocalEcoutes: ve, envoisMails: e, reports: r } = schema;
  const { rows } = await db().execute<{
    user_id: string;
    email: string;
    bulles: number;
    story_id: string;
    age_ms: number;
    a_ecrit: boolean;
    ecrit_24h: boolean;
    vocal_ms: number | null;
    ecoute: boolean;
    offres_coupees: boolean;
    envoyes: string;
  }>(sql`
    select distinct on (u.id) u.id as user_id, u.email, u.bulles, s.id as story_id,
      (extract(epoch from now() - s.debloque_le) * 1000)::float8 as age_ms,
      exists (select 1 from ${m} m where m.story_id = s.id and m.role = 'toi' and m.created_at > s.debloque_le) as a_ecrit,
      exists (select 1 from ${m} m where m.story_id = s.id and m.role = 'toi' and m.created_at > now() - interval '24 hours') as ecrit_24h,
      (select v.duree_ms from ${v} v where v.story_id = s.id) as vocal_ms,
      exists (select 1 from ${ve} ve where ve.story_id = s.id and ve.evenement <> 'ferme') as ecoute,
      u.relances_coupees_le is not null as offres_coupees,
      coalesce((select string_agg(e.cle, ',') from ${e} e where e.user_id = u.id and e.occasion = s.id::text), '') as envoyes
    from ${s} s
    join ${u0} u on u.id = s.user_id
    where s.debloque_le <= now() - interval '1 day' and s.debloque_le > now() - interval '7 days'
      and u.conseils_coupes_le is null
      and exists (select 1 from ${r} r where r.story_id = s.id and r.data is not null)
      and not ${MAIL_RECENT}
    order by u.id, s.debloque_le desc`);
  return rows.flatMap((l): Candidat[] => {
    const envoyes = new Set(l.envoyes.split(","));
    const dans = (cle: keyof typeof FENETRES_S3) => !envoyes.has(cle) && l.age_ms >= FENETRES_S3[cle][0] && l.age_ms < FENETRES_S3[cle][1];
    const base = { userId: l.user_id, email: l.email, storyId: l.story_id, occasion: l.story_id };
    if (dans("s3_repondre") && !l.a_ecrit)
      return [
        {
          ...base,
          cle: "s3_repondre",
          ecrire: async (p) => {
            const verdict = await verdictSansAlerte(l.story_id);
            return verdict && verdict.emoji !== "🧊" ? mailRepondre(p, { bulles: Math.max(0, l.bulles) }) : null;
          },
        },
      ];
    if (dans("s3_vocal") && l.vocal_ms && !l.ecoute)
      return [{ ...base, cle: "s3_vocal", ecrire: async (p) => ((await verdictSansAlerte(l.story_id)) ? mailVocal(p, { secondes: Math.round(l.vocal_ms! / 1000) }) : null) }];
    if (dans("s3_pas") && !l.ecrit_24h)
      return [
        {
          ...base,
          cle: "s3_pas",
          ecrire: async (p) => {
            const verdict = await verdictSansAlerte(l.story_id);
            if (!verdict?.emoji) return null;
            return verdict.emoji === "🧊" ? mailGlace(p) : mailProchainPas(p, { emoji: verdict.emoji, pas: verdict.prochain_pas, bulles: Math.max(0, l.bulles) });
          },
        },
      ];
    /* Le parrainage, après un 🔥 seulement : une offre, que coupe sa désinscription des offres */
    if (dans("s3_parrainage") && !l.offres_coupees)
      return [
        {
          ...base,
          cle: "s3_parrainage",
          ecrire: async (p) => ((await verdictSansAlerte(l.story_id))?.emoji === "🔥" ? mailParrainage(p, { lien: await lienDeParrainage(l.user_id) }) : null),
        },
      ];
    return [];
  });
}

/**
 * Le bonus de la première recharge (④) vaut-il pour ce compte ? Aucun pack payé, et ④ montrée (la montrer ici, si le
 * serveur le permet : le mail la montre, la feuille de la recharge la retrouvera), comme le fait la feuille.
 */
async function bonusDeLaPremiereRecharge(compte: { id: string; email: string }): Promise<boolean> {
  if (await rechargeDejaPayee(compte.id)) return false;
  return !!(await montrer(compte, "premiere_recharge"));
}

/**
 * S4 : la réponse écrite à 0 bulle qui attend sa recharge (depuis 30 minutes à 2 jours : elle a pu recharger d’elle-même
 * avant) ; 2 bulles ou moins, elle qui écrivait au chat cette semaine (pas ces deux dernières heures : elle le voit déjà
 * dans l’appli) ; ou à zéro depuis 3 à 10 jours, sa dernière bulle dépensée en réponse. Une fois par réponse prête, et
 * une fois par bulles reçues (la dernière recharge, ou les bulles de son rapport) pour les deux autres.
 */
async function candidatsS4(): Promise<Candidat[]> {
  const { stories: s, users: u0, chatMessages: m, envoisMails: e, mouvementsBulles: mb } = schema;
  const deja = (cle: CleDeMail, occasion: SQL) => sql`exists (select 1 from ${e} e where e.user_id = u.id and e.cle = ${cle} and e.occasion = ${occasion})`;
  /* Sa dernière question au chat, sur toutes ses convs : la conv dont parle le mail */
  const dernier = sql`(select m.story_id, m.created_at from ${m} m join ${s} s on s.id = m.story_id where s.user_id = u.id and m.role = 'toi' order by m.created_at desc limit 1)`;
  const recue = sql`(select mb.id from ${mb} mb where mb.user_id = u.id and mb.delta > 0 order by mb.cree_le desc limit 1)`;

  const pretes = await db().execute<{ user_id: string; email: string; story_id: string; message_id: string }>(sql`
    select distinct on (u.id) u.id as user_id, u.email, m.story_id, m.id::text as message_id
    from ${m} m join ${s} s on s.id = m.story_id join ${u0} u on u.id = s.user_id
    where m.verrouillee and m.created_at <= now() - interval '30 minutes' and m.created_at > now() - interval '2 days'
      and u.relances_coupees_le is null and not ${MAIL_RECENT}
      and not ${deja("s4_prete", sql`m.id::text`)}
    order by u.id, m.id desc`);
  const peu = await db().execute<{ user_id: string; email: string; bulles: number; story_id: string; recue: string; actif: boolean }>(sql`
    select u.id as user_id, u.email, u.bulles, d.story_id, r.id::text as recue, d.created_at > now() - interval '2 days' as actif
    from ${u0} u
    cross join lateral ${dernier} d
    cross join lateral ${recue} r
    where u.bulles between 1 and 2 and u.relances_coupees_le is null and not ${MAIL_RECENT}
      and d.created_at > now() - interval '7 days' and d.created_at <= now() - interval '2 hours'
      and not ${deja("s4_peu", sql`r.id::text`)}`);
  const zero = await db().execute<{ user_id: string; email: string; story_id: string; recue: string; messages: number }>(sql`
    select u.id as user_id, u.email, d.story_id, r.id::text as recue, s.message_count as messages
    from ${u0} u
    cross join lateral ${dernier} d
    cross join lateral ${recue} r
    cross join lateral (select mb.cree_le, mb.raison from ${mb} mb where mb.user_id = u.id and mb.delta < 0 order by mb.cree_le desc limit 1) depense
    join ${s} s on s.id = d.story_id
    where u.bulles <= 0 and u.relances_coupees_le is null and not ${MAIL_RECENT}
      and depense.raison = 'reponse' and depense.cree_le <= now() - interval '3 days' and depense.cree_le > now() - interval '10 days'
      and not exists (select 1 from ${m} m join ${s} s2 on s2.id = m.story_id where s2.user_id = u.id and m.verrouillee)
      and not ${deja("s4_zero", sql`r.id::text`)}`);

  return [
    ...pretes.rows.map((l): Candidat => ({
      userId: l.user_id,
      email: l.email,
      storyId: l.story_id,
      cle: "s4_prete",
      occasion: l.message_id,
      ecrire: async (p) => ((await verdictSansAlerte(l.story_id)) ? mailReponsePrete(p, { bonus: await bonusDeLaPremiereRecharge({ id: l.user_id, email: l.email }) }) : null),
    })),
    ...peu.rows.map((l): Candidat => ({
      userId: l.user_id,
      email: l.email,
      storyId: l.story_id,
      cle: "s4_peu",
      occasion: l.recue,
      ecrire: async (p) =>
        (await verdictSansAlerte(l.story_id))
          ? mailPeuDeBulles(p, { bulles: l.bulles, actif: l.actif, bonus: await bonusDeLaPremiereRecharge({ id: l.user_id, email: l.email }) })
          : null,
    })),
    ...zero.rows.map((l): Candidat => ({
      userId: l.user_id,
      email: l.email,
      storyId: l.story_id,
      cle: "s4_zero",
      occasion: l.recue,
      ecrire: async (p) => {
        if (!(await verdictSansAlerte(l.story_id))) return null;
        const memoire = await donneesMemoire(l.story_id);
        const [{ echanges } = { echanges: 0 }] = await db()
          .select({ echanges: sql<number>`count(*)::int` })
          .from(m)
          .where(and(eq(m.storyId, l.story_id), eq(m.role, "blush")));
        return mailZeroBulle(p, { faits: memoire?.etat.fiche.faits.length ?? 0, messages: l.messages, echanges });
      },
    })),
  ];
}

/** Leur niveau d’aujourd’hui : celui que la mémoire tient à jour au fil du chat, sinon celui du verdict. */
async function niveauDe(storyId: string, verdict: { niveau: LevelId | null }): Promise<LevelId | null> {
  return (await donneesMemoire(storyId))?.etat.niveau?.niveau ?? verdict.niveau;
}

/** Une date à Paris, dite comme dans un mail : son jour (« vendredi »), son heure (« 18 h 12 »), sa date (« 17 octobre 2027 »). */
function aParis(d: Date) {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", ...o }).format(d);
  const [h, m] = f({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":");
  return { jour: f({ weekday: "long" }), heure: `${Number(h)}\u00a0h\u00a0${m}`, date: f({ day: "numeric", month: "long", year: "numeric" }) };
}

/* La dernière conv débloquée du compte, dans une requête où il s’appelle `u` : la conv dont parlent S6 et ses prénoms */
const DERNIERE_DEBLOQUEE = sql`(select s.id from ${schema.stories} s where s.user_id = u.id and s.debloque_le is not null order by s.debloque_le desc limit 1)`;

/**
 * S5 : la dernière conv débloquée de chaque compte à qui il reste des bulles, et le temps depuis son dernier mot au chat
 * (ou depuis le déblocage). Un couple (sa température) chaque mois ; sinon 7 jours (leur niveau, à franchir), puis 21.
 * L’occasion : son dernier mot (un nouveau silence, un nouveau mail), ou le mois pour un couple. Le niveau, chiffré dans
 * la mémoire, se lit en écrivant : un mail qui ne lui va pas est écarté, le suivant passe au passage d’après.
 */
async function candidatsS5(): Promise<Candidat[]> {
  const { stories: s, users: u0, chatMessages: m, envoisMails: e } = schema;
  const { rows } = await db().execute<{
    user_id: string;
    email: string;
    bulles: number;
    story_id: string;
    depuis_ms: number;
    silence_ms: number;
    dernier: string;
    envoyes: string;
  }>(sql`
    select distinct on (u.id) u.id as user_id, u.email, u.bulles, s.id as story_id,
      (extract(epoch from now() - s.debloque_le) * 1000)::float8 as depuis_ms,
      (extract(epoch from now() - coalesce(d.created_at, s.debloque_le)) * 1000)::float8 as silence_ms,
      coalesce(d.id::text, 'achat') as dernier,
      coalesce((select string_agg(e.cle || '|' || e.occasion, ',') from ${e} e where e.user_id = u.id and e.story_id = s.id), '') as envoyes
    from ${s} s
    join ${u0} u on u.id = s.user_id
    left join lateral (select m.id, m.created_at from ${m} m where m.story_id = s.id and m.role = 'toi' order by m.created_at desc limit 1) d on true
    where s.debloque_le <= now() - interval '7 days' and u.bulles > 0 and u.conseils_coupes_le is null and not ${MAIL_RECENT}
    order by u.id, s.debloque_le desc`);
  return rows.flatMap((l): Candidat[] => {
    const envoyes = new Set(l.envoyes.split(","));
    const base = { userId: l.user_id, email: l.email, storyId: l.story_id };
    const sansGlace = async () => {
      const verdict = await verdictSansAlerte(l.story_id);
      return verdict && verdict.emoji !== "🧊" ? verdict : null;
    };
    const candidats: Candidat[] = [];
    const mois = Math.floor(l.depuis_ms / FENETRES_S5.mois);
    const couple = `${l.story_id}:m${mois}`;
    if (mois >= 1 && l.depuis_ms - mois * FENETRES_S5.mois < FENETRES_S5.semaine && l.silence_ms >= FENETRES_S5.semaine && !envoyes.has(`s5_couple|${couple}`))
      candidats.push({
        ...base,
        cle: "s5_couple",
        occasion: couple,
        ecrire: async (p) => {
          const verdict = await sansGlace();
          const niveau = verdict && (await niveauDe(l.story_id, verdict));
          return niveau && scaleOf(niveau).temperature ? mailTemperature(p, { niveau, mois }) : null;
        },
      });
    const silence = `${l.story_id}:${l.dernier}`;
    const dans = (cle: "s5_endormi" | "s5_parfait") => !envoyes.has(`${cle}|${silence}`) && l.silence_ms >= FENETRES_S5[cle][0] && l.silence_ms < FENETRES_S5[cle][1];
    if (dans("s5_endormi"))
      candidats.push({
        ...base,
        cle: "s5_endormi",
        occasion: silence,
        ecrire: async (p) => {
          const verdict = await sansGlace();
          const niveau = verdict && (await niveauDe(l.story_id, verdict));
          return niveau && NIVEAUX_A_FRANCHIR.includes(niveau) ? mailEndormi(p, { niveau, bulles: l.bulles }) : null;
        },
      });
    if (dans("s5_parfait"))
      candidats.push({
        ...base,
        cle: "s5_parfait",
        occasion: silence,
        ecrire: async (p) => {
          const verdict = await sansGlace();
          const niveau = verdict && (await niveauDe(l.story_id, verdict));
          return verdict && !(niveau && scaleOf(niveau).temperature) ? mailParfait(p, { bulles: l.bulles }) : null;
        },
      });
    return candidats;
  });
}

/**
 * S6 : le −50 % gardé (⑥) qui finit dans 6 heures à 3 jours (montré il y a un jour au moins), une fois ; le rapport
 * d’avance (⑤) payé il y a une semaine à deux mois et pas encore utilisé, une fois par achat. Ils parlent de la dernière
 * conv débloquée du compte (ses prénoms) ; en alerte, rien.
 */
async function candidatsS6(): Promise<Candidat[]> {
  const { users: u0, offresUniques: o, achats: a, envoisMails: e } = schema;
  const garde = await db().execute<{ user_id: string; email: string; story_id: string | null; expire_le: string }>(sql`
    select u.id as user_id, u.email, ${DERNIERE_DEBLOQUEE} as story_id, o.expire_le
    from ${o} o join ${u0} u on u.id = o.user_id
    where o.offre = 'garde_second' and o.prise_le is null and o.montree_le <= now() - interval '1 day'
      and o.expire_le > now() + interval '6 hours' and o.expire_le <= now() + interval '3 days'
      and u.relances_coupees_le is null and not ${MAIL_RECENT}
      and not exists (select 1 from ${e} e where e.user_id = u.id and e.cle = 's6_garde')`);
  const avance = await db().execute<{ user_id: string; email: string; story_id: string | null; achat: string; paye_le: string }>(sql`
    select u.id as user_id, u.email, ${DERNIERE_DEBLOQUEE} as story_id, a.id::text as achat, a.paye_le
    from ${a} a join ${u0} u on u.id = a.user_id
    where a.offre = 'second' and a.statut = 'paye' and a.utilise_le is null
      and a.paye_le <= now() - interval '7 days' and a.paye_le > now() - interval '60 days'
      and u.relances_coupees_le is null and not ${MAIL_RECENT}
      and not exists (select 1 from ${e} e where e.user_id = u.id and e.cle = 's6_avance' and e.occasion = a.id::text)`);
  return [
    ...garde.rows.flatMap((l): Candidat[] =>
      l.story_id
        ? [
            {
              userId: l.user_id,
              email: l.email,
              storyId: l.story_id,
              cle: "s6_garde",
              occasion: "garde",
              ecrire: async (p) => ((await verdictSansAlerte(l.story_id!)) ? mailGarde(p, aParis(new Date(l.expire_le))) : null),
            },
          ]
        : [],
    ),
    ...avance.rows.flatMap((l): Candidat[] => {
      if (!l.story_id) return [];
      const fin = new Date(new Date(l.paye_le).getTime() + RAPPORT_D_AVANCE.dureeMs);
      const mois = Math.max(1, Math.round((fin.getTime() - Date.now()) / (30.44 * JOUR)));
      return [
        {
          userId: l.user_id,
          email: l.email,
          storyId: l.story_id,
          cle: "s6_avance",
          occasion: l.achat,
          ecrire: async () => ((await verdictSansAlerte(l.story_id!)) ? mailAvance({ jusqua: aParis(fin).date, mois }) : null),
        },
      ];
    }),
  ];
}

/** S7 : la dernière conv débloquée, il y a trois à quatre semaines, sans nouvelle conv importée depuis ; seulement après un 🧊. */
async function candidatsS7(): Promise<Candidat[]> {
  const { stories: s, users: u0, envoisMails: e } = schema;
  const { rows } = await db().execute<{ user_id: string; email: string; story_id: string }>(sql`
    select distinct on (u.id) u.id as user_id, u.email, s.id as story_id
    from ${s} s join ${u0} u on u.id = s.user_id
    where s.debloque_le <= now() - interval '21 days' and s.debloque_le > now() - interval '28 days'
      and u.relances_coupees_le is null and not ${MAIL_RECENT}
      and not exists (select 1 from ${s} s2 where s2.user_id = u.id and s2.id <> s.id and s2.created_at > s.debloque_le)
      and not exists (select 1 from ${e} e where e.user_id = u.id and e.cle = 's7_glace' and e.occasion = s.id::text)
    order by u.id, s.debloque_le desc`);
  return rows.map((l): Candidat => ({
    userId: l.user_id,
    email: l.email,
    storyId: l.story_id,
    cle: "s7_glace",
    occasion: l.story_id,
    ecrire: async () => ((await verdictSansAlerte(l.story_id))?.emoji === "🧊" ? mailApresGlace() : null),
  }));
}

/**
 * S8 : les convs débloquées dont la fiche dit la date entière d’un anniversaire qui tombe dans deux ou trois jours (deux
 * passages pour qu’il parte, un jour de silence pour l’autre mail du jour). Une fois par an et par conv. Il faut lire
 * les fiches, chiffrées : deux fois par jour au plus (ANNIVERSAIRES).
 */
async function candidatsS8(): Promise<Candidat[]> {
  if (!(await sousLaLimite(ANNIVERSAIRES.cle, ANNIVERSAIRES.limite))) return [];
  const { stories: s, users: u0, memories: mem, envoisMails: e } = schema;
  const { rows } = await db().execute<{ user_id: string; email: string; bulles: number; story_id: string; envoyes: string }>(sql`
    select u.id as user_id, u.email, u.bulles, s.id as story_id,
      coalesce((select string_agg(e.occasion, ',') from ${e} e where e.user_id = u.id and e.cle = 's8_anniv'), '') as envoyes
    from ${s} s join ${u0} u on u.id = s.user_id
    where s.debloque_le is not null and u.conseils_coupes_le is null and not ${MAIL_RECENT}
      and exists (select 1 from ${mem} mem where mem.story_id = s.id)`);
  const candidats: Candidat[] = [];
  for (const l of rows) {
    const faits = (await donneesMemoire(l.story_id))?.etat.fiche.faits ?? [];
    const date = faits.map((f) => dateDAnniversaire(f.texte)).find((d) => d !== null);
    if (!date) continue;
    const prochain = prochainAnniversaire(date);
    const occasion = `${l.story_id}:${prochain.annee}`;
    if (prochain.dans < 2 || prochain.dans > 3 || l.envoyes.split(",").includes(occasion)) continue;
    /* Ce qu’il ou elle aime, une ligne de sa fiche, courte */
    const aime = faits.find((f) => f.section === "aime")?.texte ?? null;
    candidats.push({
      userId: l.user_id,
      email: l.email,
      storyId: l.story_id,
      cle: "s8_anniv",
      occasion,
      ecrire: async (p) =>
        (await verdictSansAlerte(l.story_id))
          ? mailAnniversaire(p, {
              jour: prochain.jour,
              date: prochain.date,
              aime: aime && aime.length > 60 ? `${aime.slice(0, 59).trimEnd()}…` : aime,
              bulles: Math.max(0, l.bulles),
            })
          : null,
    });
  }
  return candidats;
}

/** Les fenêtres de S1, depuis son arrivée au paywall, et de S2, depuis la création du compte. */
const FENETRES_S1 = { s1_haut: [2 * HEURE, 2 * JOUR], s1_chapitres: [1 * JOUR, 3 * JOUR], s1_derniere: [6 * JOUR, 8 * JOUR] } as const;

/**
 * L’A/B de S1 J+6 (décidé le 17 octobre) : la moitié des comptes, tirée une fois pour toutes de leur identifiant, reçoit
 * la « dernière fois » (la ① rouverte deux jours) ; l’autre moitié, le groupe témoin, rien. /admin compare leurs achats.
 */
export const groupeDuJ6 = (userId: string): "avec" | "sans" =>
  Number.parseInt(createHash("sha256").update(`ab:s1_derniere:${userId}`).digest("hex").slice(0, 8), 16) % 2 === 0 ? "avec" : "sans";
const FENETRES_S2 = { s2_heure: [1 * HEURE, 1 * JOUR], s2_peur: [1 * JOUR, 3 * JOUR], s2_question: [4 * JOUR, 6 * JOUR] } as const;

/**
 * S1 (les prospects, BLUSH_MAILS_PROSPECTS) : la dernière conv du compte arrivée au paywall (sa lecture attend son
 * paiement) il y a 2 heures à 3 jours, ni débloquée ni payée. H+2 : le titre de son paywall et ses chiffres, comptés par
 * le code (rien n’est lu avant le paiement) ; J+1 : ses 8 chapitres. Ils remplacent la relance ②.
 */
async function candidatsS1(): Promise<Candidat[]> {
  const { stories: s, users: u0, tasks: t, achats: a, envoisMails: e } = schema;
  const { rows } = await db().execute<{ user_id: string; email: string; story_id: string; age_ms: number; envoyes: string }>(sql`
    select distinct on (u.id) u.id as user_id, u.email, s.id as story_id,
      (extract(epoch from now() - t.updated_at) * 1000)::float8 as age_ms,
      coalesce((select string_agg(e.cle, ',') from ${e} e where e.user_id = u.id and e.occasion in (s.id::text, s.id::text || ':temoin')), '') as envoyes
    from ${s} s
    join ${u0} u on u.id = s.user_id
    join ${t} t on t.story_id = s.id and t.kind = 'verdict' and t.status = 'paiement'
    where s.debloque_le is null and t.updated_at <= now() - interval '2 hours' and t.updated_at > now() - interval '8 days'
      and u.relances_coupees_le is null and not ${MAIL_RECENT}
      and not exists (select 1 from ${a} a where a.story_id = s.id and a.statut = 'paye')
    order by u.id, t.updated_at desc`);
  return rows.flatMap((l): Candidat[] => {
    const envoyes = new Set(l.envoyes.split(","));
    const dans = (cle: keyof typeof FENETRES_S1) => !envoyes.has(cle) && l.age_ms >= FENETRES_S1[cle][0] && l.age_ms < FENETRES_S1[cle][1];
    const base = { userId: l.user_id, email: l.email, storyId: l.story_id, occasion: l.story_id };
    const candidats: Candidat[] = [];
    if (dans("s1_haut"))
      candidats.push({
        ...base,
        cle: "s1_haut",
        ecrire: async (p) => {
          /* Le titre de son paywall, recompté par le code sur sa conv (src/server/analyse.ts), comme l’écran */
          const apercu = await (await import("./analyse")).apercuAvantPaiement(l.story_id);
          return apercu ? mailHautDuPaywall(p, hautDuPaywall(apercu, { nom: p.autre.prenom ?? (p.autre.il ? "lui" : "elle"), il: p.autre.il })) : null;
        },
      });
    if (dans("s1_chapitres")) candidats.push({ ...base, cle: "s1_chapitres", ecrire: async (p) => mailChapitres(p) });
    /* J+6 : le groupe « avec » reçoit la ① rouverte ; le groupe témoin est noté (écarté), pour que /admin compare */
    if (dans("s1_derniere")) {
      const avec = groupeDuJ6(l.user_id) === "avec";
      candidats.push({
        ...base,
        cle: "s1_derniere",
        occasion: avec ? l.story_id : `${l.story_id}:temoin`,
        ecrire: async (p) => {
          const compte = { id: l.user_id, email: l.email };
          if (!avec || !(await suiteVendable(compte, l.story_id))) return null;
          const fin = await rouvrirLaSuite(compte, l.story_id);
          return fin ? mailDerniereChance(p, { jour: aParis(fin).jour }) : null;
        },
      });
    }
    return candidats;
  });
}

/** L’heure de la création du compte, à Paris, quand c’était la nuit (« 1 h 12 du mat’ », « 23 h 40 ») ; sinon rien. */
function heureDeLaNuit(d: Date): string | null {
  const [h, m] = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).split(":").map(Number) as [
    number,
    number,
  ];
  const dite = `${h}\u00a0h\u00a0${String(m).padStart(2, "0")}`;
  if (h < 6) return `${dite} du mat’`;
  return h >= 22 ? dite : null;
}

/**
 * S2 (les prospects, BLUSH_MAILS_PROSPECTS) : un compte créé il y a 1 heure à 6 jours, sans aucune conv. H+1 : l’heure
 * de son compte (la nuit) et l’export ; J+1 : la peur de la réponse ; J+4 : « vous en êtes où ? ». Sans conv, ni prénom
 * ni pronom.
 */
async function candidatsS2(): Promise<Candidat[]> {
  const { stories: s, users: u0, envoisMails: e } = schema;
  const { rows } = await db().execute<{ user_id: string; email: string; cree_le: string; age_ms: number; envoyes: string }>(sql`
    select u.id as user_id, u.email, u.created_at as cree_le,
      (extract(epoch from now() - u.created_at) * 1000)::float8 as age_ms,
      coalesce((select string_agg(e.cle, ',') from ${e} e where e.user_id = u.id), '') as envoyes
    from ${u0} u
    where u.created_at <= now() - interval '1 hour' and u.created_at > now() - interval '6 days'
      and u.relances_coupees_le is null and not ${MAIL_RECENT}
      and not exists (select 1 from ${s} s where s.user_id = u.id)`);
  return rows.flatMap((l): Candidat[] => {
    const envoyes = new Set(l.envoyes.split(","));
    const dans = (cle: keyof typeof FENETRES_S2) => !envoyes.has(cle) && l.age_ms >= FENETRES_S2[cle][0] && l.age_ms < FENETRES_S2[cle][1];
    const base = { userId: l.user_id, email: l.email, storyId: null, occasion: l.user_id };
    if (dans("s2_heure")) return [{ ...base, cle: "s2_heure", ecrire: async () => mailSansConv({ heure: heureDeLaNuit(new Date(l.cree_le)) }) }];
    if (dans("s2_peur")) return [{ ...base, cle: "s2_peur", ecrire: async () => mailSansConvPeur() }];
    if (dans("s2_question")) return [{ ...base, cle: "s2_question", ecrire: async () => mailSansConvQuestion() }];
    return [];
  });
}

/** Les mails qui mènent à une nouvelle conv (S2, S6, S7) : la page où l’on commence. */
const VERS_UNE_NOUVELLE_CONV: readonly CleDeMail[] = ["s6_garde", "s6_avance", "s7_glace", "s2_heure", "s2_peur", "s2_question"];

/**
 * Les liens d’un mail : chaque bouton passe par /ouvrir/<conv> (qui compte le clic, `?m=<clé>`), puis ouvre la conv dont
 * il parle (le chat, son texte déjà tapé ; le rapport pour le vocal ; la recharge pour S4), ou la page d’une nouvelle conv
 * (S6, S7).
 */
function liensDe(c: Candidat, m: MailDeSequence) {
  const ouvrir = `${env().BLUSH_URL}/ouvrir/${c.storyId ?? "nouvelle"}?m=${c.cle}`;
  const boutons = m.boutons.map((b) => {
    if (c.cle === "s3_vocal") return ouvrir;
    if (VERS_UNE_NOUVELLE_CONV.includes(c.cle)) return `${ouvrir}&nouvelle=1`;
    if (c.cle === "s3_parrainage") return `${ouvrir}&parrainage=1`;
    if (c.cle === "s1_derniere") return `${ouvrir}&paywall=1&offre=1`;
    if (c.cle === "s1_haut" || c.cle === "s1_chapitres") return `${ouvrir}&paywall=1`;
    if (MAILS[c.cle] === "offres") return `${ouvrir}&recharger=1`;
    return `${ouvrir}&dire=${encodeURIComponent(b.dire ?? "")}`;
  });
  return { boutons, desinscription: { lien: lienDesinscription(c.userId, MAILS[c.cle]), quoi: MAILS[c.cle] } };
}

/**
 * Envoie les mails des séquences dus (voir l’en-tête), un par compte au plus, et dit ce qu’il a fait en nombres
 * seulement. Un compte a un seul mail par passage : la réponse prête d’abord, puis S3, son anniversaire (S8), les
 * bulles, les offres gardées (S6), le chat endormi (S5), et après un 🧊 (S7). Le garde-fou du jour atteint, ou le quota
 * des mails, arrête le passage : le mail non parti est oublié, il repartira au passage suivant
 * (tant que sa fenêtre est ouverte). De même quand le prestataire le refuse sans regarder l’adresse (refusDuPrestataire).
 * Une adresse refusée, ou un mail perdu en route (il a pu partir), compte comme fait. `maintenant` : pour les heures
 * calmes (les tests).
 */
export async function envoyerLesSequences({ maintenant = new Date() }: { maintenant?: Date } = {}): Promise<PassageDesSequences> {
  const passage: PassageDesSequences = { dues: 0, envoyes: 0, ecartes: 0, retenus: 0, echecs: 0 };
  if (heureCalme(maintenant)) return passage;
  const boite = boiteAMails();
  /* Un par compte, dans l’ordre des priorités */
  const parCompte = new Map<string, Candidat>();
  const prospects = env().BLUSH_MAILS_PROSPECTS;
  const [s1, s2, s3, s4, s5, s6, s7, s8] = await Promise.all([
    prospects ? candidatsS1() : [],
    prospects ? candidatsS2() : [],
    candidatsS3(),
    candidatsS4(),
    candidatsS5(),
    candidatsS6(),
    candidatsS7(),
    candidatsS8(),
  ]);
  const prete = s4.filter((c) => c.cle === "s4_prete");
  for (const c of [...prete, ...s3, ...s8, ...s4.filter((c) => c.cle !== "s4_prete"), ...s1, ...s6, ...s5, ...s7, ...s2]) if (!parCompte.has(c.userId)) parCompte.set(c.userId, c);
  const dus = [...parCompte.values()];
  passage.dues = dus.length;
  for (const [k, c] of dus.entries()) {
    if (passage.envoyes >= MAILS_PAR_PASSAGE) {
      passage.retenus = dus.length - k;
      break;
    }
    /* Leurs prénoms et leurs pronoms, pour un mail sur une conv ; sans conv (S2), écrit sans eux */
    let ecrire: () => Promise<MailDeSequence | null>;
    if (c.storyId !== null) {
      const [story] = await db().select({ meta: schema.stories.meta }).from(schema.stories).where(eq(schema.stories.id, c.storyId));
      const personnes = story ? personnesDe(metaDe(story)) : null;
      if (!personnes) {
        passage.ecartes++;
        continue;
      }
      ecrire = () => c.ecrire(personnes);
    } else ecrire = () => c.ecrire();
    if (estEquipe(c) || !(await entre(c.email))) {
      passage.ecartes++;
      continue;
    }
    /* Noté d’abord : un autre passage en même temps ne l’envoie pas une seconde fois */
    if (!(await noterLEnvoi(c.userId, c.cle, c.occasion, c.storyId))) continue;
    const mail = await ecrire().catch((e: unknown) => {
      journalErreur("séquence : mail non écrit", e);
      return null;
    });
    if (!mail) {
      /* Une alerte, un 🧊 sans « il t’a répondu ? » : écarté, il ne repassera pas */
      await oublierLEnvoi(c.userId, c.cle, c.occasion, { ecarte: true });
      passage.ecartes++;
      continue;
    }
    /* Le garde-fou du jour : au-delà, un envoi anormal (un bug qui écrirait à toute la base), l’équipe prévenue une fois */
    if (!boite && !(await sousLaLimite(SEQUENCES_DU_JOUR, LIMITES.sequencesParJour))) {
      await rendre(SEQUENCES_DU_JOUR);
      await oublierLEnvoi(c.userId, c.cle, c.occasion);
      passage.retenus = dus.length - k;
      await auMieux(
        () =>
          alerter("garde-fou des séquences atteint", [
            `${LIMITES.sequencesParJour.max} mails des séquences sont partis en 24 h : les suivants attendent.`,
            "Un volume normal ? Relève LIMITES.sequencesParJour (src/server/limites.ts).",
          ]),
        "alerte du garde-fou non envoyée",
      );
      break;
    }
    let parti: boolean;
    try {
      parti = await envoyerMail(
        c.email,
        { ...mailDeSequence(mail, { base: env().BLUSH_URL, liens: liensDe(c, mail) }), entetes: entetesDeDesinscription(c.userId, MAILS[c.cle]) },
        /* Du sous-domaine des relances (expediteurDe), suivi par sa clé (le bloc « Délivrabilité » d’/admin) */
        { sorte: "relance", suivi: `sequence-${c.cle}` },
      );
    } catch (e) {
      journalErreur("séquence : mail refusé", e);
      if (refusDuPrestataire(e)) parti = false;
      else {
        passage.echecs++;
        continue;
      }
    }
    if (!parti) {
      await oublierLEnvoi(c.userId, c.cle, c.occasion);
      if (!boite) await rendre(SEQUENCES_DU_JOUR);
      passage.retenus = dus.length - k;
      break;
    }
    passage.envoyes++;
  }
  journal("sequences", passage);
  return passage;
}
