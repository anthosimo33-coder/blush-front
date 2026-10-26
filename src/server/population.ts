import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { POPULATIONS_DU_PRODUIT } from "@/types";
import { COMPTE_DU_TOURNAGE } from "./compte-du-tournage";
import { db } from "./db";
import { emailCanonique } from "./email-canonique";
import { env } from "./env";

/*
 * Qui est qui : la seule règle qui dit pour qui l’IA a été payée, appel par appel (ai_usage.population). /admin, le
 * serveur MCP et le résumé de la nuit en tirent l’IA des tests (l’équipe et le tournage), celle du produit (les clients
 * et les prospects) et la marge produit ; le budget du jour (src/server/budget.ts), lui, garde le total réel : il
 * protège la facture. La première qui convient, dans l’ordre :
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
 * Elle s’écrit une fois, en SQL (populationEnSQL), et sert partout de la même façon : à la note de chaque appel, dans
 * l’insert même, après la réponse (noterCout, src/server/ia/usage.ts : aucun aller-retour de plus, et une règle en échec
 * note « inconnu » au lieu de perdre la ligne) ; au rattrapage des lignes d’avant elle (rangerLesCouts, à chaque passage
 * des 5 minutes) ; dans /admin pour les ventes (l’acheteur au moment de payer) et pour les verdicts et les rapports des
 * ratios (leur conv, à leur heure) : la même population en haut et en bas de chaque ratio. Une population est jugée à un
 * instant et ne bouge plus : un prospect qui achète garde ses appels d’avant en prospect (le produit, toujours), un
 * compte effacé laisse sa population à ses lignes, sans identifiant. Seule exception : une lecture faite sans compte prend
 * celle du compte que sa conv trouve dans les deux jours (l’équipe qui essaie l’import sans être connectée). Les listes de
 * l’équipe et des invités viennent des variables d’environnement, lues à chaque calcul : la règle ne peut pas vivre dans
 * un rattrapage de scripts/base.mjs, qui tourne au build.
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

/** Cette population (une expression SQL : une colonne, populationEnSQL) est celle du produit : un client ou un prospect. */
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

/** Ce que la règle sait d’un appel (ou d’un achat, d’un verdict), en SQL : des paramètres, ou des colonnes de la requête qui la porte. */
export type QuiEnSQL = {
  /** Sa conv (un uuid), ou null. */
  conv: SQL;
  /** Son compte quand il n’a pas de conv (le compte connecté, l’acheteur), ou null. */
  compte: SQL;
  /** L’instant où elle se juge : la fin de l’appel (now()), l’heure de la ligne (le rattrapage), du paiement, du verdict. */
  instant: SQL;
  /** Ni conv ni compte : un visiteur sans compte (« prospect ») ou rien qui le dise (« inconnu »). */
  sansRien: "prospect" | "inconnu";
};

/** La règle « qui est qui » (en tête du fichier), en SQL : la population de cet appel (POPULATIONS). */
export function populationEnSQL({ conv, compte, instant, sansRien }: QuiEnSQL): SQL {
  const email = emailCanoniqueEnSQL(sql`pop_u.email`);
  return sql`(select case
        when pop_q.conv is not null and pop_s.id is null then 'inconnu'
        when pop_s.tournage_id is not null or pop_s.tournage_le is not null or exists (select 1 from tournages pop_t where pop_t.story_id = pop_s.id) then 'tournage'
        when pop_u.id is null and pop_s.id is not null then 'prospect'
        when pop_u.id is null and pop_q.compte is not null then 'inconnu'
        when pop_u.id is null then ${sansRien}::text
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

/** Le compte de cet appel, en SQL : celui de sa conv, sinon `compte` s’il existe encore, sinon null. */
function compteEnSQL({ conv, compte }: Pick<QuiEnSQL, "conv" | "compte">): SQL {
  return sql`(select pop_u.id from (select ${conv}::uuid as conv, ${compte}::uuid as compte) pop_q
      left join stories pop_s on pop_s.id = pop_q.conv
      left join users pop_u on pop_u.id = coalesce(pop_s.user_id, pop_q.compte))`;
}

/**
 * Qui a fait l’appel qu’on note (noterCout) : sa conv, sinon le compte connecté (des captures lues avant l’import), sinon
 * son envoi (la même lecture, sans compte : un prospect), sinon personne (« inconnu »), jugé à la fin de l’appel. Deux
 * expressions à mettre dans l’insert : la population et le compte.
 */
export function quiAFaitLAppel({ storyId, compte, envoi }: { storyId?: string | null; compte?: { id: string } | null; envoi?: string | null }): { population: SQL; userId: SQL } {
  const qui = { conv: storyId ? sql`${storyId}` : sql`null`, compte: compte ? sql`${compte.id}` : sql`null`, instant: sql`now()` };
  return { population: populationEnSQL({ ...qui, sansRien: envoi ? "prospect" : "inconnu" }), userId: compteEnSQL(qui) };
}

/** Combien de lignes pas encore rangées un passage range au plus : l’historique se rattrape en quelques passages. */
const LIGNES_PAR_PASSAGE = 5000;
/**
 * Combien d’heures une lecture faite sans compte attend le compte de sa conv : rattachée dès l’email, ou effacée au bout
 * de 24 h (la purge des brouillons, src/server/purge.ts).
 */
const SANS_COMPTE_ATTEND_H = 48;

/**
 * Le rattrapage, à chaque passage des 5 minutes (GET /api/cron/relances) : se rejoue sans risque, et ne touche que ce
 * qui doit changer. D’abord les lignes pas encore rangées (d’avant la règle, ou écrites par la version d’avant pendant une
 * mise en ligne), 5 000 au plus, chacune à son heure : par sa conv (story_id), sinon par l’import de son envoi (imports,
 * la conv qu’il a donnée) ; sans conv retrouvée, « inconnu » (rien ne dit si ces captures étaient lues connecté). Puis
 * les lectures faites sans compte des deux derniers jours dont la conv a trouvé un compte : elles prennent sa population
 * (à leur heure) et son identifiant, une fois. Rend le nombre de lignes rangées.
 */
export async function rangerLesCouts(): Promise<number> {
  const conv = sql`coalesce(x.story_id, (select i.story_id from imports i where i.envoi = x.envoi))`;
  const qui = { conv, compte: sql`null`, instant: sql`x.created_at` };
  const pasRangees = await db().execute(
    sql`update ai_usage x set population = ${populationEnSQL({ ...qui, sansRien: "inconnu" })}, user_id = ${compteEnSQL(qui)}
        where x.id in (select id from ai_usage where population is null order by id limit ${LIGNES_PAR_PASSAGE})`,
  );
  const sansCompte = await db().execute(
    sql`update ai_usage x set population = ${populationEnSQL({ ...qui, sansRien: "prospect" })}, user_id = ${compteEnSQL(qui)}
        where x.population = 'prospect' and x.user_id is null and x.created_at > now() - make_interval(hours => ${SANS_COMPTE_ATTEND_H})
          and exists (select 1 from stories s where s.id = ${conv} and s.user_id is not null)`,
  );
  return (pasRangees.rowCount ?? 0) + (sansCompte.rowCount ?? 0);
}
