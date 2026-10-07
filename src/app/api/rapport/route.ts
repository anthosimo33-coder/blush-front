import { contexteRequete, rapportDe, relancer } from "@/server/donnees";
import { erreur, json } from "@/server/http";

export const maxDuration = 800;

/** Le rapport (ou le verdict seul, sans accès). `generating` : il s’écrit encore ; le front repasse dans quelques secondes. */
export async function GET() {
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (!story) return erreur("aucune", 404);
  await relancer(story.id);
  const rapport = await rapportDe(story, utilisateur);
  return rapport ? json(rapport) : erreur("pas_pret", 409);
}
