import { repondre, route } from "@/server/http";
import { adresses } from "@/server/mcp/acces";
import { metadonneesDuServeur } from "@/server/mcp/oauth";

/**
 * Les métadonnées du serveur d’autorisation du serveur MCP (RFC 8414) : ses adresses, ce qu’il accepte (PKCE S256,
 * l’enregistrement dynamique). Servies aussi à /.well-known/oauth-authorization-server (next.config.ts). Publiques.
 */
export const GET = route("GET /api/oauth/metadonnees", async () => repondre("GET /api/oauth/metadonnees", metadonneesDuServeur(adresses())));
