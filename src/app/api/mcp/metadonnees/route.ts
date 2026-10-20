import { repondre, route } from "@/server/http";
import { adresses } from "@/server/mcp/acces";
import { metadonneesDeLaRessource } from "@/server/mcp/oauth";

/**
 * Les métadonnées du serveur MCP en tant que ressource protégée (RFC 9728) : où est son serveur d’autorisation. Claude
 * les lit après le 401 de /api/mcp ; servies aussi à /.well-known/oauth-protected-resource (next.config.ts). Publiques.
 */
export const GET = route("GET /api/mcp/metadonnees", async () => repondre("GET /api/mcp/metadonnees", metadonneesDeLaRessource(adresses())));
