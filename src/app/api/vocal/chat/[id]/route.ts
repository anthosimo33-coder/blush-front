import { audioDuChat } from "@/server/vocal";
import { utilisateurCourant } from "@/server/donnees";
import { erreur, reponseAudio, route } from "@/server/http";

/** L’audio d’une réponse du chat dite en vocal, si elle est dans une conv de son compte (le compte seul : pas besoin de relire l’histoire). */
export const GET = route("GET /api/vocal/chat/[id]", async (req: Request, { params }: RouteContext<"/api/vocal/chat/[id]">) => {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) return erreur("connexion");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return erreur("introuvable");
  const audio = await audioDuChat(utilisateur.id, id);
  return audio ? reponseAudio(req, audio) : erreur("introuvable");
});
