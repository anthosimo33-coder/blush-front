import { resumerLaVeille } from "@/server/veille";
import { empreinte, memeEmpreinte } from "@/server/chiffrement";
import { env } from "@/server/env";
import { erreur, repondre, route } from "@/server/http";
import { purger } from "@/server/purge";

/**
 * Appelée chaque nuit par Vercel Cron (vercel.json), avec le secret CRON_SECRET. Le secret se compare à temps constant
 * (leurs empreintes, memeEmpreinte) : le temps de la réponse ne dit pas combien de caractères étaient bons (S-35).
 */
export const GET = route("GET /api/cron/purge", async (req: Request) => {
  const secret = env().CRON_SECRET;
  if (!secret || !memeEmpreinte(req.headers.get("authorization") ?? "", empreinte(`Bearer ${secret}`))) return erreur("interdit");
  try {
    return repondre("GET /api/cron/purge", await purger());
  } finally {
    /* Et le résumé de la veille, pour l’équipe, même si la purge a planté : c’est lui qui le lui dit (il ne rejette jamais) */
    await resumerLaVeille();
  }
});
