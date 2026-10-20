import { lireCorps, repondre, route } from "@/server/http";
import { enregistrerClient } from "@/server/mcp/acces";
import { validerEnregistrement } from "@/server/mcp/oauth";
import { ROUTES } from "@/types/api";

/** Un refus de l’OAuth, jamais gardé en cache (repondre : no-store). */
const refus = (status: number, error: string, error_description: string) => repondre("POST /api/oauth/enregistrement", { error, error_description }, status);

/**
 * L’enregistrement dynamique d’un client (RFC 7591) : Claude s’y présente avant de demander une autorisation. Hors de la
 * garde commune : Claude appelle depuis ses serveurs, sans notre origine. Enregistrer n’ouvre rien (seul un compte de
 * BLUSH_ADMINS accorde un accès, sur /admin/connecter) ; la limite de l’heure, pour tous, arrête une boucle.
 */
export const POST = route("POST /api/oauth/enregistrement", async (req: Request) => {
  const corps = await lireCorps(req, ROUTES["POST /api/oauth/enregistrement"].corps);
  if (!corps) return refus(400, "invalid_client_metadata", "JSON object expected.");
  const e = validerEnregistrement(corps);
  if (!e.ok) return refus(400, e.error, e.description);
  const client = await enregistrerClient(e.valeur);
  if (!client) return refus(429, "temporarily_unavailable", "Too many registrations, retry later.");
  return repondre(
    "POST /api/oauth/enregistrement",
    {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.creeLe.getTime() / 1000),
      ...(client.secret ? { client_secret: client.secret, client_secret_expires_at: 0 as const } : {}),
      client_name: e.valeur.nom,
      redirect_uris: e.valeur.retours,
      token_endpoint_auth_method: e.valeur.methode,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201,
  );
});
