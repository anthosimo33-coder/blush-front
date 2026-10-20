import { estAdmin } from "@/server/env";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { accorder } from "@/server/mcp/acces";
import { garde } from "@/server/requete";
import { ROUTES } from "@/types/api";

/**
 * La page de consentement (/admin/connecter) autorise Claude à lire /admin : la demande se relit, puis un code part
 * vers le retour du client (la réponse dit où renvoyer le navigateur). Réservée aux emails de BLUSH_ADMINS : pour tous
 * les autres, la route n’existe pas (404 « introuvable », comme la page). Une demande qui ne vaut plus (un client
 * inconnu, un retour qui n’est pas le sien, un défi PKCE manquant) : 422 « invalide ».
 */
export const POST = route("POST /api/oauth/autoriser", async (req: Request) => {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  if (!estAdmin(g.utilisateur.email)) return erreur("introuvable");
  const demande = await lireCorps(req, ROUTES["POST /api/oauth/autoriser"].corps);
  if (!demande) return erreur("invalide");
  const redirection = await accorder(g.utilisateur, demande);
  return redirection ? repondre("POST /api/oauth/autoriser", { redirection }) : erreur("invalide");
});
