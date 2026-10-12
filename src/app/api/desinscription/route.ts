import { erreur, lireCorps, repondre, route } from "@/server/http";
import { desinscrire } from "@/server/relances";
import { garde } from "@/server/requete";
import { ROUTES } from "@/types/api";

/** Couper les relances par mail de son compte, depuis le lien de la relance (signé : on ne désinscrit que son propre compte). */
export const POST = route("POST /api/desinscription", async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const lien = await lireCorps(req, ROUTES["POST /api/desinscription"].corps);
  if (!lien || !(await desinscrire(lien.id, lien.cle))) return erreur("lien");
  return repondre("POST /api/desinscription", { ok: true });
});
