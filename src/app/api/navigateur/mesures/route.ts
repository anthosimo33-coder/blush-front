import { erreur, lireCorps, repondre, route } from "@/server/http";
import { noterMesuresDuNavigateur } from "@/server/navigateur";
import { garde } from "@/server/requete";
import { ROUTES } from "@/types/api";

/**
 * Les mesures de vitesse d’une page quittée (les Web Vitals, src/lib/sentinelle.tsx) : notées pour les médianes
 * d’/admin (src/server/navigateur.ts). Sans compte. Toujours `{ ok: true }`.
 */
export const POST = route("POST /api/navigateur/mesures", async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const m = await lireCorps(req, ROUTES["POST /api/navigateur/mesures"].corps);
  if (!m) return erreur("invalide");
  await noterMesuresDuNavigateur(req, m);
  return repondre("POST /api/navigateur/mesures", { ok: true });
});
