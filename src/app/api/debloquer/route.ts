import { offrirLeRapport } from "@/server/achats";
import { estEquipe } from "@/server/droits";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { relancerApres } from "@/server/pipeline";
import { garde } from "@/server/requete";
import { ROUTES } from "@/types/api";

export const maxDuration = 300;

/**
 * Débloquer le rapport de la conv ouverte, sans paiement : un compte de l’équipe (BLUSH_ACCES_LIBRE) se le livre,
 * gratuitement ; les autres reçoivent « bientot » (402) tant que le paiement n’est pas branché (POST /api/paiement le
 * remplacera). Le rapport, puis la mémoire, s’écrivent après la réponse.
 */
export const POST = route("POST /api/debloquer", async (req: Request) => {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  const { utilisateur, story } = g;
  /* Une formule qui n’existe pas : « offre » (laquelle, l’équipe ne paie pas : elle ne change rien) */
  if (!(await lireCorps(req, ROUTES["POST /api/debloquer"].corps))) return erreur("offre");
  if (!estEquipe(utilisateur)) return erreur("bientot");
  /* Le rapport s’il n’a jamais été lancé, ou la mémoire d’un rapport sobre déjà offert : ce qui manque part, une seule fois */
  if (story?.userId) {
    await offrirLeRapport({ id: story.id, userId: story.userId });
    relancerApres(story.id);
  }
  return repondre("POST /api/debloquer", { ok: true });
});
