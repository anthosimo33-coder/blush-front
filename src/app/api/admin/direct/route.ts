import { direct } from "@/server/direct";
import { estAdmin } from "@/server/env";
import { erreur, repondre, route } from "@/server/http";
import { garde } from "@/server/requete";

/**
 * /admin en direct, à cet instant (src/server/direct.ts) : l’écran le relit toutes les 5 secondes. Réservé aux emails de
 * BLUSH_ADMINS : pour tous les autres, la route n’existe pas (404 « introuvable », comme la page).
 */
export const GET = route("GET /api/admin/direct", async (req: Request) => {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  if (!estAdmin(g.utilisateur.email)) return erreur("introuvable");
  return repondre("GET /api/admin/direct", await direct());
});
