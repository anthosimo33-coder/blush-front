import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { Pronom } from "@prompts/lib/conv";
import { GENRES_DU_HAUT, type GenreDuHaut } from "@/contenu/haut-du-paywall";
import { CATALOGUE, RAPPORT_D_AVANCE } from "@/contenu/offres";
import { GROUPE_DE_L_OFFRE, GROUPES_D_OFFRES, PAIRES, type GroupeDOffres, type Paire } from "@/contenu/pilotage";
import {
  CLES_DES_APPLIS,
  GENRES_VENDUS,
  JALONS,
  JALONS_PAR_APPLI,
  OFFRES,
  OFFRES_UNIQUES,
  RAISONS_DE_LA_NOTE,
  type AppKind,
  type GenreVendu,
  type Jalon,
  type JalonParAppli,
  type OffreId,
  type OffreUnique,
  type RaisonDeLaNote,
  type SourceVisite,
} from "@/types";
import { pronomDeLAutreLu } from "./accords";
import { etatDeLaListe } from "./attente";
import { BUDGET_IA } from "./budget";
import { COMPTE_DU_TOURNAGE } from "./compte-du-tournage";
import { CLES, CLES_DE_LA_NOTE, HAUT, MAIL, NOTE, PANNE } from "./compteurs";
import { CLES_DES_MAILS, type CleDeMail } from "./sequences";
import { db, uneLigne } from "./db";
import { env } from "./env";
import { actionsRecentes, type ActionRecente } from "./equipe";
import { metaDe, personnesDe, type Meta } from "./histoires";
import { LOT_BLOQUE_S } from "./memoire-en-lot";
import { PERIME_S } from "./taches";
import { dansLaMoitieAvec, VENTE, type GroupeDeVente } from "./vente";

/*
 * Le tableau de bord (/admin) : que des nombres. Aucune conv, aucun message, aucun email n’en sort.
 * Les convs effacées (par l’utilisateur, ou par la purge) sortent des comptes.
 */

export type Periode = 1 | 7 | 30;
/** Un chiffre sur la période, et sur la période d’avant (pour la tendance). */
export type Chiffre = { valeur: number; avant: number };

/** Des achats : combien, et leur montant TTC en centimes d’euro. */
export type Montant = { n: number; centimes: number };
/**
 * Les ventes d’une fenêtre (aujourd’hui, ou les 7 derniers jours, en jours de Paris) : les achats payés dans la fenêtre
 * (même remboursés depuis), ceux remboursés et ceux contestés dans la fenêtre, et les payés par offre.
 */
export type Ventes = { payes: Montant; rembourses: Montant; contestes: Montant; parOffre: ({ offre: OffreId } & Montant)[] };
/** Les bulles d’une fenêtre : vendues (livrées avec un achat), dépensées (les réponses de BLUSH), offertes (la bêta, l’équipe), rendues. */
export type Bulles = { vendues: number; depensees: number; offertes: number; rendues: number };

export type StatsAdmin = {
  jours: Periode;
  /** L’heure du calcul (ISO). */
  le: string;
  cles: { comptes: Chiffre; convs: Chiffre; verdicts: Chiffre; rapports: Chiffre; messages: Chiffre; actifs: Chiffre };
  /** Les convs importées sur la période, et jusqu’où elles sont allées. */
  parcours: { importees: number; compte: number; verdict: number; rapport: number; chat: number };
  /** Jour par jour (14 jours, ou 30). */
  activite: { jour: string; imports: number; verdicts: number; rapports: number }[];
  partage: { ouvertures: number; liens: number; apercus: number; visites: number; essais: number; imports: number; actifs: number };
  couts: { total: number; avant: number; parRapport: number | null; parVerdict: number | null; postes: { nom: string; dollars: number; appels: number }[] };
  /**
   * `pannes` : les lieux des pannes du serveur sur la période (une route /api par sa clé, une page par son fichier), par
   * jours de Paris entiers (la période de 24 h : aujourd’hui), les plus nombreuses d’abord (src/server/pannes.ts).
   */
  sante: { echecs: { code: string; n: number }[]; pannes: { lieu: string; n: number }[]; enCours: number; bloquees: number; enAttente: number };
  beta: {
    fermee: boolean;
    invites: number | "tous";
    attente: number;
    attenteNouveaux: number;
    comptes: number;
    /** Les inscrits de la liste déjà invités depuis /admin, et les mails de la liste qui peuvent encore partir aujourd’hui. */
    attenteInvites: number;
    mailsPossibles: number;
  };
  /** Aujourd’hui et les 7 derniers jours (jours de Paris), quelle que soit la période choisie. */
  ventes: { jour: Ventes; semaine: Ventes };
  bulles: { jour: Bulles; semaine: Bulles };
  /**
   * Les commandes d’un rapport (le rapport, Premium, la suite : les offres d’une conv) créées sur la période
   * (achats.cree_le), et ce qu’elles sont devenues. Les bulles seules (les recharges, ③) n’entrent pas dans l’entonnoir
   * des verdicts lus.
   */
  achats: { commandes: number; comptes: number; payees: number; echouees: number; enAttente: number };
  /** Les offres uniques montrées sur la période, et combien de celles-là ont été prises. */
  offresUniques: { offre: OffreUnique; montrees: number; prises: number }[];
  /** Les derniers gestes de l’équipe (/admin, le terminal). */
  actions: ActionRecente[];
  /** Le pilotage : l’argent, les visiteurs et le tunnel, sur la période (l’écran d’/admin). */
  pilotage: Pilotage;
};

/**
 * Une case des graphiques du pilotage : une heure (sur 24 h) ou un jour de Paris (7 ou 30 jours). Les cases vont de la
 * plus ancienne à la plus récente ; la dernière est en cours.
 */
export type CaseDuPilotage = {
  /** Son début (ISO). */
  le: string;
  /** Les visiteurs arrivés dans la case (une personne par jour : visites). */
  visiteurs: number;
  /** Les comptes qui ont payé un achat dans la case. */
  acheteurs: number;
  /** Les achats payés dans la case, TTC, en centimes (même remboursés depuis). */
  centimes: number;
  /** Ce qu’a coûté l’IA dans la case, en dollars. */
  dollars: number;
};

/**
 * Des convs (importées sur la période, ou celles d’entre elles payées), par genre. `moi` : le pronom de celui qui importe
 * (« Qui es-tu ? »), `inconnu` tant qu’il ne l’a pas rempli. `autre` et `paires`, sur les convs où il l’est : le pronom de
 * l’autre tel que la lecture le prend (pronomDeLAutre : sa fiche, sinon la conv, sinon l’opposé du tien, `devines`).
 */
export type Genres = {
  convs: number;
  moi: Record<Pronom | "inconnu", number>;
  autre: Record<Pronom, number> & { devines: number };
  paires: Record<Paire, number>;
};

/**
 * Le pilotage, sur la période (`jours`, une fenêtre glissante comme les autres chiffres) et celle d’avant. L’argent est
 * TTC, en centimes ; l’IA en dollars (couts). La marge en sort par margeApresIA (src/contenu/pilotage.ts).
 */
export type Pilotage = {
  /** Les cases des graphiques : des heures (24 h) ou des jours de Paris. */
  pas: "heure" | "jour";
  cases: CaseDuPilotage[];
  /** Le chiffre d’affaires net : payé − remboursé − contesté, sur la période (comme ventesDepuis). */
  net: Chiffre;
  payes: Montant;
  rembourses: Montant;
  contestes: Montant;
  /** Les visiteurs : une personne par jour (une personne revenue deux jours compte deux fois). */
  visiteurs: Chiffre;
  /** Les comptes qui ont payé au moins un achat. */
  acheteurs: Chiffre;
  /** Le payé TTC, en centimes : le revenu par acheteur en sort. */
  centimesPayes: Chiffre;
  /** Ce qu’a coûté l’IA, en dollars, sur la période et celle d’avant (comme couts.total et couts.avant). */
  dollars: Chiffre;
  /**
   * Le tunnel de la période : les visiteurs, les convs importées, celles qui sont arrivées au paywall (leur lecture
   * lancée), les acheteurs, et ceux d’entre eux qui ont payé au moins deux achats (depuis toujours).
   */
  tunnel: { visiteurs: number; imports: number; paywall: number; acheteurs: number; racheteurs: number };
  /**
   * Les jalons du tunnel (src/server/visites.ts, noterJalon) : pour chacun, les personnes qui l’ont passé sur la période,
   * une fois par jour (comme les visiteurs : la même personne revenue un autre jour compte une fois de plus). Tous les
   * jalons, même à 0.
   */
  jalons: Record<Jalon, number>;
  /** Le premier jour où les jalons se comptent (AAAA-MM-JJ), ou null : aucun encore. */
  jalonsDepuis: string | null;
  /**
   * L’import appli par appli (jalons_par_appli) : pour chaque appli qui a du monde sur la période, dans l’ordre de
   * CLES_DES_APPLIS, les personnes passées par chaque jalon de JALONS_PAR_APPLI sous elle, une fois par jour. Une
   * personne qui passe d’une appli à l’autre compte sous chacune : additionnées, les applis peuvent dépasser `jalons`.
   */
  jalonsParAppli: { appli: AppKind; jalons: Record<JalonParAppli, number> }[];
  /**
   * Les sources : leurs visiteurs, et les acheteurs (et leur payé) d’après la source de leur compte (users.source).
   * `source` null : les acheteurs dont le compte date d’avant le suivi des visites. Classées par payé.
   */
  sources: { source: SourceVisite | null; visiteurs: number; acheteurs: number; centimes: number }[];
  /**
   * Qui importe : les convs importées sur la période (sans les prises du tournage), et celles d’entre elles payées depuis
   * (PAYEE_S), par genre. Leur meta est chiffrée : chacune se déchiffre à chaque calcul, sur toutes les convs de la
   * période, et il n’en sort que des totaux.
   */
  quiImporte: { importees: Genres; payees: Genres };
  /** Le payé par groupe d’offres (GROUPES_D_OFFRES), dans l’ordre des groupes, même vides. */
  mix: { groupe: GroupeDOffres; n: number; centimes: number }[];
  /**
   * Le haut du paywall (src/contenu/haut-du-paywall.ts) : pour chaque titre, dans l’ordre de GENRES_DU_HAUT, même vide,
   * les convs arrivées au paywall avec lui et les rapports débloqués après lui, comptés par jour de Paris (counters,
   * « haut:vu:<titre> », « haut:paye:<titre> ») : sur la période en jours entiers, comme les pannes.
   */
  hauts: { genre: GenreDuHaut; vus: number; payes: number }[];
  /**
   * La vente dans le chat (src/server/vente.ts) : pour chaque carte, dans l’ordre de GENRES_VENDUS, même vide, celles
   * posées sous une réponse, touchées (leur bouton) et refusées (« Pas maintenant »), comptées par jour de Paris
   * (counters, « vente:<événement>:<genre> » : sur la période en jours entiers), et les achats payés depuis elles
   * (achats.vente, payés sur la période, même remboursés depuis) et leur montant.
   */
  ventesDuChat: { genre: GenreVendu; vues: number; touchees: number; refusees: number; payees: number; centimes: number }[];
  /**
   * La note des rapports écrits (src/server/note-du-rapport.ts) : « Oui, grave », « Bof », ce qui n’allait pas après
   * « Bof » (dans l’ordre de RAISONS_DE_LA_NOTE, même vide), et les avis partis à l’équipe, comptés par jour de Paris
   * (counters, CLES_DE_LA_NOTE : sur la période en jours entiers), une fois par conv chacun.
   */
  note: { oui: number; bof: number; avis: number; raisons: { raison: RaisonDeLaNote; n: number }[] };
  /**
   * L’A/B de la vente dans le chat (groupeDeVente) : pour chaque moitié, les comptes qui ont écrit au chat sur la période,
   * ceux d’entre eux qui ont payé quelque chose sur la période (n’importe quelle offre, d’où qu’elle se paie), et ce montant.
   */
  abDuChat: { groupe: GroupeDeVente; comptes: number; acheteurs: number; centimes: number }[];
  /**
   * Les mails des séquences (src/server/sequences.ts) : pour chaque mail, dans l’ordre des séquences, ceux partis sur la
   * période (envois_mails, sans les écartés), les boutons touchés (counters, « mail:<clé> », par jour de Paris : sur la
   * période en jours entiers), et ceux après lesquels le compte a payé quelque chose dans les 3 jours.
   */
  mails: { cle: CleDeMail; envoyes: number; clics: number; payes: number }[];
  /**
   * L’A/B de S1 J+6 (groupeDuJ6, src/server/sequences.ts) : les comptes arrivés à J+6 sur la période, avec la one time
   * offer rouverte (le mail parti) ou sans (le témoin), et ceux qui ont payé un rapport dans les 3 jours.
   */
  abDerniere: { avec: { n: number; payes: number }; sans: { n: number; payes: number } };
  /** La dépense de l’IA aujourd’hui (jour de Paris) et le budget du jour (BUDGET_IA.jour), en dollars. */
  iaDuJour: { dollars: number; budget: number };
  /**
   * Ce qui coince sur la période : les tâches en échec, celles bloquées en ce moment, les paiements refusés (un achat
   * resté en attente, lui, est surtout un paiement abandonné), les réponses de BLUSH sorties en alerte danger (leurs
   * bulles rendues), et les pannes du serveur (une route /api qui répond « panne », une page qui plante :
   * src/server/pannes.ts), comptées par jour de Paris : sur la période en jours entiers (sur 24 h, aujourd’hui), et
   * aujourd’hui.
   */
  sante: { echecs: number; bloquees: number; paiementsEchoues: number; alertes: number; pannes: number; pannesDuJour: number };
  /** Le premier jour où les visites se comptent (AAAA-MM-JJ), ou null : aucune encore. */
  suiviDepuis: string | null;
};

/* Les offres qui débloquent le rapport d’une conv : l’entonnoir des achats part des verdicts lus */
const OFFRES_DU_RAPPORT = OFFRES.filter((o) => CATALOGUE[o].conv);
/**
 * Une conv payée (en SQL brut, `stories` sous l’alias `s`) : une offre de son rapport payée, ou un rapport d’avance
 * utilisé sur elle (il n’a sa conv qu’alors), même remboursés depuis. Une conv offerte (l’équipe, la bêta) ne l’est pas.
 */
const PAYEE_S = sql`exists (select 1 from achats a where a.story_id = s.id and a.paye_le is not null and a.offre in (${sql.join(
  [...OFFRES_DU_RAPPORT, RAPPORT_D_AVANCE.offre].map((o) => sql`${o}`),
  sql`, `,
)}))`;

/**
 * Minuit à Paris, `jours` jours avant le jour de `maintenant` (une expression SQL : now(), ou un instant figé par un
 * test). Les jours se retirent de l’heure de Paris, avant d’en refaire un instant : retirés de l’instant, dans une base
 * réglée sur UTC, ils font 24 h chacun, et la semaine qui suit un changement d’heure commençait à 1 h (ou la veille à
 * 23 h) au lieu de minuit.
 */
export const minuitDeParis = (jours: number, maintenant = "now()") =>
  sql.raw(`((date_trunc('day', ${maintenant} at time zone 'Europe/Paris') - interval '${jours} days') at time zone 'Europe/Paris')`);

/* Le début du jour de Paris, et celui des 7 derniers jours (aujourd’hui compris) */
const DEBUT_DU_JOUR = minuitDeParis(0);
const DEBUT_DE_LA_SEMAINE = minuitDeParis(6);

const lignes = async <T>(q: SQL) => (await db().execute(q)).rows as T[];
/** La ligne d’un agrégat (count, sum sans group by) : il en rend toujours une. */
const ligne = async <T>(q: SQL) => uneLigne(await lignes<T>(q), "stats");
const n = (v: unknown) => Number(v ?? 0);

/**
 * Les postes de coût, d’après l’étiquette de chaque appel au modèle. La mémoire en trois : sa création après le rapport
 * (une par rapport), ses mises à jour en direct, et celles parties en lot (src/server/memoire-en-lot.ts, à moitié prix) :
 * leurs appels se comparent aux messages du chat sans en retirer les créations à l’estime.
 */
const POSTES: [string, (tache: string) => boolean][] = [
  ["Verdict", (t) => t === "verdict"],
  ["Rapport", (t) => t.startsWith("rapport")],
  ["Mémoire (création)", (t) => t === "memoire"],
  ["Mémoire (mise à jour)", (t) => t === "memoire_maj"],
  ["Mémoire (en lot)", (t) => t === "memoire_maj_lot"],
  ["Chat", (t) => t === "chat"],
  ["Captures", (t) => t.startsWith("captures") || t === "01"],
];

/*
 * Les prises du mode tournage (src/server/tournage.ts) ne comptent pas : une créatrice qui filme n’est ni un import, ni
 * un verdict, ni un rapport du tunnel. Une conv en est une prise si elle porte sa conv de tournage, ou l’heure de sa
 * relecture (sa conv de tournage effacée depuis) ; la conv lue une fois pour un lien (la source d’une conv de tournage)
 * n’en est pas une vraie non plus. En SQL brut : `stories` sous son nom, ou sous l’alias `s`. Les comptes des créatrices
 * (une prise, ou un brouillon de tournage) et celui des convs de tournage ne comptent pas parmi les comptes, et leur chat
 * ne compte pas.
 */
const VRAIE_CONV = "tournage_id is null and tournage_le is null and not exists (select 1 from tournages t where t.story_id = stories.id)";
const VRAIE_CONV_S = "s.tournage_id is null and s.tournage_le is null and not exists (select 1 from tournages t where t.story_id = s.id)";
/** La conv de la ligne (sa colonne `story_id`) n’est pas une prise du mode tournage. */
const DUNE_VRAIE_CONV = (col: string) => `${col} in (select id from stories where ${VRAIE_CONV})`;
/** Le compte n’est ni celui d’une créatrice, ni celui des convs de tournage (COMPTE_DU_TOURNAGE). En SQL brut, `users` sous son nom. */
const VRAI_COMPTE = `email <> '${COMPTE_DU_TOURNAGE}' and not exists (select 1 from stories s where s.user_id = users.id and (s.tournage_id is not null or s.tournage_le is not null))`;
/** Une étape arrêtée parce que sa conv est une prise du mode tournage n’est pas un échec (src/server/pipeline.ts). */
const VRAI_ECHEC = "coalesce(error, '') <> 'tournage'";
/**
 * Une tâche bloquée : « en cours » sans battement depuis PERIME_S (son instance arrêtée), ou une mise à jour de la mémoire
 * encore en lot passé LOT_BLOQUE_S (src/server/memoire-en-lot.ts : le passage des 5 minutes l’aurait remise en direct).
 * Le prochain passage les relance. En SQL brut, `tasks` sous son nom.
 */
const BLOQUEE = `(status = 'en_cours' and heartbeat_at < now() - make_interval(secs => ${PERIME_S})) or (status = 'lot' and updated_at < now() - make_interval(secs => ${LOT_BLOQUE_S}))`;

export async function statsAdmin(jours: Periode): Promise<StatsAdmin> {
  /* La période (k = 0) et celle d’avant (k = 1), sur une colonne de date */
  const dans = (col: string, k = 0) => sql.raw(`${col} >= now() - make_interval(days => ${(k + 1) * jours}) and ${col} < now() - make_interval(days => ${k * jours})`);
  const chiffre = async (table: string, col: string, ou = "true"): Promise<Chiffre> => {
    const r = await ligne<{ a: string; b: string }>(
      sql`select count(*) filter (where ${dans(col)}) as a, count(*) filter (where ${dans(col, 1)}) as b from ${sql.raw(table)} where ${sql.raw(ou)}`,
    );
    return { valeur: n(r.a), avant: n(r.b) };
  };
  const nbJours = jours === 30 ? 30 : 14;

  const [comptes, convs, verdicts, rapports, messages, actifs, parcours, activite, compteurs, liensActifs, couts, coutsAvant, echecs, taches, attente, totaux] = await Promise.all([
    chiffre("users", "created_at", VRAI_COMPTE),
    chiffre("stories", "created_at", VRAIE_CONV),
    chiffre("verdicts", "created_at", DUNE_VRAIE_CONV("story_id")),
    chiffre("reports", "updated_at", `data is not null and ${DUNE_VRAIE_CONV("story_id")}`),
    chiffre("chat_messages", "created_at", `role = 'toi' and ${DUNE_VRAIE_CONV("story_id")}`),
    ligne<{ a: string; b: string }>(
      sql`select count(distinct s.user_id) filter (where ${dans("c.created_at")}) as a, count(distinct s.user_id) filter (where ${dans("c.created_at", 1)}) as b
          from chat_messages c join stories s on s.id = c.story_id where c.role = 'toi' and ${sql.raw(VRAIE_CONV_S)}`,
    ).then((r) => ({ valeur: n(r.a), avant: n(r.b) })),
    ligne<{ importees: string; compte: string; verdict: string; rapport: string; chat: string }>(
      sql`select count(*) as importees,
            count(*) filter (where s.user_id is not null) as compte,
            count(*) filter (where exists (select 1 from verdicts v where v.story_id = s.id)) as verdict,
            count(*) filter (where exists (select 1 from reports r where r.story_id = s.id and r.data is not null)) as rapport,
            count(*) filter (where exists (select 1 from chat_messages c where c.story_id = s.id and c.role = 'toi')) as chat
          from stories s where ${dans("s.created_at")} and ${sql.raw(VRAIE_CONV_S)}`,
    ),
    /*
     * Une passe par table depuis le premier jour, comptée par jour de Paris, puis posée sur les jours : pas une
     * sous-requête par jour. Le planificateur estime la série des jours à 1 000 lignes : refaire trois sous-requêtes à
     * chacune (avec l’exclusion du tournage) gonflait le coût estimé au-delà du seuil de la compilation JIT de Postgres,
     * qui coûtait alors des centaines de millisecondes par appel (la CI du 15 octobre)
     */
    lignes<{ jour: string; imports: string; verdicts: string; rapports: string }>(
      sql`with j as (
            select generate_series((now() at time zone 'Europe/Paris')::date - ${nbJours - 1}::int, (now() at time zone 'Europe/Paris')::date, interval '1 day')::date as jour),
          debut as (select (((now() at time zone 'Europe/Paris')::date - ${nbJours - 1}::int)::timestamp at time zone 'Europe/Paris') as t),
          i as (select (s.created_at at time zone 'Europe/Paris')::date as jour, count(*) as n from stories s
            where s.created_at >= (select t from debut) and ${sql.raw(VRAIE_CONV_S)} group by 1),
          v as (select (v.created_at at time zone 'Europe/Paris')::date as jour, count(*) as n from verdicts v
            where v.created_at >= (select t from debut) and ${sql.raw(DUNE_VRAIE_CONV("v.story_id"))} group by 1),
          r as (select (r.updated_at at time zone 'Europe/Paris')::date as jour, count(*) as n from reports r
            where r.data is not null and r.updated_at >= (select t from debut) and ${sql.raw(DUNE_VRAIE_CONV("r.story_id"))} group by 1)
          select to_char(j.jour, 'YYYY-MM-DD') as jour, coalesce(i.n, 0) as imports, coalesce(v.n, 0) as verdicts, coalesce(r.n, 0) as rapports
          from j left join i on i.jour = j.jour left join v on v.jour = j.jour left join r on r.jour = j.jour order by j.jour`,
    ),
    lignes<{ key: string; total: string }>(sql`select key, sum(count) as total from counters where day > (now() at time zone 'Europe/Paris')::date - ${jours}::int group by key`),
    ligne<{ n: string }>(sql`select count(*) as n from shares`),
    lignes<{ task: string; appels: string; micros: string }>(
      sql`select task, count(*) as appels, sum(cost_micros) as micros from ai_usage where ${dans("created_at")} group by task`,
    ),
    ligne<{ micros: string }>(sql`select coalesce(sum(cost_micros), 0) as micros from ai_usage where ${dans("created_at", 1)}`),
    lignes<{ code: string; n: string }>(
      sql`select coalesce(error, 'inconnu') as code, count(*) as n from tasks where status = 'echec' and ${sql.raw(VRAI_ECHEC)} and ${dans("updated_at")} group by 1 order by 2 desc limit 8`,
    ),
    ligne<{ en_cours: string; bloquees: string; attente: string }>(
      sql`select count(*) filter (where status = 'en_cours') as en_cours,
            count(*) filter (where ${sql.raw(BLOQUEE)}) as bloquees,
            count(*) filter (where status = 'attente') as attente
          from tasks`,
    ),
    chiffre("waitlist", "created_at"),
    ligne<{ attente: string; comptes: string }>(sql`select (select count(*) from waitlist) as attente, (select count(*) from users where ${sql.raw(VRAI_COMPTE)}) as comptes`),
  ]);

  const [ventes, bulles, achats, offresUniques, liste, actions] = await Promise.all([
    Promise.all([ventesDepuis(DEBUT_DU_JOUR), ventesDepuis(DEBUT_DE_LA_SEMAINE)]),
    Promise.all([bullesDepuis(DEBUT_DU_JOUR), bullesDepuis(DEBUT_DE_LA_SEMAINE)]),
    ligne<{ commandes: string; comptes: string; payees: string; echouees: string; en_attente: string }>(
      sql`select count(*) as commandes, count(distinct user_id) as comptes, count(*) filter (where paye_le is not null) as payees,
            count(*) filter (where statut = 'echoue') as echouees, count(*) filter (where statut = 'en_attente') as en_attente
          from achats where ${dans("cree_le")} and offre in (${sql.join(
            OFFRES_DU_RAPPORT.map((o) => sql`${o}`),
            sql`, `,
          )})`,
    ),
    lignes<{ offre: OffreUnique; montrees: string; prises: string }>(
      sql`select offre, count(*) as montrees, count(*) filter (where prise_le is not null) as prises from offres_uniques where ${dans("montree_le")} group by offre`,
    ),
    etatDeLaListe(),
    actionsRecentes(),
  ]);
  const ou = new Map(offresUniques.map((r) => [r.offre, r]));

  const c = new Map(compteurs.map((r) => [r.key, n(r.total)]));
  const dollars = (micros: number) => micros / 1e6;
  const total = couts.reduce((s, r) => s + n(r.micros), 0);
  const coutDe = (f: (t: string) => boolean) => couts.filter((r) => f(r.task)).reduce((s, r) => s + n(r.micros), 0);
  const postes = POSTES.map(([nom, f]) => ({ nom, dollars: dollars(coutDe(f)), appels: couts.filter((r) => f(r.task)).reduce((s, r) => s + n(r.appels), 0) }));
  const autres = couts.filter((r) => !POSTES.some(([, f]) => f(r.task)));
  if (autres.length) postes.push({ nom: "Autres", dollars: dollars(autres.reduce((s, r) => s + n(r.micros), 0)), appels: autres.reduce((s, r) => s + n(r.appels), 0) });
  const invites = env().BLUSH_ACCES_LIBRE;

  return {
    jours,
    le: new Date().toISOString(),
    cles: { comptes, convs, verdicts, rapports, messages, actifs },
    parcours: { importees: n(parcours.importees), compte: n(parcours.compte), verdict: n(parcours.verdict), rapport: n(parcours.rapport), chat: n(parcours.chat) },
    activite: activite.map((r) => ({ jour: r.jour, imports: n(r.imports), verdicts: n(r.verdicts), rapports: n(r.rapports) })),
    partage: {
      ouvertures: c.get("partage_ouvert") ?? 0,
      liens: c.get("lien_cree") ?? 0,
      apercus: c.get("lien_apercu") ?? 0,
      visites: c.get("lien_vu") ?? 0,
      essais: c.get("lien_essai") ?? 0,
      imports: c.get("import_partage") ?? 0,
      actifs: n(liensActifs.n),
    },
    couts: {
      total: dollars(total),
      avant: dollars(n(coutsAvant.micros)),
      /* Un rapport complet : son plan, ses chapitres et la mémoire faite juste après */
      parRapport: rapports.valeur ? dollars(coutDe((t) => t.startsWith("rapport") || t === "memoire")) / rapports.valeur : null,
      parVerdict: verdicts.valeur ? dollars(coutDe((t) => t === "verdict")) / verdicts.valeur : null,
      postes: postes.filter((p) => p.appels > 0).sort((a, b) => b.dollars - a.dollars),
    },
    sante: {
      echecs: echecs.map((r) => ({ code: r.code, n: n(r.n) })),
      pannes: compteurs
        .filter((r) => r.key.startsWith(PANNE))
        .map((r) => ({ lieu: r.key.slice(PANNE.length), n: n(r.total) }))
        .sort((a, b) => b.n - a.n || a.lieu.localeCompare(b.lieu))
        .slice(0, 8),
      enCours: n(taches.en_cours),
      bloquees: n(taches.bloquees),
      enAttente: n(taches.attente),
    },
    beta: {
      fermee: env().BLUSH_BETA_FERMEE,
      invites: invites === "*" ? "tous" : invites.length,
      attente: n(totaux.attente),
      attenteNouveaux: attente.valeur,
      comptes: n(totaux.comptes),
      attenteInvites: liste.invites,
      mailsPossibles: liste.mailsPossibles,
    },
    ventes: { jour: ventes[0], semaine: ventes[1] },
    bulles: { jour: bulles[0], semaine: bulles[1] },
    achats: { commandes: n(achats.commandes), comptes: n(achats.comptes), payees: n(achats.payees), echouees: n(achats.echouees), enAttente: n(achats.en_attente) },
    offresUniques: OFFRES_UNIQUES.map((offre) => ({ offre, montrees: n(ou.get(offre)?.montrees), prises: n(ou.get(offre)?.prises) })),
    actions,
    pilotage: await pilotageDe(jours),
  };
}

/* Une fenêtre glissante de `jours` sur une colonne de date : la période (k = 0) ou celle d’avant (k = 1) */
const fenetre = (col: string, jours: Periode, k = 0) =>
  sql.raw(`${col} >= now() - make_interval(days => ${(k + 1) * jours}) and ${col} < now() - make_interval(days => ${k * jours})`);

/**
 * Le pilotage de la période : l’argent, les visiteurs, le tunnel, les sources, ce qui se vend, l’IA et ce qui coince.
 * Les chiffres suivent la fenêtre glissante des autres (`jours` jusqu’à maintenant) ; les cases des graphiques, elles,
 * sont des heures pleines (24 h) ou des jours de Paris entiers (la première commence à minuit).
 */
async function pilotageDe(jours: Periode): Promise<Pilotage> {
  const W = (col: string, k = 0) => fenetre(col, jours, k);
  const pas = jours === 1 ? "heure" : "jour";
  /* Les cases : leur début, et la case d’une date (la même expression des deux côtés de la jointure) */
  const cases =
    pas === "heure"
      ? sql.raw(`select generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') as debut`)
      : sql.raw(
          `select (j::timestamp at time zone 'Europe/Paris') as debut from generate_series((now() at time zone 'Europe/Paris')::date - ${jours - 1}, (now() at time zone 'Europe/Paris')::date, interval '1 day') as j`,
        );
  const caseDe = (col: string) => sql.raw(pas === "heure" ? `date_trunc('hour', ${col})` : `((${col} at time zone 'Europe/Paris')::date::timestamp at time zone 'Europe/Paris')`);
  const [
    parCase,
    argent,
    visiteurs,
    dollars,
    tunnel,
    jalons,
    jalonsDepuis,
    parAppli,
    visiteursParSource,
    achatsParSource,
    parOffre,
    iaDuJour,
    sante,
    pannes,
    suivi,
    hauts,
    envois,
    clics,
    ab,
    ventesCompteurs,
    ventesPayees,
    abChat,
    convsDeLaPeriode,
    notes,
  ] = await Promise.all([
    lignes<{ debut: string; visiteurs: string; acheteurs: string; centimes: string; micros: string }>(
      sql`with c as (${cases}),
            v as (select ${caseDe("arrive_le")} as b, count(*) as n from visites where arrive_le >= (select min(debut) from c) group by 1),
            a as (select ${caseDe("paye_le")} as b, count(distinct user_id) as acheteurs, sum(centimes) as centimes from achats
                  where paye_le >= (select min(debut) from c) group by 1),
            i as (select ${caseDe("created_at")} as b, sum(cost_micros) as micros from ai_usage where created_at >= (select min(debut) from c) group by 1)
          select c.debut, v.n as visiteurs, a.acheteurs, a.centimes, i.micros
          from c left join v on v.b = c.debut left join a on a.b = c.debut left join i on i.b = c.debut order by c.debut`,
    ),
    ligne<Record<"payes" | "payes_c" | "payes_av_c" | "remb" | "remb_c" | "remb_av_c" | "cont" | "cont_c" | "cont_av_c" | "acheteurs" | "acheteurs_av", string | null>>(
      sql`select count(*) filter (where ${W("paye_le")}) as payes, sum(centimes) filter (where ${W("paye_le")}) as payes_c,
            sum(centimes) filter (where ${W("paye_le", 1)}) as payes_av_c,
            count(*) filter (where statut = 'rembourse' and ${W("annule_le")}) as remb, sum(centimes) filter (where statut = 'rembourse' and ${W("annule_le")}) as remb_c,
            sum(centimes) filter (where statut = 'rembourse' and ${W("annule_le", 1)}) as remb_av_c,
            count(*) filter (where statut = 'conteste' and ${W("annule_le")}) as cont, sum(centimes) filter (where statut = 'conteste' and ${W("annule_le")}) as cont_c,
            sum(centimes) filter (where statut = 'conteste' and ${W("annule_le", 1)}) as cont_av_c,
            count(distinct user_id) filter (where ${W("paye_le")}) as acheteurs, count(distinct user_id) filter (where ${W("paye_le", 1)}) as acheteurs_av
          from achats where paye_le is not null`,
    ),
    ligne<{ a: string; b: string }>(sql`select count(*) filter (where ${W("arrive_le")}) as a, count(*) filter (where ${W("arrive_le", 1)}) as b from visites`),
    ligne<{ a: string | null; b: string | null }>(
      sql`select sum(cost_micros) filter (where ${W("created_at")}) as a, sum(cost_micros) filter (where ${W("created_at", 1)}) as b from ai_usage`,
    ),
    /*
     * Arrivée au paywall : sa lecture lancée, donc une tâche « verdict », quel que soit son état. Depuis le paywall
     * d’avant la lecture (16 octobre), elle attend le paiement (« paiement ») : le verdict écrit ne compte plus que les
     * convs payées. Avant, le verdict offert venait avant le paywall : la tâche le compte aussi
     */
    ligne<{ imports: string; paywall: string; racheteurs: string }>(
      sql`select (select count(*) from stories s where ${W("s.created_at")} and ${sql.raw(VRAIE_CONV_S)}) as imports,
            (select count(*) from stories s where ${W("s.created_at")} and ${sql.raw(VRAIE_CONV_S)}
              and exists (select 1 from tasks t where t.story_id = s.id and t.kind = 'verdict')) as paywall,
            (select count(*) from (select user_id from achats where paye_le is not null and user_id in (select user_id from achats where ${W("paye_le")})
              group by user_id having count(*) >= 2) as r) as racheteurs`,
    ),
    lignes<{ jalon: Jalon; n: string }>(sql`select jalon, count(*) as n from jalons where ${W("le")} group by jalon`),
    ligne<{ depuis: string | null }>(sql`select to_char(min(jour), 'YYYY-MM-DD') as depuis from jalons`),
    lignes<{ appli: AppKind; jalon: JalonParAppli; n: string }>(sql`select appli, jalon, count(*) as n from jalons_par_appli where ${W("le")} group by appli, jalon`),
    lignes<{ source: SourceVisite; n: string }>(sql`select source, count(*) as n from visites where ${W("arrive_le")} group by source`),
    lignes<{ source: SourceVisite | null; acheteurs: string; centimes: string }>(
      sql`select u.source, count(distinct a.user_id) as acheteurs, sum(a.centimes) as centimes
          from achats a left join users u on u.id = a.user_id where ${W("a.paye_le")} group by u.source`,
    ),
    lignes<{ offre: OffreId; n: string; centimes: string }>(sql`select offre, count(*) as n, sum(centimes) as centimes from achats where ${W("paye_le")} group by offre`),
    ligne<{ micros: string | null }>(sql`select sum(cost_micros) as micros from ai_usage where created_at >= ${DEBUT_DU_JOUR}`),
    ligne<{ echecs: string; bloquees: string; echoues: string; alertes: string }>(
      sql`select (select count(*) from tasks where status = 'echec' and ${sql.raw(VRAI_ECHEC)} and ${W("updated_at")}) as echecs,
            (select count(*) from tasks where ${sql.raw(BLOQUEE)}) as bloquees,
            (select count(*) from achats where statut = 'echoue' and ${W("cree_le")}) as echoues,
            (select coalesce(sum(count), 0) from counters where key = ${CLES.alerteChat} and day > (now() at time zone 'Europe/Paris')::date - ${jours}::int) as alertes`,
    ),
    ligne<{ periode: string | null; jour: string | null }>(
      sql`select sum(count) filter (where day > (now() at time zone 'Europe/Paris')::date - ${jours}::int) as periode,
            sum(count) filter (where day = (now() at time zone 'Europe/Paris')::date) as jour
          from counters where key like ${`${PANNE}%`}`,
    ),
    ligne<{ depuis: string | null }>(sql`select to_char(min(jour), 'YYYY-MM-DD') as depuis from visites`),
    lignes<{ key: string; n: string }>(
      sql`select key, sum(count) as n from counters where key like ${`${HAUT}%`} and day > (now() at time zone 'Europe/Paris')::date - ${jours}::int group by key`,
    ),
    lignes<{ cle: string; envoyes: string; payes: string }>(
      sql`select e.cle, count(*) as envoyes,
            count(*) filter (where exists (select 1 from achats a where a.user_id = e.user_id and a.statut = 'paye'
              and a.paye_le > e.envoye_le and a.paye_le <= e.envoye_le + interval '3 days')) as payes
          from envois_mails e where e.parti and ${W("e.envoye_le")} group by e.cle`,
    ),
    lignes<{ key: string; n: string }>(
      sql`select key, sum(count) as n from counters where key like ${`${MAIL}%`} and day > (now() at time zone 'Europe/Paris')::date - ${jours}::int group by key`,
    ),
    lignes<{ temoin: boolean; n: string; payes: string }>(
      sql`select e.occasion like '%:temoin' as temoin, count(*) as n,
            count(*) filter (where exists (select 1 from achats a where a.user_id = e.user_id and a.statut = 'paye' and a.story_id is not null
              and a.paye_le > e.envoye_le and a.paye_le <= e.envoye_le + interval '3 days')) as payes
          from envois_mails e where e.cle = 's1_derniere' and (e.parti or e.occasion like '%:temoin') and ${W("e.envoye_le")} group by 1`,
    ),
    lignes<{ key: string; n: string }>(
      sql`select key, sum(count) as n from counters where key like ${`${VENTE}%`} and day > (now() at time zone 'Europe/Paris')::date - ${jours}::int group by key`,
    ),
    lignes<{ vente: GenreVendu; n: string; centimes: string }>(
      sql`select vente, count(*) as n, sum(centimes) as centimes from achats where vente is not null and paye_le is not null and ${W("paye_le")} group by vente`,
    ),
    lignes<{ avec: boolean; comptes: string; acheteurs: string; centimes: string }>(
      sql`with c as (select distinct s.user_id from chat_messages m join stories s on s.id = m.story_id
                     where m.role = 'toi' and s.user_id is not null and ${W("m.created_at")}),
            p as (select a.user_id, sum(a.centimes) as centimes from achats a
                  where a.paye_le is not null and ${W("a.paye_le")} and a.user_id in (select user_id from c) group by a.user_id)
          select ${dansLaMoitieAvec(sql`c.user_id`)} as avec, count(*) as comptes, count(p.user_id) as acheteurs, coalesce(sum(p.centimes), 0) as centimes
          from c left join p on p.user_id = c.user_id group by 1`,
    ),
    lignes<{ meta: Buffer; payee: boolean }>(sql`select s.meta, ${PAYEE_S} as payee from stories s where ${W("s.created_at")} and ${sql.raw(VRAIE_CONV_S)}`),
    lignes<{ key: string; n: string }>(
      sql`select key, sum(count) as n from counters where key like ${`${NOTE}%`} and day > (now() at time zone 'Europe/Paris')::date - ${jours}::int group by key`,
    ),
  ]);

  const m = (c: unknown) => n(c);
  const net = { valeur: m(argent.payes_c) - m(argent.remb_c) - m(argent.cont_c), avant: m(argent.payes_av_c) - m(argent.remb_av_c) - m(argent.cont_av_c) };
  const parSource = new Map<SourceVisite | null, { visiteurs: number; acheteurs: number; centimes: number }>();
  const ligneDe = (source: SourceVisite | null) => parSource.get(source) ?? parSource.set(source, { visiteurs: 0, acheteurs: 0, centimes: 0 }).get(source)!;
  for (const v of visiteursParSource) ligneDe(v.source).visiteurs = n(v.n);
  for (const a of achatsParSource) Object.assign(ligneDe(a.source), { acheteurs: n(a.acheteurs), centimes: n(a.centimes) });
  const groupes = new Map(GROUPES_D_OFFRES.map((g) => [g, { n: 0, centimes: 0 }]));
  for (const o of parOffre) {
    const g = groupes.get(GROUPE_DE_L_OFFRE[o.offre])!;
    g.n += n(o.n);
    g.centimes += n(o.centimes);
  }
  const convs = convsDeLaPeriode.map((c) => ({ meta: metaDe(c), payee: c.payee }));

  return {
    pas,
    cases: parCase.map((c) => ({ le: new Date(c.debut).toISOString(), visiteurs: n(c.visiteurs), acheteurs: n(c.acheteurs), centimes: n(c.centimes), dollars: n(c.micros) / 1e6 })),
    net,
    payes: { n: n(argent.payes), centimes: m(argent.payes_c) },
    rembourses: { n: n(argent.remb), centimes: m(argent.remb_c) },
    contestes: { n: n(argent.cont), centimes: m(argent.cont_c) },
    visiteurs: { valeur: n(visiteurs.a), avant: n(visiteurs.b) },
    acheteurs: { valeur: n(argent.acheteurs), avant: n(argent.acheteurs_av) },
    centimesPayes: { valeur: m(argent.payes_c), avant: m(argent.payes_av_c) },
    dollars: { valeur: n(dollars.a) / 1e6, avant: n(dollars.b) / 1e6 },
    tunnel: { visiteurs: n(visiteurs.a), imports: n(tunnel.imports), paywall: n(tunnel.paywall), acheteurs: n(argent.acheteurs), racheteurs: n(tunnel.racheteurs) },
    jalons: Object.fromEntries(JALONS.map((j) => [j, n(jalons.find((l) => l.jalon === j)?.n)])) as Record<Jalon, number>,
    jalonsDepuis: jalonsDepuis.depuis,
    jalonsParAppli: CLES_DES_APPLIS.filter((appli) => parAppli.some((l) => l.appli === appli)).map((appli) => ({
      appli,
      jalons: Object.fromEntries(JALONS_PAR_APPLI.map((j) => [j, n(parAppli.find((l) => l.appli === appli && l.jalon === j)?.n)])) as Record<JalonParAppli, number>,
    })),
    sources: [...parSource]
      .map(([source, l]) => ({ source, ...l }))
      .sort((a, b) => b.centimes - a.centimes || b.visiteurs - a.visiteurs || (a.source === null ? 1 : b.source === null ? -1 : 0)),
    quiImporte: { importees: genresDe(convs.map((c) => c.meta)), payees: genresDe(convs.filter((c) => c.payee).map((c) => c.meta)) },
    mix: GROUPES_D_OFFRES.map((groupe) => ({ groupe, ...groupes.get(groupe)! })),
    hauts: GENRES_DU_HAUT.map((genre) => ({
      genre,
      vus: n(hauts.find((h) => h.key === `${HAUT}vu:${genre}`)?.n),
      payes: n(hauts.find((h) => h.key === `${HAUT}paye:${genre}`)?.n),
    })),
    ventesDuChat: GENRES_VENDUS.map((genre) => {
      const compte = (evenement: string) => n(ventesCompteurs.find((v) => v.key === `${VENTE}${evenement}:${genre}`)?.n);
      const p = ventesPayees.find((v) => v.vente === genre);
      return { genre, vues: compte("vue"), touchees: compte("touchee"), refusees: compte("refusee"), payees: n(p?.n), centimes: n(p?.centimes) };
    }),
    note: {
      oui: n(notes.find((l) => l.key === CLES_DE_LA_NOTE.oui)?.n),
      bof: n(notes.find((l) => l.key === CLES_DE_LA_NOTE.bof)?.n),
      avis: n(notes.find((l) => l.key === CLES_DE_LA_NOTE.avis)?.n),
      raisons: RAISONS_DE_LA_NOTE.map((raison) => ({ raison, n: n(notes.find((l) => l.key === CLES_DE_LA_NOTE[raison])?.n) })),
    },
    abDuChat: (["avec", "sans"] as const).map((groupe) => {
      const l = abChat.find((x) => x.avec === (groupe === "avec"));
      return { groupe, comptes: n(l?.comptes), acheteurs: n(l?.acheteurs), centimes: n(l?.centimes) };
    }),
    mails: CLES_DES_MAILS.map((cle) => {
      const e = envois.find((l) => l.cle === cle);
      return { cle, envoyes: n(e?.envoyes), clics: n(clics.find((c) => c.key === `${MAIL}${cle}`)?.n), payes: n(e?.payes) };
    }),
    abDerniere: {
      avec: { n: n(ab.find((l) => !l.temoin)?.n), payes: n(ab.find((l) => !l.temoin)?.payes) },
      sans: { n: n(ab.find((l) => l.temoin)?.n), payes: n(ab.find((l) => l.temoin)?.payes) },
    },
    iaDuJour: { dollars: n(iaDuJour.micros) / 1e6, budget: BUDGET_IA.jour },
    sante: {
      echecs: n(sante.echecs),
      bloquees: n(sante.bloquees),
      paiementsEchoues: n(sante.echoues),
      alertes: n(sante.alertes),
      pannes: n(pannes.periode),
      pannesDuJour: n(pannes.jour),
    },
    suiviDepuis: suivi.depuis,
  };
}

/* La paire d’une conv : le pronom de celui qui importe, puis celui de l’autre */
const PAIRE: Record<Pronom, Record<Pronom, Paire>> = { elle: { il: "fille_garcon", elle: "deux_filles" }, il: { elle: "garcon_fille", il: "deux_garcons" } };

/** Les genres de ces convs (Genres), d’après leur meta déchiffrée. */
function genresDe(metas: Meta[]): Genres {
  const g: Genres = {
    convs: metas.length,
    moi: { elle: 0, il: 0, inconnu: 0 },
    autre: { elle: 0, il: 0, devines: 0 },
    paires: Object.fromEntries(PAIRES.map((p) => [p, 0])) as Record<Paire, number>,
  };
  for (const meta of metas) {
    if (!meta.pronom) {
      g.moi.inconnu += 1;
      continue;
    }
    g.moi[meta.pronom] += 1;
    const autre = pronomDeLAutreLu(meta, personnesDe(meta));
    g.autre[autre.pronom] += 1;
    if (autre.source === "devine") g.autre.devines += 1;
    g.paires[PAIRE[meta.pronom][autre.pronom]] += 1;
  }
  return g;
}

/**
 * Les ventes depuis `debut` : les achats payés depuis (même remboursés ou contestés ensuite), ceux remboursés ou contestés
 * depuis (s’ils avaient été payés : une commande jamais payée puis annulée ne compte pas), et les payés par offre, dans
 * l’ordre du catalogue. Les montants sont TTC (le prix payé, figé à la commande).
 */
async function ventesDepuis(debut: SQL): Promise<Ventes> {
  const r = await ligne<Record<"payes" | "payes_c" | "rembourses" | "rembourses_c" | "contestes" | "contestes_c", string | null>>(
    sql`select count(*) filter (where paye_le >= ${debut}) as payes, sum(centimes) filter (where paye_le >= ${debut}) as payes_c,
          count(*) filter (where statut = 'rembourse' and annule_le >= ${debut}) as rembourses,
          sum(centimes) filter (where statut = 'rembourse' and annule_le >= ${debut}) as rembourses_c,
          count(*) filter (where statut = 'conteste' and annule_le >= ${debut}) as contestes,
          sum(centimes) filter (where statut = 'conteste' and annule_le >= ${debut}) as contestes_c
        from achats where paye_le is not null`,
  );
  const parOffre = await lignes<{ offre: OffreId; n: string; centimes: string }>(
    sql`select offre, count(*) as n, sum(centimes) as centimes from achats where paye_le >= ${debut} group by offre`,
  );
  const po = new Map(parOffre.map((l) => [l.offre, l]));
  return {
    payes: { n: n(r.payes), centimes: n(r.payes_c) },
    rembourses: { n: n(r.rembourses), centimes: n(r.rembourses_c) },
    contestes: { n: n(r.contestes), centimes: n(r.contestes_c) },
    parOffre: OFFRES.filter((o) => po.has(o)).map((offre) => ({ offre, n: n(po.get(offre)?.n), centimes: n(po.get(offre)?.centimes) })),
  };
}

/** Les bulles depuis `debut`, d’après leur journal (mouvements_bulles) : chaque raison a son sens. */
async function bullesDepuis(debut: SQL): Promise<Bulles> {
  const r = await ligne<Record<keyof Bulles, string | null>>(
    sql`select coalesce(sum(delta) filter (where raison = 'achat'), 0) as vendues,
          coalesce(-sum(delta) filter (where raison = 'reponse'), 0) as depensees,
          coalesce(sum(delta) filter (where raison in ('beta', 'equipe') and delta > 0), 0) as offertes,
          coalesce(sum(delta) filter (where raison = 'rendu'), 0) as rendues
        from mouvements_bulles where cree_le >= ${debut}`,
  );
  return { vendues: n(r.vendues), depensees: n(r.depensees), offertes: n(r.offertes), rendues: n(r.rendues) };
}
