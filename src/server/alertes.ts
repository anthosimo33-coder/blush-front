import "server-only";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "./db";
import type { Genre, StatutTache } from "./db/enums";
import { env } from "./env";
import { envoyerMail } from "./email";
import { journal, journalErreur } from "./journal";
import { LIMITES, limiteAtteinte, sousLaLimite } from "./limites";
import { statsVocal } from "./vocal";
import { NOMS_VOIX } from "./ia/voix";

/*
 * Les alertes de l’équipe, par mail (BLUSH_ALERTES) : un échec définitif, et chaque nuit le résumé de la veille.
 * Jamais de contenu : des codes d’erreur, des identifiants, des comptes et des coûts.
 */

/* Une alerte part par le même chemin que tous les mails (src/server/email.ts) : un refus du prestataire la fait rejeter */
async function envoyer(sujet: string, lignes: string[]): Promise<void> {
  const { BLUSH_ALERTES, RESEND_API_KEY } = env();
  if (!BLUSH_ALERTES.length) return;
  if (!RESEND_API_KEY) {
    /* En local : l’alerte s’écrit dans le terminal du serveur de dev, en clair, pour qu’on la lise */
    console.log(`[dev] alerte : ${sujet}\n${lignes.join("\n")}`);
    return;
  }
  /* Dans le quota du prestataire, une alerte passe avant la liste d’attente, après les rapports (QUOTA_MAILS) */
  await envoyerMail(BLUSH_ALERTES, { sujet, texte: lignes.join("\n") }, { sorte: "alerte" });
}

/*
 * Le budget des alertes (S-19). Une seule clé pour toutes (30 par jour) s’épuisait sur un seul sujet : une rafale de
 * replis du modèle, et l’échec d’un rapport ou le budget de l’IA atteint ne partaient plus. Chaque sujet a donc sa part
 * du jour (LIMITES.alertesParSujet), et les dernières alertes du jour sont gardées pour les importantes
 * (LIMITES.alertesParJour.reserveImportantes).
 */

/** Une alerte de plus pour ce sujet, aujourd’hui, peut-elle partir ? Compte son passage si oui. */
async function dansLeBudget(sujet: string, importante: boolean): Promise<boolean> {
  const { reserveImportantes, ...jour } = LIMITES.alertesParJour;
  /* Une alerte ordinaire ne touche pas à la réserve : elle regarde sans compter, puis compte */
  if (!importante && (await limiteAtteinte("alertes", { ...jour, max: jour.max - reserveImportantes }))) return false;
  if (!(await sousLaLimite(`alertes:sujet:${sujet}`, LIMITES.alertesParSujet))) return false;
  return sousLaLimite("alertes", jour);
}

/**
 * Quelque chose a échoué pour de bon. Une alerte ne fait jamais échouer ce qui l’appelle. Pas plus de 5 par sujet et 30
 * en tout par jour, dont les 10 dernières pour les `importante` : ce qui touche tout le monde (le budget de l’IA) ou ce
 * qu’on a promis (une lecture, un rapport, la mémoire du chat en échec, src/server/pipeline.ts).
 */
export async function alerter(sujet: string, lignes: string[], { importante = false }: { importante?: boolean } = {}): Promise<void> {
  try {
    if (!(await dansLeBudget(sujet, importante))) {
      journal("alerte retenue", { sujet }, "alerte");
      return;
    }
    await envoyer(`BLUSH · ${sujet}`, [...lignes, "", `${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} (heure de Paris)`]);
  } catch (e) {
    journalErreur("alerte non envoyée", e, { sujet });
  }
}

const dollars = (micros: number) => `${(micros / 1e6).toFixed(2)} $`;
const part = (n: number, sur: number) => (sur ? `${Math.round((n / sur) * 100)} %` : "–");

/** Le résumé des dernières 24 heures (appelé par la tâche de nuit). Rien ne s’envoie s’il ne s’est rien passé. */
export async function resumerLaVeille(maintenant = new Date()): Promise<void> {
  try {
    const depuis = new Date(maintenant.getTime() - 86400e3);
    const nb = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
    const taches = (genre: Genre, statut: StatutTache) =>
      nb(db().select({ n: count() }).from(schema.tasks).where(and(eq(schema.tasks.kind, genre), eq(schema.tasks.status, statut), gte(schema.tasks.updatedAt, depuis))));
    /* Une étape arrêtée par le budget de l’IA (tasks.error « budget ») n’a pas échoué pour de bon : elle repart après minuit */
    const echecsDe = (budget: boolean) =>
      nb(
        db()
          .select({ n: count() })
          .from(schema.tasks)
          .where(and(eq(schema.tasks.status, "echec"), gte(schema.tasks.updatedAt, depuis), budget ? eq(schema.tasks.error, "budget") : sql`${schema.tasks.error} is distinct from 'budget'`)),
      );
    const [histoires, verdicts, rapports, memoires, messages, echecs, arretees, attente] = await Promise.all([
      nb(db().select({ n: count() }).from(schema.stories).where(gte(schema.stories.createdAt, depuis))),
      taches("verdict", "fini"),
      taches("rapport_chapitres", "fini"),
      taches("memoire", "fini"),
      nb(db().select({ n: count() }).from(schema.chatMessages).where(and(eq(schema.chatMessages.role, "toi"), gte(schema.chatMessages.createdAt, depuis)))),
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
    await envoyer(`BLUSH · la veille : ${histoires} import${histoires > 1 ? "s" : ""}, ${dollars(total)}`, [
      `Imports : ${histoires}`,
      `Verdicts : ${verdicts} · rapports : ${rapports} · mémoires : ${memoires}`,
      `Messages au chat : ${messages}`,
      `Échecs définitifs : ${echecs}`,
      ...(arretees ? [`Arrêtées par le budget de l’IA (elles repartent après minuit) : ${arretees}`] : []),
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
