import { erreur, lireCorps, repondre, route } from "@/server/http";
import { garde } from "@/server/requete";
import { jouer } from "@/server/roue";
import { ROUTES } from "@/types/api";

/** L’en-tête d’un test qui impose la case (0 à 7) : lu seulement avec le faux Whop (src/server/roue.ts), jamais en ligne. */
const CASE_IMPOSEE = "x-blush-roue-case";

/**
 * Tourner la roue du paywall (`tourner`), ou n’en pas vouloir (`refuser`) : une fois par compte, le tirage fait par le
 * serveur. Déjà tournée ou refusée : la même réponse (sa case, son lot, sa fin et ce qu’il reste). L’équipe, ou sans
 * paiement branché : « aucune ».
 */
export const POST = route("POST /api/roue", async (req: Request) => {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  const corps = await lireCorps(req, ROUTES["POST /api/roue"].corps);
  if (!corps) return erreur("invalide");
  const imposee = req.headers.get(CASE_IMPOSEE);
  return repondre("POST /api/roue", await jouer(g.utilisateur, corps.geste, { forcee: imposee !== null && /^\d$/.test(imposee) ? Number(imposee) : null }));
});
