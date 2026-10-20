import { after } from "next/server";
import { erreur, lireCorps, repondre, route, signalerErreur } from "@/server/http";
import { accesDuJeton, adresses } from "@/server/mcp/acces";
import { enteteDuDefi } from "@/server/mcp/oauth";
import { SERVEUR } from "@/server/mcp/outils";
import { jetonPorteur, traiterMessage } from "@/server/mcp/protocole";
import { ROUTES } from "@/types/api";

/* Un outil lit les mêmes chiffres que /admin : quelques secondes au plus */
export const maxDuration = 60;

/**
 * Le serveur MCP de BLUSH (src/server/mcp) : Claude y lit les chiffres de /admin, en lecture seule. Hors de la garde
 * commune : Claude appelle depuis ses serveurs, sans notre origine ni notre cookie, et seul son jeton d’accès compte
 * (l’OAuth de /api/oauth, donné par un compte de BLUSH_ADMINS). Sans jeton qui vaille : 401 « interdit », avec le défi
 * qui mène Claude aux métadonnées (et donc à la connexion). Un message illisible : une erreur JSON-RPC en 400 ; une
 * notification : 202 sans corps. Seul POST existe (ni flux, ni session) : GET répond 405.
 */
export const POST = route("POST /api/mcp", async (req: Request) => {
  const jeton = jetonPorteur(req.headers.get("authorization"));
  const acces = jeton ? await accesDuJeton(jeton) : null;
  if (!acces) return erreur("interdit", { "www-authenticate": enteteDuDefi(adresses(), jeton !== null) });
  const message = await lireCorps(req, ROUTES["POST /api/mcp"].corps);
  if (!message) return repondre("POST /api/mcp", { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Message JSON-RPC illisible." } }, 400);
  /* Une panne d’outil répond sans rien d’interne ; elle va au journal et se compte, comme celle d’une route */
  const reponse = await traiterMessage(SERVEUR, message, (e) => after(() => signalerErreur(e, { route: "POST /api/mcp" })));
  return reponse ? repondre("POST /api/mcp", reponse) : new Response(null, { status: 202 });
});
