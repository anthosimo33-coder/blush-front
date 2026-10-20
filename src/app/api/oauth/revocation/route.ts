import { repondre, route } from "@/server/http";
import { revoquer } from "@/server/mcp/acces";
import { champsDuFormulaire, identiteDuClient } from "@/server/mcp/oauth";

/**
 * La révocation d’un jeton de l’OAuth du serveur MCP (RFC 7009) : Claude l’appelle quand on le déconnecte, et l’accès
 * entier part. 200 pour toute demande bien formée, que le jeton ait existé ou non : rien ne se devine. Hors de la garde
 * commune : Claude appelle depuis ses serveurs.
 */
export const POST = route("POST /api/oauth/revocation", async (req: Request) => {
  const form = await req
    .formData()
    .then(champsDuFormulaire)
    .catch(() => null);
  if (!form?.token) return repondre("POST /api/oauth/revocation", { error: "invalid_request", error_description: "token is required." }, 400);
  const client = identiteDuClient(form, req.headers.get("authorization"));
  await revoquer({ jeton: form.token, clientId: client?.clientId });
  return repondre("POST /api/oauth/revocation", {});
});
