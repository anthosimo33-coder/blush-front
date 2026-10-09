import { contexteRequete } from "@/server/donnees";
import { histoireOuverte } from "@/server/histoires";
import { erreur, reponseAudio } from "@/server/http";
import { audioDe } from "@/server/vocal";

/**
 * L’audio du vocal du rapport (MP3), déchiffré à la volée. L’adresse désigne sa conv (`conv`) : un lecteur audio
 * n’envoie pas d’en-tête, et l’audio reste en cache sous son adresse. Une ancienne adresse, sans `conv` : la conv ouverte.
 */
export async function GET(req: Request) {
  const conv = new URL(req.url).searchParams.get("conv");
  const { utilisateur, story: ouverte } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  const story = conv ? await histoireOuverte(utilisateur, { affichee: conv }) : ouverte;
  if (!story) return erreur("aucune", 404);
  const audio = await audioDe(story.id);
  if (!audio) return erreur("pas_pret", 404);
  return reponseAudio(req, audio);
}
