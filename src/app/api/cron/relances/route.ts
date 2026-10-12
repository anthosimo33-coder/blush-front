import { empreinte, memeEmpreinte } from "@/server/chiffrement";
import { env } from "@/server/env";
import { erreur, repondre, route } from "@/server/http";
import { envoyerLesRelances } from "@/server/relances";

/**
 * Les relances par mail (« Ta suite t’attend », src/server/relances.ts), appelées toutes les 15 minutes par la veille de
 * GitHub (.github/workflows/veille.yml) avec le secret CRON_SECRET, comparé à temps constant comme pour la purge. Elle
 * ne répond que des nombres : les logs de la veille, qui les écrivent, sont publics. Rien à faire : 200, avec des zéros.
 */
export const GET = route("GET /api/cron/relances", async (req: Request) => {
  const secret = env().CRON_SECRET;
  if (!secret || !memeEmpreinte(req.headers.get("authorization") ?? "", empreinte(`Bearer ${secret}`))) return erreur("interdit");
  return repondre("GET /api/cron/relances", await envoyerLesRelances());
});
