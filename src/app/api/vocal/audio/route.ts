import { contexteRequete } from "@/server/donnees";
import { erreur, reponseAudio } from "@/server/http";
import { audioDe } from "@/server/vocal";

/** L’audio du vocal du rapport de l’histoire ouverte (MP3), déchiffré à la volée. */
export async function GET(req: Request) {
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (!story) return erreur("aucune", 404);
  const audio = await audioDe(story.id);
  if (!audio) return erreur("pas_pret", 404);
  return reponseAudio(req, audio);
}
