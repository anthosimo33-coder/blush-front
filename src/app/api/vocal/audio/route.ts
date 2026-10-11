import { utilisateurCourant } from "@/server/donnees";
import { erreur, reponseAudio, route } from "@/server/http";
import { contexte } from "@/server/requete";
import { audioDuCompte } from "@/server/vocal";

/**
 * L’audio du vocal du rapport (MP3), déchiffré à la volée. L’adresse désigne sa conv (`conv`) : un lecteur audio
 * n’envoie pas d’en-tête. Une ancienne adresse, sans `conv` : la conv ouverte. Safari le demande en deux fois (deux
 * octets, puis le reste) : chaque requête lit le compte, puis sa conv et son vocal en une seule requête, sans relire
 * l’histoire ni sa conv brute.
 */
export const GET = route("GET /api/vocal/audio", async (req: Request) => {
  const conv = new URL(req.url).searchParams.get("conv");
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) return erreur("connexion");
  const storyId = conv ?? (await contexte()).story?.id;
  const vocal = storyId ? await audioDuCompte(utilisateur.id, storyId) : null;
  if (!vocal) return erreur("aucune");
  if (!vocal.audio) return erreur("pas_pret");
  return reponseAudio(req, vocal.audio);
});
