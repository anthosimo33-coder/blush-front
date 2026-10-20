import { describe, expect, it } from "vitest";
import {
  adressesOAuth,
  avecParametres,
  champsDuFormulaire,
  defiS256,
  enteteDuDefi,
  estRetourClaude,
  identiteDuClient,
  porteeAccordee,
  ressourceConforme,
  retourAcceptable,
  retourEnregistre,
  validerDemande,
  validerEnregistrement,
  verifierValide,
} from "@/server/mcp/oauth";

/*
 * L’OAuth du serveur MCP, sans base (src/server/mcp/oauth.ts) : les adresses, les retours acceptés, l’enregistrement,
 * la demande d’autorisation, PKCE et l’identité du client. Le parcours entier, avec la base : tests/mcp.test.ts.
 */

const A = adressesOAuth("https://www.askblush.com/");
const DEFI = defiS256("a".repeat(43));

describe("les adresses", () => {
  it("l’émetteur est la racine du site, la ressource /api/mcp, la page de consentement dans /admin", () => {
    expect(A).toMatchObject({
      emetteur: "https://www.askblush.com",
      ressource: "https://www.askblush.com/api/mcp",
      metadonneesRessource: "https://www.askblush.com/.well-known/oauth-protected-resource/api/mcp",
      autorisation: "https://www.askblush.com/admin/connecter",
    });
  });

  it("le défi du 401 montre les métadonnées, et dit invalid_token quand un jeton est venu", () => {
    expect(enteteDuDefi(A, false)).toBe(`Bearer realm="blush", resource_metadata="${A.metadonneesRessource}", scope="lecture"`);
    expect(enteteDuDefi(A, true)).toContain('error="invalid_token"');
  });
});

describe("les retours", () => {
  it("https chez Claude seulement, http seulement en boucle locale, jamais de fragment ni d’identifiants", () => {
    expect(retourAcceptable("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(retourAcceptable("https://claude.com/api/mcp/auth_callback")).toBe(true);
    expect(retourAcceptable("https://site-tiers.test/callback")).toBe(false);
    expect(retourAcceptable("https://claude.ai.site-tiers.test/callback")).toBe(false);
    expect(retourAcceptable("https://claude.ai:8443/callback")).toBe(false);
    expect(retourAcceptable("http://localhost:3000/cb")).toBe(true);
    expect(retourAcceptable("http://127.0.0.1/cb")).toBe(true);
    expect(retourAcceptable("http://claude.ai/cb")).toBe(false);
    expect(retourAcceptable("https://claude.ai/cb#x")).toBe(false);
    expect(retourAcceptable("https://moi:secret@claude.ai/cb")).toBe(false);
    expect(retourAcceptable("javascript:alert(1)")).toBe(false);
  });

  it("un retour enregistré vaut à l’identique, ou en boucle locale quel que soit le port", () => {
    expect(retourEnregistre(["https://claude.ai/cb"], "https://claude.ai/cb")).toBe(true);
    expect(retourEnregistre(["https://claude.ai/cb"], "https://claude.ai/cb2")).toBe(false);
    expect(retourEnregistre(["http://localhost:1234/cb"], "http://localhost:5678/cb")).toBe(true);
    expect(retourEnregistre(["http://localhost:1234/cb"], "http://localhost:5678/autre")).toBe(false);
    expect(retourEnregistre(["http://localhost:1234/cb"], "http://127.0.0.1:1234/cb")).toBe(false);
  });

  it("les paramètres s’ajoutent sans écraser ceux du retour ; seul claude.ai se dit Claude", () => {
    expect(avecParametres("https://claude.ai/cb?x=1", { code: "c", state: undefined })).toBe("https://claude.ai/cb?x=1&code=c");
    expect(estRetourClaude("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(estRetourClaude("https://claude.ai.pirate.test/cb")).toBe(false);
  });
});

describe("l’enregistrement", () => {
  it("garde ses retours (sans doublon), son nom (raccourci), et client_secret_basic sans méthode dite", () => {
    const r = validerEnregistrement({ redirect_uris: ["https://claude.ai/cb", "https://claude.ai/cb"], client_name: "  Claude \n Desktop " });
    expect(r).toEqual({ ok: true, valeur: { retours: ["https://claude.ai/cb"], nom: "Claude Desktop", methode: "client_secret_basic" } });
  });

  it("refuse ce que le serveur ne sait pas faire", () => {
    expect(validerEnregistrement([])).toMatchObject({ ok: false, error: "invalid_client_metadata" });
    expect(validerEnregistrement({ redirect_uris: Array(11).fill("https://claude.ai/cb") })).toMatchObject({ error: "invalid_redirect_uri" });
    expect(validerEnregistrement({ redirect_uris: ["https://claude.ai/cb"], token_endpoint_auth_method: "private_key_jwt" })).toMatchObject({ error: "invalid_client_metadata" });
    expect(validerEnregistrement({ redirect_uris: ["https://claude.ai/cb"], grant_types: ["client_credentials"] })).toMatchObject({ error: "invalid_client_metadata" });
    expect(validerEnregistrement({ redirect_uris: ["https://claude.ai/cb"], response_types: ["token"] })).toMatchObject({ error: "invalid_client_metadata" });
  });
});

describe("la demande d’autorisation", () => {
  const demande = { response_type: "code", code_challenge: DEFI, code_challenge_method: "S256" };

  it("exige PKCE S256 et un défi bien formé, et la ressource du serveur s’il en nomme une", () => {
    expect(validerDemande(demande, A.ressource)).toEqual({ ok: true, valeur: { defi: DEFI, portee: "lecture" } });
    expect(validerDemande({ ...demande, response_type: "token" }, A.ressource)).toMatchObject({ error: "unsupported_response_type" });
    expect(validerDemande({ ...demande, code_challenge: undefined }, A.ressource)).toMatchObject({ error: "invalid_request" });
    expect(validerDemande({ ...demande, code_challenge_method: "plain" }, A.ressource)).toMatchObject({ error: "invalid_request" });
    expect(validerDemande({ ...demande, code_challenge: "court" }, A.ressource)).toMatchObject({ error: "invalid_request" });
    expect(validerDemande({ ...demande, resource: "https://ailleurs.test/mcp" }, A.ressource)).toMatchObject({ error: "invalid_target" });
    expect(validerDemande({ ...demande, resource: `${A.ressource}/`, state: "s" }, A.ressource)).toMatchObject({ ok: true, valeur: { ressource: `${A.ressource}/`, state: "s" } });
  });

  it("la portée : toujours la lecture, offline_access si demandé, le reste ignoré", () => {
    expect(porteeAccordee(undefined)).toBe("lecture");
    expect(porteeAccordee("offline_access ecriture")).toBe("lecture offline_access");
    expect(ressourceConforme(undefined, A.ressource)).toBe(true);
  });
});

describe("PKCE et le client", () => {
  it("le défi S256 de l’exemple de la RFC 7636", () => {
    expect(defiS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(verifierValide("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(true);
    expect(verifierValide("trop-court")).toBe(false);
  });

  it("le client se lit en Basic (encodé comme un formulaire), sinon dans le formulaire", () => {
    const basic = `Basic ${Buffer.from("blcl_a%3Ab:s+e").toString("base64")}`;
    expect(identiteDuClient({}, basic)).toEqual({ clientId: "blcl_a:b", secret: "s e" });
    expect(identiteDuClient({ client_id: "c" }, null)).toEqual({ clientId: "c" });
    expect(identiteDuClient({ client_id: "c", client_secret: "s" }, null)).toEqual({ clientId: "c", secret: "s" });
    expect(identiteDuClient({}, null)).toBeNull();
    expect(identiteDuClient({}, "Basic pas-du-base64-sans-deux-points")).toBeNull();
  });

  it("le formulaire : la première valeur de chaque champ texte", () => {
    const f = new FormData();
    f.append("code", "un");
    f.append("code", "deux");
    f.append("fichier", new Blob(["x"]));
    expect(champsDuFormulaire(f)).toEqual({ code: "un" });
  });
});
