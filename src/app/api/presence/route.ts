import { erreur, lireCorps, repondre, route } from "@/server/http";
import { garde } from "@/server/requete";
import { noterSigne } from "@/server/visites";
import { ROUTES } from "@/types/api";

/**
 * Le signe d’un onglet ouvert (src/lib/presence.ts), toutes les 40 secondes tant qu’il est visible : l’écran où il est,
 * et à son premier signe d’où il vient. Il compte la visite du jour et nourrit /admin en direct (src/server/visites.ts),
 * sans cookie ni compte. Toujours `{ ok: true }` : un signe ignoré (trop de signes d’une même adresse) ne se dit pas.
 */
export const POST = route("POST /api/presence", async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const signe = await lireCorps(req, ROUTES["POST /api/presence"].corps);
  if (!signe) return erreur("invalide");
  await noterSigne(req, signe);
  return repondre("POST /api/presence", { ok: true });
});
