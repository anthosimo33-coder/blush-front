import { contexteRequete } from "@/server/donnees";
import { erreur, lireCorps, memeOrigine, repondre } from "@/server/http";
import { LIMITES, sousLaLimite } from "@/server/limites";
import { noterEcoute } from "@/server/vocal";
import { ROUTES } from "@/types/api";

/** Un moment de l’écoute du vocal (début, fin, réécoute, fermé avant la fin), pour comparer les deux voix. */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion");
  if (!story) return erreur("aucune");
  const ecoute = await lireCorps(req, ROUTES["POST /api/vocal/ecoute"].corps);
  if (!ecoute) return erreur("invalide");
  /* Les chiffres de l’A/B test des voix : quelques dizaines d’écoutes par jour suffisent, pas des milliers */
  if (!(await sousLaLimite(`ecoute:${utilisateur.id}`, LIMITES.ecouteParCompte))) return repondre("POST /api/vocal/ecoute", { ok: true });
  await noterEcoute(story.id, ecoute.evenement, ecoute.position * 1000);
  return repondre("POST /api/vocal/ecoute", { ok: true });
}
