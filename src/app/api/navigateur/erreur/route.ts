import { erreur, lireCorps, repondre, route } from "@/server/http";
import { noterErreurDuNavigateur } from "@/server/navigateur";
import { garde } from "@/server/requete";
import { ROUTES } from "@/types/api";

/**
 * Une erreur de l’appli dans le navigateur d’un visiteur (src/lib/sentinelle.tsx) : notée pour /admin, et la première
 * du jour de son genre prévient l’équipe (src/server/navigateur.ts). Sans compte. Toujours `{ ok: true }`.
 */
export const POST = route("POST /api/navigateur/erreur", async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const e = await lireCorps(req, ROUTES["POST /api/navigateur/erreur"].corps);
  if (!e) return erreur("invalide");
  await noterErreurDuNavigateur(req, e);
  return repondre("POST /api/navigateur/erreur", { ok: true });
});
