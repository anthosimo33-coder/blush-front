import { contexteRequete } from "@/server/donnees";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { LIMITES, sousLaLimite } from "@/server/limites";
import { EVENEMENTS, noterEcoute, type Evenement } from "@/server/vocal";

/** Un moment de l’écoute du vocal (début, fin, réécoute, fermé avant la fin), pour comparer les deux voix. */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (!story) return erreur("aucune", 404);
  const { evenement, position } = await corps<{ evenement: string; position: number }>(req);
  if (!EVENEMENTS.includes(evenement as Evenement) || typeof position !== "number" || !Number.isFinite(position)) return erreur("invalide", 422);
  /* Les chiffres de l’A/B test des voix : quelques dizaines d’écoutes par jour suffisent, pas des milliers */
  if (!(await sousLaLimite(`ecoute:${utilisateur.id}`, LIMITES.ecouteParCompte))) return json({ ok: true });
  await noterEcoute(story.id, evenement as Evenement, position * 1000);
  return json({ ok: true });
}
