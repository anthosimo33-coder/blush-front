import { erreur, lireCorps, repondre, route } from "@/server/http";
import { signalerJalonAMeta } from "@/server/pubs-meta";
import { garde } from "@/server/requete";
import { noterJalon } from "@/server/visites";
import { ROUTES } from "@/types/api";

/**
 * Un jalon du tunnel (src/lib/jalons.ts) : ce que le visiteur vient de faire, un fichier choisi, le paywall vu jusqu’aux
 * avis, le formulaire de Whop affiché… Ceux de l’import viennent avec l’appli de leur écran. Compté une fois par jour par
 * l’empreinte de la connexion, comme la visite (src/server/visites.ts), sans cookie ni compte ; la première fois du jour,
 * il part aussi chez Meta si la personne a accepté les pubs (src/server/pubs-meta.ts : attendu, le navigateur n’attend
 * pas cette réponse). Toujours `{ ok: true }` : un jalon ignoré ne se dit pas.
 */
export const POST = route("POST /api/jalon", async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const corps = await lireCorps(req, ROUTES["POST /api/jalon"].corps);
  if (!corps) return erreur("invalide");
  if (await noterJalon(req, corps.jalon, corps.appli)) await signalerJalonAMeta(req, corps.jalon);
  return repondre("POST /api/jalon", { ok: true });
});
