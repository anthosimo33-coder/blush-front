import { erreur, repondre, route } from "@/server/http";
import { arreterTournage, cleDeLApi } from "@/server/tournage";

/**
 * Arrête une conv de tournage, pour l’outil des créatrices (sa clé, sinon 401 « interdit ») : son lien ne pose plus le
 * mode tournage. `arretee` faux : déjà arrêtée, ou aucune de cet id.
 */
export const POST = route("POST /api/admin/tournage/[id]/arreter", async (req: Request, { params }: RouteContext<"/api/admin/tournage/[id]/arreter">) => {
  if (!cleDeLApi(req)) return erreur("interdit");
  return repondre("POST /api/admin/tournage/[id]/arreter", { arretee: await arreterTournage((await params).id) });
});
