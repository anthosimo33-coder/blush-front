import { retirer } from "@/server/attente";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { garde } from "@/server/requete";
import { ROUTES } from "@/types/api";

/** Se retirer de la liste d’attente, depuis le lien de son mail (signé : on ne peut retirer que son propre email). */
export const POST = route(async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const lien = await lireCorps(req, ROUTES["POST /api/attente/retrait"].corps);
  if (!lien || !(await retirer(lien.id, lien.cle))) return erreur("lien");
  return repondre("POST /api/attente/retrait", { ok: true });
});
