import "server-only";
import { and, count, eq, gte, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { NOMS_DES_POPULATIONS } from "@/contenu/pilotage";
import { POPULATIONS, POPULATIONS_DES_TESTS, POPULATIONS_DU_PRODUIT, type Population } from "@/types";
import { envoyerALEquipe } from "./alertes";
import { db, schema } from "./db";
import { ARRETS_DU_BUDGET } from "./erreurs";
import type { Genre, StatutTache } from "./db/enums";
import { NOMS_VOIX } from "./ia/voix";
import { journalErreur } from "./journal";
import { statsVocal } from "./vocal";

/*
 * Le résumé de la veille, chaque nuit, pour l’équipe (la route de la purge, src/app/api/cron/purge) : les imports, les
 * lectures, le chat, les échecs, le coût de l’IA et l’A/B test des voix. Hors de src/server/alertes.ts, qui n’a plus à
 * lire la voix ni les vocaux : la voix alerte (src/server/ia/voix.ts), et le budget aussi, sans boucler sur eux. Le coût
 * de l’IA se lit comme dans /admin, par la règle « qui est qui » (ai_usage.population, src/server/population.ts) :
 * l’IA du produit (les clients et les prospects) et celle des tests (l’équipe et le tournage) à part, puis chaque
 * population et chaque étiquette (une ligne pas encore rangée compte « non classé »).
 */

const dollars = (micros: number) => `${(micros / 1e6).toFixed(2)} $`;
const part = (n: number, sur: number) => (sur ? `${Math.round((n / sur) * 100)} %` : "–");

/** Le résumé des dernières 24 heures (appelé par la tâche de nuit). Rien ne s’envoie s’il ne s’est rien passé. */
export async function resumerLaVeille(maintenant = new Date()): Promise<void> {
  try {
    const depuis = new Date(maintenant.getTime() - 86400e3);
    const nb = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
    const taches = (genre: Genre, statut: StatutTache) =>
      nb(
        db()
          .select({ n: count() })
          .from(schema.tasks)
          .where(and(eq(schema.tasks.kind, genre), eq(schema.tasks.status, statut), gte(schema.tasks.updatedAt, depuis))),
      );
    /* Une étape arrêtée par le budget de l’IA ou de la voix (ARRETS_DU_BUDGET) n’a pas échoué pour de bon : elle repart après minuit */
    const echecsDe = (budget: boolean) =>
      nb(
        db()
          .select({ n: count() })
          .from(schema.tasks)
          .where(
            and(
              eq(schema.tasks.status, "echec"),
              gte(schema.tasks.updatedAt, depuis),
              budget ? inArray(schema.tasks.error, [...ARRETS_DU_BUDGET]) : or(isNull(schema.tasks.error), notInArray(schema.tasks.error, [...ARRETS_DU_BUDGET])),
            ),
          ),
      );
    const [histoires, verdicts, rapports, memoires, messages, echecs, arretees, attente] = await Promise.all([
      nb(db().select({ n: count() }).from(schema.stories).where(gte(schema.stories.createdAt, depuis))),
      taches("verdict", "fini"),
      taches("rapport_chapitres", "fini"),
      taches("memoire", "fini"),
      nb(
        db()
          .select({ n: count() })
          .from(schema.chatMessages)
          .where(and(eq(schema.chatMessages.role, "toi"), gte(schema.chatMessages.createdAt, depuis))),
      ),
      echecsDe(false),
      echecsDe(true),
      nb(db().select({ n: count() }).from(schema.waitlist).where(gte(schema.waitlist.createdAt, depuis))),
    ]);
    const lignes = await db()
      .select({
        tache: schema.aiUsage.task,
        population: sql<Population>`coalesce(${schema.aiUsage.population}, 'inconnu')`,
        micros: sql<number>`sum(${schema.aiUsage.costMicros})::int`,
        appels: count(),
      })
      .from(schema.aiUsage)
      .where(gte(schema.aiUsage.createdAt, depuis))
      .groupBy(schema.aiUsage.task, schema.aiUsage.population);
    const microsDe = (qui: (p: Population) => boolean) => lignes.filter((l) => qui(l.population)).reduce((s, l) => s + (l.micros ?? 0), 0);
    const total = microsDe(() => true);
    const produit = microsDe((p) => (POPULATIONS_DU_PRODUIT as readonly Population[]).includes(p));
    const tests = microsDe((p) => (POPULATIONS_DES_TESTS as readonly Population[]).includes(p));
    /* Par étiquette, toutes populations réunies, avec la part du produit */
    const couts = [...new Set(lignes.map((l) => l.tache))].map((tache) => {
      const de = lignes.filter((l) => l.tache === tache);
      return {
        tache,
        micros: de.reduce((s, l) => s + (l.micros ?? 0), 0),
        appels: de.reduce((s, l) => s + l.appels, 0),
        produit: de.filter((l) => (POPULATIONS_DU_PRODUIT as readonly Population[]).includes(l.population)).reduce((s, l) => s + (l.micros ?? 0), 0),
      };
    });
    const voix = await statsVocal();
    if (!histoires && !messages && !couts.length && !attente && !echecs && !arretees) return;
    /* Un mail à l’équipe seule, comme une alerte : ni l’appli ni un mail à une personne ne l’affichent (HORS_DES_TEXTES de verifier-typo) */
    await envoyerALEquipe(`BLUSH · la veille : ${histoires} import${histoires > 1 ? "s" : ""}, ${dollars(total)} d’IA (${dollars(produit)} pour le produit)`, [
      `Imports : ${histoires}`,
      `Verdicts : ${verdicts} · rapports : ${rapports} · mémoires : ${memoires}`,
      `Messages au chat : ${messages}`,
      `Échecs définitifs : ${echecs}`,
      ...(arretees ? [`Arrêtées par le budget de l’IA ou de la voix (elles repartent après minuit) : ${arretees}`] : []),
      `Nouveaux sur la liste d’attente : ${attente}`,
      "",
      `Coût de l’IA : ${dollars(total)}`,
      `  IA du produit (les clients et les prospects) : ${dollars(produit)}`,
      `  IA des tests (l’équipe et le tournage) : ${dollars(tests)}`,
      ...POPULATIONS.map((p) => ({ p, micros: microsDe((q) => q === p) }))
        .filter(({ micros }) => micros > 0)
        .map(({ p, micros }) => `    ${NOMS_DES_POPULATIONS[p]} : ${dollars(micros)}`),
      ...couts
        .sort((a, b) => b.micros - a.micros)
        .map((c) => `  ${c.tache} : ${dollars(c.micros)} (${c.appels} appel${c.appels > 1 ? "s" : ""}), dont ${dollars(c.produit)} pour le produit`),
      ...(voix.length
        ? [
            "",
            "A/B test des voix du vocal, depuis le début :",
            ...voix.map(
              (v) =>
                `  Voix ${v.voix} (${NOMS_VOIX[v.voix]}) : ${v.vocaux} vocaux, ${v.ecoutes} écoutés, ${v.finis} jusqu’au bout (${part(v.finis, v.ecoutes)}), ${v.reecoutes} réécoutés${v.jusqua == null ? "" : `, écoutés en moyenne à ${Math.round(v.jusqua * 100)} %`}`,
            ),
          ]
        : []),
    ]);
  } catch (e) {
    journalErreur("résumé non envoyé", e);
  }
}
