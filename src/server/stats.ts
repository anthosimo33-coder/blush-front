import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { CATALOGUE } from "@/contenu/offres";
import { OFFRES, OFFRES_UNIQUES, type OffreId, type OffreUnique } from "@/types";
import { etatDeLaListe } from "./attente";
import { db, uneLigne } from "./db";
import { env } from "./env";
import { actionsRecentes, type ActionRecente } from "./equipe";
import { PERIME_S } from "./taches";

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
  sante: { echecs: { code: string; n: number }[]; enCours: number; bloquees: number; enAttente: number };
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
};

/* Les offres qui débloquent le rapport d’une conv : l’entonnoir des achats part des verdicts lus */
const OFFRES_DU_RAPPORT = OFFRES.filter((o) => CATALOGUE[o].conv);

/* Le début du jour de Paris, et celui des 7 derniers jours (aujourd’hui compris) */
const DEBUT_DU_JOUR = sql.raw(`(date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')`);
const DEBUT_DE_LA_SEMAINE = sql.raw(`(date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris' - interval '6 days')`);

const lignes = async <T>(q: SQL) => (await db().execute(q)).rows as T[];
/** La ligne d’un agrégat (count, sum sans group by) : il en rend toujours une. */
const ligne = async <T>(q: SQL) => uneLigne(await lignes<T>(q), "stats");
const n = (v: unknown) => Number(v ?? 0);

/** Les postes de coût, d’après l’étiquette de chaque appel au modèle. */
const POSTES: [string, (tache: string) => boolean][] = [
  ["Verdict", (t) => t === "verdict"],
  ["Rapport", (t) => t.startsWith("rapport")],
  ["Mémoire", (t) => t.startsWith("memoire")],
  ["Chat", (t) => t === "chat"],
  ["Captures", (t) => t.startsWith("captures") || t === "01"],
];

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
    chiffre("users", "created_at"),
    chiffre("stories", "created_at"),
    chiffre("verdicts", "created_at"),
    chiffre("reports", "updated_at", "data is not null"),
    chiffre("chat_messages", "created_at", "role = 'toi'"),
    ligne<{ a: string; b: string }>(
      sql`select count(distinct s.user_id) filter (where ${dans("c.created_at")}) as a, count(distinct s.user_id) filter (where ${dans("c.created_at", 1)}) as b
          from chat_messages c join stories s on s.id = c.story_id where c.role = 'toi'`,
    ).then((r) => ({ valeur: n(r.a), avant: n(r.b) })),
    ligne<{ importees: string; compte: string; verdict: string; rapport: string; chat: string }>(
      sql`select count(*) as importees,
            count(*) filter (where s.user_id is not null) as compte,
            count(*) filter (where exists (select 1 from verdicts v where v.story_id = s.id)) as verdict,
            count(*) filter (where exists (select 1 from reports r where r.story_id = s.id and r.data is not null)) as rapport,
            count(*) filter (where exists (select 1 from chat_messages c where c.story_id = s.id and c.role = 'toi')) as chat
          from stories s where ${dans("s.created_at")}`,
    ),
    lignes<{ jour: string; imports: string; verdicts: string; rapports: string }>(
      sql`with j as (
            select generate_series((now() at time zone 'Europe/Paris')::date - ${nbJours - 1}::int, (now() at time zone 'Europe/Paris')::date, interval '1 day')::date as jour)
          select to_char(j.jour, 'YYYY-MM-DD') as jour,
            (select count(*) from stories s where (s.created_at at time zone 'Europe/Paris')::date = j.jour) as imports,
            (select count(*) from verdicts v where (v.created_at at time zone 'Europe/Paris')::date = j.jour) as verdicts,
            (select count(*) from reports r where r.data is not null and (r.updated_at at time zone 'Europe/Paris')::date = j.jour) as rapports
          from j order by j.jour`,
    ),
    lignes<{ key: string; total: string }>(sql`select key, sum(count) as total from counters where day > (now() at time zone 'Europe/Paris')::date - ${jours}::int group by key`),
    ligne<{ n: string }>(sql`select count(*) as n from shares`),
    lignes<{ task: string; appels: string; micros: string }>(
      sql`select task, count(*) as appels, sum(cost_micros) as micros from ai_usage where ${dans("created_at")} group by task`,
    ),
    ligne<{ micros: string }>(sql`select coalesce(sum(cost_micros), 0) as micros from ai_usage where ${dans("created_at", 1)}`),
    lignes<{ code: string; n: string }>(
      sql`select coalesce(error, 'inconnu') as code, count(*) as n from tasks where status = 'echec' and ${dans("updated_at")} group by 1 order by 2 desc limit 8`,
    ),
    ligne<{ en_cours: string; bloquees: string; attente: string }>(
      sql`select count(*) filter (where status = 'en_cours') as en_cours,
            count(*) filter (where status = 'en_cours' and heartbeat_at < now() - make_interval(secs => ${PERIME_S})) as bloquees,
            count(*) filter (where status = 'attente') as attente
          from tasks`,
    ),
    chiffre("waitlist", "created_at"),
    ligne<{ attente: string; comptes: string }>(sql`select (select count(*) from waitlist) as attente, (select count(*) from users) as comptes`),
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
    sante: { echecs: echecs.map((r) => ({ code: r.code, n: n(r.n) })), enCours: n(taches.en_cours), bloquees: n(taches.bloquees), enAttente: n(taches.attente) },
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
  };
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
