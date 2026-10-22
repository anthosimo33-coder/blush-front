import { erreur, repondre, route } from "@/server/http";
import { cleDeLApi, etatDuTournage } from "@/server/tournage";

/* Une lecture en plan repart après la réponse (etatDuTournage) : la fonction vit le temps de l’enchaîner */
export const maxDuration = 800;

/**
 * Où en est une conv de tournage, pour l’outil des créatrices (sa clé, sinon 401 « interdit ») : sa lecture, et son
 * lien une fois prête. Relue toutes les quelques secondes pendant la lecture, elle la fait repartir si un relais s’est
 * perdu. Aucune de cet id : 404 « introuvable ».
 */
export const GET = route("GET /api/admin/tournage/[id]", async (req: Request, { params }: RouteContext<"/api/admin/tournage/[id]">) => {
  if (!cleDeLApi(req)) return erreur("interdit");
  const etat = await etatDuTournage((await params).id);
  return etat ? repondre("GET /api/admin/tournage/[id]", etat) : erreur("introuvable");
});
