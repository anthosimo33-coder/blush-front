import { empreinte, memeEmpreinte } from "@/server/chiffrement";
import { env } from "@/server/env";
import { erreur, repondre, route } from "@/server/http";
import { traiterLesLots } from "@/server/memoire-en-lot";
import { reprendreLesChainesEnPlan } from "@/server/pipeline";
import { envoyerLesRelances } from "@/server/relances";
import { envoyerLesSequences } from "@/server/sequences";
import { renommerLesPrises } from "@/server/tournage";

/**
 * Les relances par mail (« Ton rapport t’attend », src/server/relances.ts), puis les mails des séquences
 * (src/server/sequences.ts : `sequences`, ceux partis), appelées toutes les 5 minutes par Vercel Cron
 * (vercel.json), et en secours par la veille de GitHub (.github/workflows/veille.yml), avec le secret CRON_SECRET,
 * comparé à temps constant comme pour la purge. Chaque passage ne relance qu’une fois chaque compte : deux passages
 * proches ne font rien de plus. Et,
 * au même passage, les chaînes des tâches restées en plan, chacune reprise dans sa fonction (`chaines`, le filet du
 * relais), et les prises du mode tournage qui disent encore le prénom de la source (`prises`, renommerLesPrises). Les
 * lots de la mémoire passent avant les chaînes (traiterLesLots, src/server/memoire-en-lot.ts : relevés, puis les mises à
 * jour calmées envoyées ; `lotsEnvoyes`, `lotsLus`, `lotsAnnules`) : une mise à jour revenue de son lot en direct part par
 * son relais. Elle ne répond que des nombres : les logs de la veille, qui les écrivent, sont publics. Rien à faire : 200,
 * avec des zéros.
 */
export const GET = route("GET /api/cron/relances", async (req: Request) => {
  const secret = env().CRON_SECRET;
  if (!secret || !memeEmpreinte(req.headers.get("authorization") ?? "", empreinte(`Bearer ${secret}`))) return erreur("interdit");
  /* Les séquences après les relances : la relance d’abord, dans le plafond du jour qu’elles partagent */
  const mails = envoyerLesRelances().then(async (relances) => ({ relances, sequences: await envoyerLesSequences() }));
  const taches = traiterLesLots().then(async (lots) => ({ lots, chaines: await reprendreLesChainesEnPlan() }));
  const [{ relances, sequences }, { lots, chaines }, prises] = await Promise.all([mails, taches, renommerLesPrises()]);
  return repondre("GET /api/cron/relances", {
    ...relances,
    chaines,
    prises,
    sequences: sequences.envoyes,
    lotsEnvoyes: lots.envoyes,
    lotsLus: lots.lus,
    lotsAnnules: lots.annules,
  });
});
