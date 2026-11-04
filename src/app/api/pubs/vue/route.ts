import { erreur, lireCorps, repondre, route } from "@/server/http";
import { LIMITES } from "@/server/limites";
import { signalerVueAMeta } from "@/server/pubs-meta";
import { garde } from "@/server/requete";
import { ROUTES } from "@/types/api";

/**
 * La page où l’on vient d’accepter les pubs (src/components/shell/BandeauPubs.tsx), chez Meta (une page vue) : souvent
 * celle d’arrivée d’une pub, dont le premier signe est parti avant l’accord. Sans accord, rien ne part. Toujours
 * `{ ok: true }`.
 */
export const POST = route("POST /api/pubs/vue", async (req: Request) => {
  const g = await garde(req, { session: "aucune", limite: { ip: "pubs-vue", limite: LIMITES.vuesPubsParIp } });
  if (g instanceof Response) return g;
  if (!(await lireCorps(req, ROUTES["POST /api/pubs/vue"].corps))) return erreur("invalide");
  await signalerVueAMeta(req, null);
  return repondre("POST /api/pubs/vue", { ok: true });
});
