import { resumerLaVeille } from "@/server/alertes";
import { env } from "@/server/env";
import { erreur, repondre, route } from "@/server/http";
import { purger } from "@/server/purge";

/** Appelée chaque nuit par Vercel Cron (vercel.json), avec le secret CRON_SECRET. */
export const GET = route("GET /api/cron/purge", async (req: Request) => {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return erreur("interdit");
  const purge = await purger();
  /* Et le résumé de la veille, pour l’équipe */
  await resumerLaVeille();
  return repondre("GET /api/cron/purge", purge);
});
