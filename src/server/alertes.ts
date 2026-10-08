import "server-only";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { env } from "./env";
import { LIMITES, sousLaLimite } from "./limites";
import { statsVocal } from "./vocal";

/*
 * Les alertes de l’équipe, par mail (BLUSH_ALERTES) : un échec définitif, et chaque nuit le résumé de la veille.
 * Jamais de contenu : des codes d’erreur, des identifiants, des comptes et des coûts.
 */

async function envoyer(sujet: string, lignes: string[]): Promise<void> {
  const { BLUSH_ALERTES, RESEND_API_KEY, BLUSH_EMAIL_FROM } = env();
  if (!BLUSH_ALERTES) return;
  if (!RESEND_API_KEY) {
    console.log(`[dev] alerte : ${sujet}\n${lignes.join("\n")}`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: BLUSH_EMAIL_FROM, to: BLUSH_ALERTES.split(",").map((e) => e.trim()), subject: sujet, text: lignes.join("\n") }),
  });
  if (!r.ok) console.error(`alerte non envoyée : Resend ${r.status}`);
}

/** Quelque chose a échoué pour de bon. Une alerte ne fait jamais échouer ce qui l’appelle, et pas plus de 30 par jour. */
export async function alerter(sujet: string, lignes: string[]): Promise<void> {
  try {
    if (!(await sousLaLimite("alertes", LIMITES.alertesParJour))) return;
    await envoyer(`BLUSH · ${sujet}`, [...lignes, "", `${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} (heure de Paris)`]);
  } catch (e) {
    console.error("alerte non envoyée", (e as Error).message);
  }
}

const dollars = (micros: number) => `${(micros / 1e6).toFixed(2)} $`;
const part = (n: number, sur: number) => (sur ? `${Math.round((n / sur) * 100)} %` : "–");

/** Le résumé des dernières 24 heures (appelé par la tâche de nuit). Rien ne s’envoie s’il ne s’est rien passé. */
export async function resumerLaVeille(maintenant = new Date()): Promise<void> {
  try {
    const depuis = new Date(maintenant.getTime() - 86400e3);
    const nb = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
    const taches = (genre: string, statut: string) =>
      nb(db().select({ n: count() }).from(schema.tasks).where(and(eq(schema.tasks.kind, genre), eq(schema.tasks.status, statut), gte(schema.tasks.updatedAt, depuis))));
    const [histoires, verdicts, rapports, memoires, messages, echecs, attente] = await Promise.all([
      nb(db().select({ n: count() }).from(schema.stories).where(gte(schema.stories.createdAt, depuis))),
      taches("verdict", "fini"),
      taches("rapport_chapitres", "fini"),
      taches("memoire", "fini"),
      nb(db().select({ n: count() }).from(schema.chatMessages).where(and(eq(schema.chatMessages.role, "toi"), gte(schema.chatMessages.createdAt, depuis)))),
      nb(db().select({ n: count() }).from(schema.tasks).where(and(eq(schema.tasks.status, "echec"), gte(schema.tasks.updatedAt, depuis)))),
      nb(db().select({ n: count() }).from(schema.waitlist).where(gte(schema.waitlist.createdAt, depuis))),
    ]);
    const couts = await db()
      .select({ tache: schema.aiUsage.task, micros: sql<number>`sum(${schema.aiUsage.costMicros})::int`, appels: count() })
      .from(schema.aiUsage)
      .where(gte(schema.aiUsage.createdAt, depuis))
      .groupBy(schema.aiUsage.task);
    const total = couts.reduce((s, c) => s + (c.micros ?? 0), 0);
    const voix = await statsVocal();
    if (!histoires && !messages && !couts.length && !attente && !echecs) return;
    await envoyer(`BLUSH · la veille : ${histoires} import${histoires > 1 ? "s" : ""}, ${dollars(total)}`, [
      `Imports : ${histoires}`,
      `Verdicts : ${verdicts} · rapports : ${rapports} · mémoires : ${memoires}`,
      `Messages au chat : ${messages}`,
      `Échecs définitifs : ${echecs}`,
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
                `  Voix ${v.voix} (${v.voix === "A" ? "E2" : "L2, Harmonie"}) : ${v.vocaux} vocaux, ${v.ecoutes} écoutés, ${v.finis} jusqu’au bout (${part(v.finis, v.ecoutes)}), ${v.reecoutes} réécoutés${v.jusqua == null ? "" : `, écoutés en moyenne à ${Math.round(v.jusqua * 100)} %`}`,
            ),
          ]
        : []),
    ]);
  } catch (e) {
    console.error("résumé non envoyé", (e as Error).message);
  }
}
