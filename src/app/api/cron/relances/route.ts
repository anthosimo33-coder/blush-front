import { empreinte, memeEmpreinte } from "@/server/chiffrement";
import { env } from "@/server/env";
import { erreur, repondre, route } from "@/server/http";
import { reprendreLesChainesEnPlan } from "@/server/pipeline";
import { envoyerLesRelances } from "@/server/relances";
import { renommerLesPrises } from "@/server/tournage";

/**
 * Les relances par mail (« Ton rapport t’attend », src/server/relances.ts), appelées toutes les 5 minutes par Vercel Cron
 * (vercel.json), et en secours par la veille de GitHub (.github/workflows/veille.yml), avec le secret CRON_SECRET,
 * comparé à temps constant comme pour la purge. Chaque passage ne relance qu’une fois chaque compte : deux passages
 * proches ne font rien de plus. Et,
 * au même passage, les chaînes des tâches restées en plan, chacune reprise dans sa fonction (`chaines`, le filet du
 * relais), et les prises du mode tournage qui disent encore le prénom de la source (`prises`, renommerLesPrises). Elle ne
 * répond que des nombres : les logs de la veille, qui les écrivent, sont publics. Rien à faire : 200,
 * avec des zéros.
 */
export const GET = route("GET /api/cron/relances", async (req: Request) => {
  const secret = env().CRON_SECRET;
  if (!secret || !memeEmpreinte(req.headers.get("authorization") ?? "", empreinte(`Bearer ${secret}`))) return erreur("interdit");
  const [relances, chaines, prises] = await Promise.all([envoyerLesRelances(), reprendreLesChainesEnPlan(), renommerLesPrises()]);
  return repondre("GET /api/cron/relances", { ...relances, chaines, prises });
});
