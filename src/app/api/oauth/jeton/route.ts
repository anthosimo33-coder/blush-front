import { repondre, route } from "@/server/http";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";
import { adresses, echangerLeCode, rafraichir } from "@/server/mcp/acces";
import { champsDuFormulaire, defiS256, identiteDuClient, reponseDeJeton, ressourceConforme, verifierValide } from "@/server/mcp/oauth";

/** Un refus de l’OAuth (RFC 6749 §5.2) ; un client refusé, en 401, avec son défi Basic. */
const refus = (status: number, error: string, error_description: string) =>
  repondre("POST /api/oauth/jeton", { error, error_description }, status, status === 401 ? { "www-authenticate": 'Basic realm="blush"' } : {});

/**
 * Le point des jetons de l’OAuth du serveur MCP (RFC 6749) : un code contre des jetons (authorization_code, PKCE
 * exigé), ou un jeton de rafraîchissement contre de nouveaux (refresh_token, avec rotation). En formulaire, comme le
 * veut l’OAuth. Hors de la garde commune : Claude appelle depuis ses serveurs ; une limite par adresse IP.
 */
export const POST = route("POST /api/oauth/jeton", async (req: Request) => {
  if (!(await sousLaLimite(`mcp:jeton:${ipDe(req)}`, LIMITES.mcpJetonParIp))) return refus(429, "temporarily_unavailable", "Too many requests, retry later.");
  const form = await req
    .formData()
    .then(champsDuFormulaire)
    .catch(() => null);
  if (!form) return refus(400, "invalid_request", "Form body expected (application/x-www-form-urlencoded).");
  const client = identiteDuClient(form, req.headers.get("authorization"));
  if (!client) return refus(401, "invalid_client", "client_id is required.");
  if (!ressourceConforme(form.resource, adresses().ressource)) return refus(400, "invalid_target", "Unknown resource.");
  let issue;
  if (form.grant_type === "authorization_code") {
    if (!form.code || !form.code_verifier) return refus(400, "invalid_request", "code and code_verifier are required.");
    if (!verifierValide(form.code_verifier)) return refus(400, "invalid_grant", "Malformed code_verifier.");
    issue = await echangerLeCode({
      code: form.code,
      clientId: client.clientId,
      secret: client.secret,
      retour: form.redirect_uri,
      defi: defiS256(form.code_verifier),
      ressource: form.resource,
    });
  } else if (form.grant_type === "refresh_token") {
    if (!form.refresh_token) return refus(400, "invalid_request", "refresh_token is required.");
    issue = await rafraichir({ rafraichissement: form.refresh_token, clientId: client.clientId, secret: client.secret });
  } else return refus(400, "unsupported_grant_type", "grant_type must be authorization_code or refresh_token.");
  if (!issue.ok) return refus(issue.error === "invalid_client" ? 401 : 400, issue.error, issue.description);
  return repondre("POST /api/oauth/jeton", reponseDeJeton(issue), 200, { pragma: "no-cache" });
});
