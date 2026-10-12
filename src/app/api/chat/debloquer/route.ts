import { lireLaReponse } from "@/server/bulles";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { garde } from "@/server/requete";
import { ROUTES } from "@/types/api";

/**
 * Lire la réponse de BLUSH verrouillée (écrite à 0 bulle), une fois rechargé : son coût est débité, elle revient en
 * entier (src/server/bulles.ts, lireLaReponse). « bulles » : le solde ne la couvre toujours pas.
 */
export const POST = route("POST /api/chat/debloquer", async (req: Request) => {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  const corps = await lireCorps(req, ROUTES["POST /api/chat/debloquer"].corps);
  if (!corps) return erreur("invalide");
  const lue = await lireLaReponse(g.utilisateur, corps.message);
  if (lue === "insuffisant") return erreur("bulles");
  if (!lue) return erreur("introuvable");
  return repondre("POST /api/chat/debloquer", lue);
});
