import { erreur, lireCorps, repondre } from "@/server/http";
import { garde, sousLaLimiteDuCompte } from "@/server/requete";
import { noterEcoute } from "@/server/vocal";
import { ROUTES } from "@/types/api";

/** Un moment de l’écoute du vocal (début, fin, réécoute, fermé avant la fin), pour comparer les deux voix. */
export async function POST(req: Request) {
  const g = await garde(req, { session: "requise", histoire: true });
  if (g instanceof Response) return g;
  const { utilisateur, story } = g;
  const ecoute = await lireCorps(req, ROUTES["POST /api/vocal/ecoute"].corps);
  if (!ecoute) return erreur("invalide");
  /* Les chiffres de l’A/B test des voix : quelques dizaines d’écoutes par jour suffisent, pas des milliers */
  if (!(await sousLaLimiteDuCompte(utilisateur, "ecoute"))) return repondre("POST /api/vocal/ecoute", { ok: true });
  await noterEcoute(story.id, ecoute.evenement, ecoute.position * 1000);
  return repondre("POST /api/vocal/ecoute", { ok: true });
}
