import "server-only";
import { and, count, eq, gte, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { envoyerALEquipe } from "./alertes";
import { db, schema } from "./db";
import type { Genre, StatutTache } from "./db/enums";
import { NOMS_VOIX } from "./ia/voix";
import { journalErreur } from "./journal";
import { statsVocal } from "./vocal";

/*
 * Le résumé de la veille, chaque nuit, pour l’équipe (la route de la purge, src/app/api/cron/purge) : les imports, les
 * lectures, le chat, les échecs, le coût de l’IA et l’A/B test des voix. Hors de src/server/alertes.ts, qui n’a plus à
 * lire la voix ni les vocaux : la voix alerte (src/server/ia/voix.ts), et le budget aussi, sans boucler sur eux.
 */

/* Ce qu’un budget arrête (tasks.error) : ça repart après minuit, ce n’est pas un échec définitif (src/server/pipeline.ts) */
const ARRETS_DU_BUDGET = ["budget", "voix_budget"];

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
              budget ? inArray(schema.tasks.error, ARRETS_DU_BUDGET) : or(isNull(schema.tasks.error), notInArray(schema.tasks.error, ARRETS_DU_BUDGET)),
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
    const couts = await db()
      .select({ tache: schema.aiUsage.task, micros: sql<number>`sum(${schema.aiUsage.costMicros})::int`, appels: count() })
      .from(schema.aiUsage)
      .where(gte(schema.aiUsage.createdAt, depuis))
      .groupBy(schema.aiUsage.task);
    const total = couts.reduce((s, c) => s + (c.micros ?? 0), 0);
    const voix = await statsVocal();
    if (!histoires && !messages && !couts.length && !attente && !echecs && !arretees) return;
    /* typo : du code. Un mail à l’équipe seule, comme une alerte : ni l’appli ni un mail à une personne ne l’affichent */
    await envoyerALEquipe(`BLUSH · la veille : ${histoires} import${histoires > 1 ? "s" : ""}, ${dollars(total)}`, [
      `Imports : ${histoires}`,
      `Verdicts : ${verdicts} · rapports : ${rapports} · mémoires : ${memoires}`,
      `Messages au chat : ${messages}`,
      `Échecs définitifs : ${echecs}`,
      ...(arretees ? [`Arrêtées par le budget de l’IA ou de la voix (elles repartent après minuit) : ${arretees}`] : []),
      `Nouveaux sur la liste d’attente : ${attente}`,
      "",
      `Coût de l’IA : ${dollars(total)}`,
      ...couts.sort((a, b) => (b.micros ?? 0) - (a.micros ?? 0)).map((c) => `  ${c.tache} : ${dollars(c.micros ?? 0)} (${c.appels} appel${c.appels > 1 ? "s" : ""})`),
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
