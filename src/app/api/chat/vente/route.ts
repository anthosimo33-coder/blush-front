import { erreur, lireCorps, repondre, route } from "@/server/http";
import { garde } from "@/server/requete";
import { noterLeGeste } from "@/server/vente";
import { ROUTES } from "@/types/api";

/**
 * Un geste sur une carte d’achat du chat (src/server/vente.ts) : son bouton touché, ou « Pas maintenant » (cette offre ne
 * se repropose plus d’elle-même pendant 3 jours). Compté pour /admin, sans rien d’autre : ni la conv, ni le prénom.
 * Trop de gestes pour ce compte : 429 « trop », rien n’est noté.
 */
export const POST = route("POST /api/chat/vente", async (req: Request) => {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  const corps = await lireCorps(req, ROUTES["POST /api/chat/vente"].corps);
  if (!corps) return erreur("invalide");
  if (!(await noterLeGeste(g.utilisateur.id, corps.evenement, corps.genre))) return erreur("trop");
  return repondre("POST /api/chat/vente", { ok: true });
});
