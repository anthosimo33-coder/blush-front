import { erreur, lireCorps, repondre, route } from "@/server/http";
import { garde } from "@/server/requete";
import { noterJalon } from "@/server/visites";
import { ROUTES } from "@/types/api";

/**
 * Un jalon du tunnel (src/lib/jalons.ts) : ce que le visiteur vient de faire, un fichier choisi, le paywall vu jusqu’aux
 * avis, le formulaire de Whop affiché… Ceux de l’import viennent avec l’appli de leur écran. Compté une fois par jour par
 * l’empreinte de la connexion, comme la visite (src/server/visites.ts), sans cookie ni compte. Toujours `{ ok: true }` :
 * un jalon ignoré ne se dit pas.
 */
export const POST = route("POST /api/jalon", async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const corps = await lireCorps(req, ROUTES["POST /api/jalon"].corps);
  if (!corps) return erreur("invalide");
  await noterJalon(req, corps.jalon, corps.appli);
  return repondre("POST /api/jalon", { ok: true });
});
