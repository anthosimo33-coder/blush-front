import "server-only";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { mailGlace, mailPeuDeBulles, mailProchainPas, mailRepondre, mailReponsePrete, mailVocal, mailZeroBulle, type MailDeSequence, type Personnes } from "@/contenu/mails";
import { db, schema } from "./db";
import { donneesMemoire, donneesVerdict } from "./depot";
import { estEquipe } from "./droits";
import { envoyerMail, refusDuPrestataire } from "./email";
import { boiteAMails, env } from "./env";
import { histoireDe, metaDe, quiRempli, type Meta } from "./histoires";
import { entre } from "./invitations";
import { journal, journalErreur } from "./journal";
import { plafondsDesMails, rendre, sousLaLimite } from "./limites";
import { mailDeSequence } from "./mail-sequence";
import { montrer } from "./offres-uniques";
import { lienDesinscription, RELANCES_DU_JOUR } from "./relances";
import { rechargeDejaPayee } from "./achats";

/*
 * Les séquences de mails (la V3 du canvas « BLUSH · Séquences mail », le 17 octobre ; leurs textes dans
 * src/contenu/mails.ts, leur gabarit dans src/server/mail-sequence.ts). Le lot 1 :
 * - S3, après l’achat, sur la dernière conv débloquée du compte : J0 « ton rapport est prêt » (src/server/analyse.ts,
 *   noté ici), J+1 « il t’a répondu ? » (rien dit au chat depuis), J+2 le vocal (pas encore écouté), J+4 son prochain pas
 *   (🔥 🤏 🤔), ou après un 🧊, « comment tu vas, vraiment ? » (rien à vendre, le 3114). Des conseils.
 * - S4, les bulles : la réponse écrite à 0 bulle qui attend sa recharge, 2 bulles ou moins, puis à zéro depuis 3 jours.
 *   Des offres.
 * Les règles, pour tous :
 * - jamais la nuit (HEURES_CALMES, à Paris), et un mail des séquences par jour au plus (aucun s’il en est parti un, ou la
 *   relance ②, dans les ECART_ENTRE_DEUX_MAILS_MS) ;
 * - chaque mail une fois par occasion (envois_mails : la conv pour S3, la recharge ou la réponse prête pour S4), noté
 *   avant de partir (deux passages en même temps n’en envoient qu’un) et effacé s’il ne part pas ;
 * - jamais à l’équipe, ni à qui la bêta fermée ne laisse pas entrer, ni sur une conv en alerte (le mode sobre), ni sans
 *   « Qui es-tu ? » rempli (ni prénom ni pronom à accorder) ;
 * - les conseils s’arrêtent à users.conseils_coupes_le, les offres à users.relances_coupees_le (le lien de leur pied) ;
 * - dans le plafond des relances du jour, qu’ils partagent avec la relance (passée avant eux, au même passage), puis dans
 *   le quota des mails (sorte « relance »).
 * Envoyés par GET /api/cron/relances (Vercel Cron, toutes les 5 minutes), juste après les relances.
 * TODO(produit): à relire par un juriste : des mails commerciaux (S4) à des clients, pour des services analogues
 * (article L34-5 du Code des postes et des communications électroniques), et leur lien de désinscription.
 */

/** Les heures de Paris où rien ne part : de 23 h à 8 h. */
const HEURES_CALMES = { de: 23, a: 8 } as const;

/** Entre deux mails des séquences au même compte, au moins ce temps : un par jour, à quelques heures près. */
export const ECART_ENTRE_DEUX_MAILS_MS = 20 * 3600e3;

/** Au plus, les mails des séquences partis d’un passage (le plafond du jour les arrête souvent avant). */
const MAILS_PAR_PASSAGE = 50;

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
  s4_prete: "offres",
  s4_peu: "offres",
  s4_zero: "offres",
} as const satisfies Record<string, "conseils" | "offres" | null>;
export type CleDeMail = keyof typeof MAILS;

/** Les fenêtres de S3, depuis le déblocage de la conv : chaque mail part dedans, ou jamais (une veille arrêtée ne les envoie pas à contretemps). */
const FENETRES_S3 = { s3_repondre: [1 * JOUR, 3 * JOUR], s3_vocal: [2 * JOUR, 4 * JOUR], s3_pas: [4 * JOUR, 6 * JOUR] } as const;

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

/** Un mail des séquences à envoyer : le compte, la conv dont il parle, son occasion, et ce qu’il faut pour l’écrire. */
type Candidat = {
  userId: string;
  email: string;
  storyId: string;
  cle: Exclude<CleDeMail, "s3_rapport">;
  occasion: string;
  ecrire: (p: Personnes) => Promise<MailDeSequence | null>;
};

/** Ce qu’un passage des séquences a fait : des nombres seulement (les logs de la veille sont publics). */
export type PassageDesSequences = { dues: number; envoyes: number; ecartes: number; retenus: number; echecs: number };

/* Les comptes à qui un mail des séquences, ou la relance ②, est parti il y a moins d’ECART_ENTRE_DEUX_MAILS_MS */
const MAIL_RECENT = sql`(
  exists (select 1 from ${schema.envoisMails} r where r.user_id = u.id and r.parti and r.envoye_le > now() - make_interval(secs => ${ECART_ENTRE_DEUX_MAILS_MS / 1000}))
  or exists (select 1 from ${schema.offresUniques} r where r.user_id = u.id and r.offre = 'relance_mail' and r.montree_le > now() - make_interval(secs => ${ECART_ENTRE_DEUX_MAILS_MS / 1000}))
)`;

/** Le prochain pas, l’emoji et l’alerte du verdict de cette conv, ou null : pas de verdict, ou une alerte (le mode sobre : rien ne part). */
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
    envoyes: string;
  }>(sql`
    select distinct on (u.id) u.id as user_id, u.email, u.bulles, s.id as story_id,
      (extract(epoch from now() - s.debloque_le) * 1000)::float8 as age_ms,
      exists (select 1 from ${m} m where m.story_id = s.id and m.role = 'toi' and m.created_at > s.debloque_le) as a_ecrit,
      exists (select 1 from ${m} m where m.story_id = s.id and m.role = 'toi' and m.created_at > now() - interval '24 hours') as ecrit_24h,
      (select v.duree_ms from ${v} v where v.story_id = s.id) as vocal_ms,
      exists (select 1 from ${ve} ve where ve.story_id = s.id and ve.evenement <> 'ferme') as ecoute,
      coalesce((select string_agg(e.cle, ',') from ${e} e where e.user_id = u.id and e.occasion = s.id::text), '') as envoyes
    from ${s} s
    join ${u0} u on u.id = s.user_id
    where s.debloque_le <= now() - interval '1 day' and s.debloque_le > now() - interval '6 days'
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

/** Les liens d’un mail : chaque bouton ouvre la conv dont il parle (le chat, son texte déjà tapé ; le rapport pour le vocal ; la recharge pour S4). */
function liensDe(c: Candidat, m: MailDeSequence) {
  const ouvrir = `${env().BLUSH_URL}/ouvrir/${c.storyId}`;
  const boutons = m.boutons.map((b) => {
    if (c.cle === "s3_vocal") return ouvrir;
    if (MAILS[c.cle] === "offres") return `${ouvrir}?recharger=1`;
    return `${ouvrir}?dire=${encodeURIComponent(b.dire ?? "")}`;
  });
  return { boutons, desinscription: { lien: lienDesinscription(c.userId, MAILS[c.cle]), quoi: MAILS[c.cle] } };
}

/**
 * Envoie les mails des séquences dus (voir l’en-tête), un par compte au plus, et dit ce qu’il a fait en nombres
 * seulement. Un compte a un seul mail par passage : la réponse prête d’abord, puis S3, puis les bulles. Le plafond du
 * jour atteint, ou le quota des mails, arrête le passage : le mail non parti est oublié, il repartira au passage suivant
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
  const [s3, s4] = await Promise.all([candidatsS3(), candidatsS4()]);
  for (const c of [...s4.filter((c) => c.cle === "s4_prete"), ...s3, ...s4.filter((c) => c.cle !== "s4_prete")]) if (!parCompte.has(c.userId)) parCompte.set(c.userId, c);
  const dus = [...parCompte.values()];
  passage.dues = dus.length;
  for (const [k, c] of dus.entries()) {
    if (passage.envoyes >= MAILS_PAR_PASSAGE) {
      passage.retenus = dus.length - k;
      break;
    }
    const [story] = await db().select({ meta: schema.stories.meta }).from(schema.stories).where(eq(schema.stories.id, c.storyId));
    const personnes = story ? personnesDe(metaDe(story)) : null;
    if (estEquipe(c) || !personnes || !(await entre(c.email))) {
      passage.ecartes++;
      continue;
    }
    /* Noté d’abord : un autre passage en même temps ne l’envoie pas une seconde fois */
    if (!(await noterLEnvoi(c.userId, c.cle, c.occasion, c.storyId))) continue;
    const mail = await c.ecrire(personnes).catch((e: unknown) => {
      journalErreur("séquence : mail non écrit", e);
      return null;
    });
    if (!mail) {
      /* Une alerte, un 🧊 sans « il t’a répondu ? » : écarté, il ne repassera pas */
      await oublierLEnvoi(c.userId, c.cle, c.occasion, { ecarte: true });
      passage.ecartes++;
      continue;
    }
    if (!boite && !(await sousLaLimite(RELANCES_DU_JOUR, plafondsDesMails().relances))) {
      await rendre(RELANCES_DU_JOUR);
      await oublierLEnvoi(c.userId, c.cle, c.occasion);
      passage.retenus = dus.length - k;
      break;
    }
    let parti: boolean;
    try {
      parti = await envoyerMail(c.email, mailDeSequence(mail, { base: env().BLUSH_URL, liens: liensDe(c, mail) }), { sorte: "relance" });
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
      if (!boite) await rendre(RELANCES_DU_JOUR);
      passage.retenus = dus.length - k;
      break;
    }
    passage.envoyes++;
  }
  journal("sequences", passage);
  return passage;
}
