import { retirer } from "@/server/attente";
import { erreur, lireCorps, memeOrigine, repondre } from "@/server/http";
import { ROUTES } from "@/types/api";

/** Se retirer de la liste d’attente, depuis le lien de son mail (signé : on ne peut retirer que son propre email). */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const lien = await lireCorps(req, ROUTES["POST /api/attente/retrait"].corps);
  if (!lien || !(await retirer(lien.id, lien.cle))) return erreur("lien");
  return repondre("POST /api/attente/retrait", { ok: true });
}
