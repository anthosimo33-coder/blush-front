import { echangerJeton } from "@/server/captcha";
import { repondre, route } from "@/server/http";
import { garde } from "@/server/requete";

/**
 * Le laissez-passer du CAPTCHA : le jeton du widget (dans l’en-tête x-blush-captcha), vérifié par Cloudflare, contre un
 * cookie qui ouvre un import sans compte (src/server/captcha.ts). Le navigateur l’appelle avant chaque import, pendant
 * qu’il prépare ses fichiers. Un compte connecté, ou un serveur sans CAPTCHA : `{ ok: true }`, sans rien vérifier.
 */
export const POST = route("POST /api/captcha", async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const refus = await echangerJeton(req);
  if (refus) return refus;
  return repondre("POST /api/captcha", { ok: true });
});
