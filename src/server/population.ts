import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { POPULATIONS_DU_PRODUIT, type Population } from "@/types";
import { COMPTE_DU_TOURNAGE } from "./compte-du-tournage";
import { db } from "./db";
import { emailCanonique } from "./email-canonique";
import { env } from "./env";

/*
 * Qui est qui : la seule règle qui dit pour qui l’IA a été payée, appel par appel (ai_usage.population), et qui a payé
 * chaque achat (achats.population). /admin, le serveur MCP et le résumé de la nuit en tirent l’IA des tests (l’équipe et
 * le tournage), celle du produit (les clients et les prospects) et la marge produit ; le budget du jour
 * (src/server/budget.ts), lui, garde le total réel : il protège la facture. La première qui convient, dans l’ordre :
 *   1. « tournage » : une conv de tournage (une prise : stories.tournage_id ou tournage_le ; la conv qu’un lien rejoue :
 *      tournages.story_id), puis le compte des convs de tournage (COMPTE_DU_TOURNAGE) ;
 *   2. « equipe » : un compte dont l’email canonique (emailCanonique : ses alias compris) est celui d’un compte qui ouvre
 *      /admin (BLUSH_ADMINS, sinon BLUSH_ALERTES, comme estAdmin), et toutes ses convs ;
 *   3. « tournage » encore : le compte d’une créatrice (une prise faite avant l’appel), hors de l’équipe ;
 *   4. « offert » : un invité de BLUSH_ACCES_LIBRE (son email, comme accesLibre) qui n’est pas de l’équipe ;
 *   5. « client » : un compte qui a payé un achat avant l’appel (même remboursé depuis) ;
 *   6. « prospect » : un compte sans achat payé, une conv sans compte (un brouillon), ou une lecture d’avant l’import
 *      faite sans compte (des captures, les lots d’une vidéo : elle porte l’empreinte de son envoi) ;
 *   7. « inconnu » : la conv ou le compte de l’appel effacés avant sa note, ni conv ni compte ni envoi, une ligne d’avant
 *      la règle que rien ne rattache plus, ou un calcul en échec.
 * Tests = tournage + équipe ; produit = client + prospect (src/types : POPULATIONS_DES_TESTS, POPULATIONS_DU_PRODUIT) ;
 * l’offert reste à part : ni un test, ni une vente.
 *
 * Elle s’écrit une fois, en SQL (populationEnSQL), et ne se juge qu’à l’écriture : à la note de chaque appel, dans
 * l’insert même, après la réponse (noterCout, src/server/ia/usage.ts : aucun aller-retour de plus) ; au paiement de
 * chaque achat, juste après sa livraison (rangerLAchat) ; et au rattrapage de ce qui n’a pas encore la sienne
 * (rangerLesCouts, à chaque passage des 5 minutes). Les lectures (/admin, le MCP, le résumé) ne lisent que ces colonnes
 * figées, jamais la règle : une sous-requête liée par ligne, sur des tables entières, passait le seuil de la compilation
 * JIT de Postgres (l’incident du 15 octobre, #66 ; tests/population.test.ts borne le coût estimé de chaque requête). Les
 * ratios du produit (par verdict, par rapport) comptent les verdicts et les rapports dont les appels sont du produit : la
 * même population en haut et en bas. Une population est jugée à un instant et ne bouge plus : un prospect qui achète
 * garde ses appels d’avant en prospect (le produit, toujours), un compte effacé laisse la sienne à ses lignes et à ses
 * achats (sans identifiant : ai_usage n’en garde aucun, achats.user_id passe à vide), et changer BLUSH_ADMINS ne réécrit
 * pas le passé. Seule exception : une lecture faite sans compte (`ai_usage.sans_compte`) prend celle du compte que sa
 * conv trouve dans les deux jours (l’équipe qui essaie l’import sans être connectée). Les listes de l’équipe et des
 * invités viennent des variables d’environnement, lues à chaque calcul : la règle ne peut pas vivre dans un rattrapage de
 * scripts/base.mjs, qui tourne au build.
 */

/** Les emails canoniques de l’équipe : ceux qui ouvrent /admin (BLUSH_ADMINS, sinon BLUSH_ALERTES). */
function equipe(): string[] {
  const e = env();
  return [...new Set((e.BLUSH_ADMINS ?? e.BLUSH_ALERTES).map(emailCanonique))];
}

/** Les invités de BLUSH_ACCES_LIBRE, en minuscules (accesLibre) ; « * » (tout le monde, refusé en production) n’en désigne aucun. */
function invites(): string[] {
  const liste = env().BLUSH_ACCES_LIBRE;
  return liste === "*" ? [] : liste;
}

/** `expr` est l’un de ces textes ; une liste vide, jamais. */
const parmi = (expr: SQL, liste: readonly string[]): SQL =>
  liste.length
    ? sql`${expr} in (${sql.join(
        liste.map((v) => sql`${v}`),
        sql`, `,
      )})`
    : sql`false`;

/** Cette population (une expression SQL : une colonne) est celle du produit : un client ou un prospect. */
export const duProduit = (population: SQL): SQL => parmi(population, POPULATIONS_DU_PRODUIT);

/**
 * L’email canonique, en SQL : la règle d’emailCanonique (src/server/email-canonique.ts), que tests/population.test.ts
 * compare cas par cas. En minuscules, sans les blancs autour, sans le `+suffixe` du nom (à partir du deuxième caractère),
 * et pour Gmail sans les points du nom, sur gmail.com ; un texte sans nom ou sans domaine revient en minuscules.
 */
export function emailCanoniqueEnSQL(email: SQL): SQL {
  return sql`(select case when position('@' in pop_e.propre) = 0 or pop_e.nom = '' or pop_e.domaine = '' then pop_e.propre
        when pop_e.domaine in ('gmail.com', 'googlemail.com') then coalesce(nullif(replace(pop_e.court, '.', ''), ''), pop_e.court) || '@gmail.com'
        else pop_e.court || '@' || pop_e.domaine end
      from (select pop_n.propre, pop_n.nom, pop_n.domaine, regexp_replace(pop_n.nom, '^(.[^+]*)\\+.*$', '\\1') as court
        from (select pop_m.propre, substring(pop_m.propre from '^(.*)@[^@]*$') as nom, substring(pop_m.propre from '@([^@]*)$') as domaine
          from (select lower(regexp_replace(${email}, '^\\s+|\\s+$', '', 'g')) as propre) pop_m) pop_n) pop_e)`;
}

/** Ce que la règle sait d’un appel (ou d’un achat), en SQL : des paramètres, ou des colonnes de la requête qui la porte. */
type QuiEnSQL = {
  /** Sa conv (un uuid), ou null. */
  conv: SQL;
  /** Son compte quand il n’a pas de conv (le compte connecté, l’acheteur), ou null. */
  compte: SQL;
  /** L’instant où elle se juge : la fin de l’appel (now()), l’heure de la ligne (le rattrapage), celle du paiement. */
  instant: SQL;
  /**
   * Ni conv ni compte : un visiteur sans compte (« prospect »), rien qui le dise (« inconnu »), l’achat d’un compte
   * effacé depuis (« client ») ; ou une expression SQL, quand le rattrapage en décide ligne par ligne.
   */
  sansRien: Extract<Population, "prospect" | "inconnu" | "client"> | SQL;
};

/** La règle « qui est qui » (en tête du fichier), en SQL : la population de cet appel (POPULATIONS), jamais vide. */
function populationEnSQL({ conv, compte, instant, sansRien }: QuiEnSQL): SQL {
  const email = emailCanoniqueEnSQL(sql`pop_u.email`);
  const rien = typeof sansRien === "string" ? sql`${sansRien}` : sansRien;
  return sql`(select case
        when pop_q.conv is not null and pop_s.id is null then 'inconnu'
        when pop_s.tournage_id is not null or pop_s.tournage_le is not null or exists (select 1 from tournages pop_t where pop_t.story_id = pop_s.id) then 'tournage'
        when pop_u.id is null and pop_s.id is not null then 'prospect'
        when pop_u.id is null and pop_q.compte is not null then 'inconnu'
        when pop_u.id is null then coalesce((${rien})::text, 'inconnu')
        when ${email} = ${emailCanonique(COMPTE_DU_TOURNAGE)} then 'tournage'
        when ${parmi(email, equipe())} then 'equipe'
        when exists (select 1 from stories pop_p where pop_p.user_id = pop_u.id and (pop_p.tournage_id is not null or pop_p.tournage_le is not null)
          and coalesce(pop_p.tournage_le, pop_p.created_at) <= pop_q.instant) then 'tournage'
        when ${parmi(sql`lower(pop_u.email)`, invites())} then 'offert'
        when exists (select 1 from achats pop_a where pop_a.user_id = pop_u.id and pop_a.paye_le <= pop_q.instant) then 'client'
        else 'prospect' end
      from (select ${conv}::uuid as conv, ${compte}::uuid as compte, ${instant}::timestamptz as instant) pop_q
      left join stories pop_s on pop_s.id = pop_q.conv
      left join users pop_u on pop_u.id = coalesce(pop_s.user_id, pop_q.compte))`;
}

/**
 * L’appel se juge sans compte (ai_usage.sans_compte), en SQL : ni sa conv ni `compte` n’en donnent un (un brouillon,
 * une lecture d’avant l’email, rien). Rien d’autre ne s’en garde : pas l’identifiant du compte.
 */
function sansCompteEnSQL({ conv, compte }: Pick<QuiEnSQL, "conv" | "compte">): SQL {
  return sql`(select pop_u.id is null from (select ${conv}::uuid as conv, ${compte}::uuid as compte) pop_q
      left join stories pop_s on pop_s.id = pop_q.conv
      left join users pop_u on pop_u.id = coalesce(pop_s.user_id, pop_q.compte))`;
}

/**
 * Qui a fait l’appel qu’on note (noterCout) : sa conv, sinon le compte connecté (des captures lues avant l’import), sinon
 * son envoi (la même lecture, sans compte : un prospect), sinon personne (« inconnu »), jugé à la fin de l’appel. Deux
 * expressions à mettre dans l’insert : la population, et s’il s’est jugé sans compte.
 */
export function quiAFaitLAppel({ storyId, compte, envoi }: { storyId?: string | null; compte?: { id: string } | null; envoi?: string | null }): {
  population: SQL;
  sansCompte: SQL;
} {
  const qui = { conv: storyId ? sql`${storyId}` : sql`null`, compte: compte ? sql`${compte.id}` : sql`null`, instant: sql`now()` };
  return { population: populationEnSQL({ ...qui, sansRien: envoi ? "prospect" : "inconnu" }), sansCompte: sansCompteEnSQL(qui) };
}

/**
 * Les étiquettes des lectures d’avant l’import (src/server/captures.ts : des captures, les lots d’une vidéo ; « 01 »,
 * celle d’avant les étiquettes) : faites avant l’email, chez un visiteur qui importe. Une ligne de ces lectures que rien
 * ne rattache (d’avant la mesure des imports du 26 octobre, #142 : ni conv ni envoi) est d’un prospect, le coût
 * d’acquisition du produit, comme le veut l’audit des coûts (1.3) ; un essai de l’équipe sans compte peut s’y glisser.
 */
const LECTURES_D_AVANT_L_IMPORT = ["captures", "captures_video", "01"];

/*
 * Le rattrapage se fait par paquets : d’abord les identifiants à ranger (une requête légère, par un index), puis la règle
 * sur ce paquet seul. Le coût estimé d’une requête reste ainsi borné (la règle sur PAR_PAQUET lignes, loin du seuil de la
 * compilation JIT de Postgres, 100 000), même quand il ne reste rien à ranger ou que la table grandit.
 */
const PAR_PAQUET = 250;
/** Combien de paquets un passage range au plus : 5 000 lignes, l’historique se rattrape en quelques passages. */
const PAQUETS_PAR_PASSAGE = 20;
/**
 * Combien d’heures une lecture faite sans compte attend le compte de sa conv : rattachée dès l’email, ou effacée au bout
 * de 24 h (la purge des brouillons, src/server/purge.ts).
 */
const SANS_COMPTE_ATTEND_H = 48;

/**
 * Range par paquets ce que `aRanger` désigne (une requête qui rend au plus `limite` identifiants, sous `id`) avec
 * `ranger` (une requête qui range ces identifiants, `ids` : la liste à mettre dans un `in`). Une ligne rangée sort de
 * `aRanger` : le paquet suivant en prend d’autres. Rend le nombre de lignes rangées.
 */
async function parPaquets(aRanger: (limite: number) => SQL, ranger: (ids: SQL) => SQL): Promise<number> {
  let rangees = 0;
  for (let i = 0; i < PAQUETS_PAR_PASSAGE; i++) {
    const ids = (await db().execute<{ id: string | number }>(aRanger(PAR_PAQUET))).rows.map((r) => r.id);
    if (!ids.length) break;
    const liste = sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    );
    rangees += (await db().execute(ranger(sql`(${liste})`))).rowCount ?? 0;
    if (ids.length < PAR_PAQUET) break;
  }
  return rangees;
}

/**
 * Ce que le rattrapage a rangé : des lignes d’ai_usage (`couts` : d’avant la règle, écrites par la version d’avant pendant
 * une mise en ligne, ou laissées sans population par un repli de noterCout ; puis les lectures sans compte dont la conv a
 * trouvé un compte), et des achats payés (`achats` : d’avant la règle, ou dont la population n’a pas pu se poser à la
 * livraison).
 */
export type Rangement = { couts: number; achats: number };

/**
 * Le rattrapage, à chaque passage des 5 minutes (GET /api/cron/relances) : se rejoue sans risque, et ne touche que ce
 * qui doit changer. D’abord les lignes d’ai_usage pas encore rangées, 5 000 au plus, chacune à son heure : par sa conv
 * (story_id), sinon par l’import de son envoi (imports, la conv qu’il a donnée) ; sans conv retrouvée, une lecture
 * d’avant l’import (un envoi, ou l’étiquette d’une de ces lectures : LECTURES_D_AVANT_L_IMPORT) est d’un prospect, sans
 * compte (une conv trouvée plus tard la reprendra), le reste « inconnu ». Puis les lectures faites sans compte des deux
 * derniers jours dont la conv a trouvé un compte : elles prennent sa population, à leur heure, une fois. Enfin les achats
 * payés pas encore rangés, chacun à l’heure de son paiement (un compte effacé depuis : un client).
 */
export async function rangerLesCouts(): Promise<Rangement> {
  const conv = sql`coalesce(x.story_id, (select i.story_id from imports i where i.envoi = x.envoi))`;
  const qui = { conv, compte: sql`null`, instant: sql`x.created_at` };
  const avantLImport = sql`case when x.envoi is not null or x.task in (${sql.join(
    LECTURES_D_AVANT_L_IMPORT.map((t) => sql`${t}`),
    sql`, `,
  )}) then 'prospect' else 'inconnu' end`;
  const rangerParLaRegle = (ids: SQL, ou: SQL) =>
    sql`update ai_usage x set population = ${populationEnSQL({ ...qui, sansRien: avantLImport })}, sans_compte = ${sansCompteEnSQL(qui)}
        where x.id in ${ids} and ${ou}`;
  const pasRangees = await parPaquets(
    (limite) => sql`select id from ai_usage where population is null order by id limit ${limite}`,
    (ids) => rangerParLaRegle(ids, sql`x.population is null`),
  );
  const sansCompte = await parPaquets(
    (limite) => sql`select x.id from ai_usage x where x.sans_compte and x.created_at > now() - make_interval(hours => ${SANS_COMPTE_ATTEND_H})
        and exists (select 1 from stories s where s.id = ${conv} and s.user_id is not null) order by x.id limit ${limite}`,
    (ids) => rangerParLaRegle(ids, sql`x.sans_compte`),
  );
  const achats = await parPaquets(
    (limite) => sql`select id from achats where population is null and paye_le is not null order by paye_le limit ${limite}`,
    (ids) => rangerLesAchatsSQL(ids),
  );
  return { couts: pasRangees + sansCompte, achats };
}

/** La règle sur ces achats payés pas encore rangés (`ids` : une liste pour un `in`) : leur acheteur à l’heure de son paiement. */
const rangerLesAchatsSQL = (ids: SQL) =>
  sql`update achats a0 set population = ${populationEnSQL({ conv: sql`null`, compte: sql`a0.user_id`, instant: sql`a0.paye_le`, sansRien: "client" })}
      where a0.id in ${ids} and a0.population is null and a0.paye_le is not null`;

/**
 * Range cet achat qui vient d’être livré (src/server/achats.ts, livrer) : son acheteur, à l’heure de son paiement, par la
 * règle. Après la transaction de la livraison, jamais dedans : la règle ne doit pas pouvoir faire échouer un paiement.
 * En échec, le passage des 5 minutes le range (rangerLesCouts).
 */
export async function rangerLAchat(achatId: string): Promise<void> {
  await db().execute(rangerLesAchatsSQL(sql`(${achatId})`));
}
