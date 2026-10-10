import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import { env } from "./env";
import { PERIME_S } from "./taches";

/*
 * Le tableau de bord (/admin) : que des nombres. Aucune conv, aucun message, aucun email n’en sort.
 * Les convs effacées (par l’utilisateur, ou par la purge) sortent des comptes.
 */

export type Periode = 1 | 7 | 30;
/** Un chiffre sur la période, et sur la période d’avant (pour la tendance). */
export type Chiffre = { valeur: number; avant: number };

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
  beta: { fermee: boolean; invites: number | "tous"; attente: number; attenteNouveaux: number; comptes: number };
};

const lignes = async <T,>(q: SQL) => (await db().execute(q)).rows as T[];
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
  const dans = (col: string, k = 0) =>
    sql.raw(`${col} >= now() - make_interval(days => ${(k + 1) * jours}) and ${col} < now() - make_interval(days => ${k * jours})`);
  const chiffre = async (table: string, col: string, ou = "true"): Promise<Chiffre> => {
    const [r] = await lignes<{ a: string; b: string }>(
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
    lignes<{ a: string; b: string }>(
      sql`select count(distinct s.user_id) filter (where ${dans("c.created_at")}) as a, count(distinct s.user_id) filter (where ${dans("c.created_at", 1)}) as b
          from chat_messages c join stories s on s.id = c.story_id where c.role = 'toi'`,
    ).then(([r]) => ({ valeur: n(r.a), avant: n(r.b) })),
    lignes<Record<string, string>>(
      sql`select count(*) as importees,
            count(*) filter (where s.user_id is not null) as compte,
            count(*) filter (where exists (select 1 from verdicts v where v.story_id = s.id)) as verdict,
            count(*) filter (where exists (select 1 from reports r where r.story_id = s.id and r.data is not null)) as rapport,
            count(*) filter (where exists (select 1 from chat_messages c where c.story_id = s.id and c.role = 'toi')) as chat
          from stories s where ${dans("s.created_at")}`,
    ),
    lignes<Record<string, string>>(
      sql`with j as (
            select generate_series((now() at time zone 'Europe/Paris')::date - ${nbJours - 1}::int, (now() at time zone 'Europe/Paris')::date, interval '1 day')::date as jour)
          select to_char(j.jour, 'YYYY-MM-DD') as jour,
            (select count(*) from stories s where (s.created_at at time zone 'Europe/Paris')::date = j.jour) as imports,
            (select count(*) from verdicts v where (v.created_at at time zone 'Europe/Paris')::date = j.jour) as verdicts,
            (select count(*) from reports r where r.data is not null and (r.updated_at at time zone 'Europe/Paris')::date = j.jour) as rapports
          from j order by j.jour`,
    ),
    lignes<{ key: string; total: string }>(
      sql`select key, sum(count) as total from counters where day > (now() at time zone 'Europe/Paris')::date - ${jours}::int group by key`,
    ),
    lignes<{ n: string }>(sql`select count(*) as n from shares`),
    lignes<{ task: string; appels: string; micros: string }>(
      sql`select task, count(*) as appels, sum(cost_micros) as micros from ai_usage where ${dans("created_at")} group by task`,
    ),
    lignes<{ micros: string }>(sql`select coalesce(sum(cost_micros), 0) as micros from ai_usage where ${dans("created_at", 1)}`),
    lignes<{ code: string; n: string }>(
      sql`select coalesce(error, 'inconnu') as code, count(*) as n from tasks where status = 'echec' and ${dans("updated_at")} group by 1 order by 2 desc limit 8`,
    ),
    lignes<Record<string, string>>(
      sql`select count(*) filter (where status = 'en_cours') as en_cours,
            count(*) filter (where status = 'en_cours' and heartbeat_at < now() - make_interval(secs => ${PERIME_S})) as bloquees,
            count(*) filter (where status = 'attente') as attente
          from tasks`,
    ),
    chiffre("waitlist", "created_at"),
    lignes<Record<string, string>>(sql`select (select count(*) from waitlist) as attente, (select count(*) from users) as comptes`),
  ]);

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
    parcours: { importees: n(parcours[0].importees), compte: n(parcours[0].compte), verdict: n(parcours[0].verdict), rapport: n(parcours[0].rapport), chat: n(parcours[0].chat) },
    activite: activite.map((r) => ({ jour: r.jour, imports: n(r.imports), verdicts: n(r.verdicts), rapports: n(r.rapports) })),
    partage: {
      ouvertures: c.get("partage_ouvert") ?? 0,
      liens: c.get("lien_cree") ?? 0,
      apercus: c.get("lien_apercu") ?? 0,
      visites: c.get("lien_vu") ?? 0,
      essais: c.get("lien_essai") ?? 0,
      imports: c.get("import_partage") ?? 0,
      actifs: n(liensActifs[0].n),
    },
    couts: {
      total: dollars(total),
      avant: dollars(n(coutsAvant[0].micros)),
      /* Un rapport complet : son plan, ses chapitres et la mémoire faite juste après */
      parRapport: rapports.valeur ? dollars(coutDe((t) => t.startsWith("rapport") || t === "memoire")) / rapports.valeur : null,
      parVerdict: verdicts.valeur ? dollars(coutDe((t) => t === "verdict")) / verdicts.valeur : null,
      postes: postes.filter((p) => p.appels > 0).sort((a, b) => b.dollars - a.dollars),
    },
    sante: { echecs: echecs.map((r) => ({ code: r.code, n: n(r.n) })), enCours: n(taches[0].en_cours), bloquees: n(taches[0].bloquees), enAttente: n(taches[0].attente) },
    beta: {
      fermee: env().BLUSH_BETA_FERMEE,
      invites: invites === "*" ? "tous" : invites.length,
      attente: n(totaux[0].attente),
      attenteNouveaux: attente.valeur,
      comptes: n(totaux[0].comptes),
    },
  };
}
