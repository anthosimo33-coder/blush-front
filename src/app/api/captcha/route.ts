import { echangerJeton } from "@/server/captcha";
import { repondre, route } from "@/server/http";
import { planDemande } from "@/server/lecture-partielle";
import { garde } from "@/server/requete";

/**
 * Le laissez-passer du CAPTCHA : le jeton du widget (dans l’en-tête x-blush-captcha), vérifié par Cloudflare, contre un
 * cookie qui ouvre un import sans compte (src/server/captcha.ts). Le navigateur l’appelle avant chaque import, pendant
 * qu’il prépare ses fichiers. Un compte connecté, ou un serveur sans CAPTCHA : `{ ok: true }`, sans rien vérifier. Il
 * dit aussi au navigateur si une longue vidéo doit demander son plan avant sa lecture (`planDesVideos` : seulement dans
 * l’A/B de la lecture partielle, src/server/lecture-partielle.ts) : une réponse qu’il reçoit déjà, juste avant les lots.
 */
export const POST = route("POST /api/captcha", async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const refus = await echangerJeton(req);
  if (refus) return refus;
  return repondre("POST /api/captcha", { ok: true, planDesVideos: planDemande() });
});
