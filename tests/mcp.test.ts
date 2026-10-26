import { createHash, randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Le serveur MCP de BLUSH (src/server/mcp) et son OAuth, de bout en bout, avec la base : Claude s’enregistre, un compte
 * de l’équipe l’autorise sur la page de consentement, Claude échange son code (PKCE), appelle chaque outil, rafraîchit
 * ses jetons (avec rotation), puis se fait révoquer ; un compte retiré de BLUSH_ADMINS perd ses accès ; la purge de
 * nuit efface ce qui a expiré. Les routes sont appelées comme le feraient Claude (sans origine ni cookie) et la page
 * (la session simulée : `etat.utilisateur`).
 */
const etat = vi.hoisted(() => ({
  /** Le compte de la session (contexteRequete) */
  utilisateur: null as { id: string; email: string } | null,
  /** Les emails de BLUSH_ADMINS */
  admins: new Set<string>(),
  apres: [] as (() => unknown)[],
}));
vi.mock("@/server/env", async (original) => {
  const m = await original<typeof import("@/server/env")>();
  return { ...m, estAdmin: (email: string) => etat.admins.has(email) };
});
vi.mock("@/server/donnees", async (original) => ({
  ...(await original<typeof import("@/server/donnees")>()),
  contexteRequete: async () => ({ utilisateur: etat.utilisateur, story: null }),
  utilisateurCourant: async () => etat.utilisateur,
}));
/* after() de Next ne vit que dans une requête : ce qui devait partir après la réponse attend ici */
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => void etat.apres.push(f) }));

import { POST as postMcp } from "@/app/api/mcp/route";
import { GET as getRessource } from "@/app/api/mcp/metadonnees/route";
import { POST as postAutoriser } from "@/app/api/oauth/autoriser/route";
import { POST as postEnregistrement } from "@/app/api/oauth/enregistrement/route";
import { POST as postJeton } from "@/app/api/oauth/jeton/route";
import { GET as getServeur } from "@/app/api/oauth/metadonnees/route";
import { POST as postRevocation } from "@/app/api/oauth/revocation/route";
import { empreinte } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { env } from "@/server/env";
import { decrireLaDemande, purgerLOAuth } from "@/server/mcp/acces";
import { OUTILS } from "@/server/mcp/outils";
import type { ClientOAuth, JetonOAuth, ReponseRpc } from "@/types/api";
import { compteDeTest } from "./aide/fixtures";

const RETOUR_CLAUDE = "https://claude.ai/api/mcp/auth_callback";
const APPLI = { origin: "http://localhost", host: "localhost" };
const clients: string[] = [];

/** Une paire PKCE : le verifier gardé par Claude, son défi S256 envoyé à l’autorisation. */
function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, defi: createHash("sha256").update(verifier).digest("base64url") };
}

async function enregistrer(corps: unknown) {
  const r = await postEnregistrement(
    new Request("http://localhost/api/oauth/enregistrement", { method: "POST", body: JSON.stringify(corps), headers: { "content-type": "application/json" } }),
  );
  const json = (await r.json()) as ClientOAuth;
  if (r.status === 201) clients.push(json.client_id);
  return { status: r.status, json };
}

const formulaire = (url: string, champs: Record<string, string>, entetes: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    body: new URLSearchParams(champs),
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "203.0.113.7", ...entetes },
  });

async function jeton(champs: Record<string, string>, entetes: Record<string, string> = {}) {
  const r = await postJeton(formulaire("http://localhost/api/oauth/jeton", champs, entetes));
  return { status: r.status, json: (await r.json()) as JetonOAuth & { error?: string }, entetes: r.headers };
}

/** La page de consentement autorise, avec la session de `etat.utilisateur` : la réponse, et le code du retour s’il y en a un. */
async function autoriser(parametres: Record<string, string>) {
  const r = await postAutoriser(
    new Request("http://localhost/api/oauth/autoriser", { method: "POST", body: JSON.stringify(parametres), headers: { "content-type": "application/json", ...APPLI } }),
  );
  const json = (await r.json()) as { redirection?: string; erreur?: string };
  const retour = json.redirection ? new URL(json.redirection) : null;
  return { status: r.status, json, code: retour?.searchParams.get("code") ?? null, state: retour?.searchParams.get("state") ?? null };
}

let id = 0;
async function mcp(methode: string, params: unknown, acces: string | null, { notification = false } = {}) {
  const r = await postMcp(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", method: methode, params, ...(notification ? {} : { id: ++id }) }),
      headers: { "content-type": "application/json", ...(acces ? { authorization: `Bearer ${acces}` } : {}) },
    }),
  );
  return { status: r.status, entetes: r.headers, json: r.status === 202 ? null : ((await r.json()) as ReponseRpc & { erreur?: string }) };
}

/** Le texte JSON d’un résultat d’outil, relu. */
const contenu = (r: ReponseRpc) => JSON.parse((r.result as { content: { text: string }[] }).content[0]!.text) as Record<string, unknown>;

let admin: { id: string; email: string };
let autre: { id: string; email: string };

beforeAll(async () => {
  admin = await compteDeTest("mcp-admin");
  autre = await compteDeTest("mcp-autre");
  /* La limite des enregistrements est pour tous, par heure : les passages d’avant de ce fichier ne la remplissent pas */
  await db()
    .delete(schema.rateLimits)
    .where(eq(schema.rateLimits.key, empreinte("limite:mcp:enregistrement")));
});
beforeEach(() => {
  etat.admins = new Set([admin.email]);
  etat.utilisateur = admin;
  etat.apres = [];
});
afterAll(async () => {
  if (clients.length) await db().delete(schema.mcpClients).where(inArray(schema.mcpClients.id, clients));
});

/** Un client public de Claude, autorisé par l’équipe : ses jetons. */
async function connecter(): Promise<{ clientId: string; acces: string; rafraichissement: string }> {
  const { json: client } = await enregistrer({ client_name: "Claude", redirect_uris: [RETOUR_CLAUDE], token_endpoint_auth_method: "none" });
  const { verifier, defi } = pkce();
  const { code } = await autoriser({ response_type: "code", client_id: client.client_id, redirect_uri: RETOUR_CLAUDE, code_challenge: defi, code_challenge_method: "S256" });
  const { json } = await jeton({ grant_type: "authorization_code", code: code!, code_verifier: verifier, client_id: client.client_id, redirect_uri: RETOUR_CLAUDE });
  return { clientId: client.client_id, acces: json.access_token, rafraichissement: json.refresh_token };
}

describe("la découverte", () => {
  it("les métadonnées de la ressource mènent au serveur d’autorisation, dont les adresses sont celles des routes", async () => {
    const base = env().BLUSH_URL.replace(/\/+$/, "");
    const ressource = (await (await getRessource()).json()) as { resource: string; authorization_servers: string[] };
    expect(ressource).toMatchObject({ resource: `${base}/api/mcp`, authorization_servers: [base] });
    expect(await (await getServeur()).json()).toMatchObject({
      issuer: base,
      authorization_endpoint: `${base}/admin/connecter`,
      token_endpoint: `${base}/api/oauth/jeton`,
      registration_endpoint: `${base}/api/oauth/enregistrement`,
      code_challenge_methods_supported: ["S256"],
    });
  });

  it("sans jeton, /api/mcp répond 401 avec le défi qui montre les métadonnées ; un jeton inconnu y ajoute invalid_token", async () => {
    const sans = await mcp("initialize", {}, null);
    expect(sans.status).toBe(401);
    expect(sans.json).toEqual({ erreur: "interdit" });
    expect(sans.entetes.get("www-authenticate")).toContain(`resource_metadata="${env().BLUSH_URL.replace(/\/+$/, "")}/.well-known/oauth-protected-resource/api/mcp"`);
    expect(sans.entetes.get("www-authenticate")).not.toContain("invalid_token");
    const inconnu = await mcp("initialize", {}, "blat_pas-un-vrai-jeton");
    expect(inconnu.status).toBe(401);
    expect(inconnu.entetes.get("www-authenticate")).toContain('error="invalid_token"');
  });
});

describe("l’enregistrement et le consentement", () => {
  it("un client public n’a pas de secret ; un retour hors de Claude et de la boucle locale est refusé", async () => {
    const ok = await enregistrer({ client_name: "Claude", redirect_uris: [RETOUR_CLAUDE], token_endpoint_auth_method: "none" });
    expect(ok.status).toBe(201);
    expect(ok.json.client_secret).toBeUndefined();
    expect(ok.json.redirect_uris).toEqual([RETOUR_CLAUDE]);
    expect((await enregistrer({ redirect_uris: ["http://claude.ai/retour"] })).status).toBe(400);
    /* Un site tiers ne s’enregistre pas avec son propre retour : rien ne peut partir chez lui */
    expect((await enregistrer({ redirect_uris: ["https://site-tiers.test/callback"] })).json).toMatchObject({ error: "invalid_redirect_uri" });
    expect((await enregistrer({ redirect_uris: [] })).json).toMatchObject({ error: "invalid_redirect_uri" });
  });

  it("la page décrit la demande : Claude pour un retour vers claude.ai, et le refus repart avec access_denied", async () => {
    const { json: client } = await enregistrer({ client_name: "Un nom choisi", redirect_uris: [RETOUR_CLAUDE], token_endpoint_auth_method: "none" });
    const { defi } = pkce();
    const d = await decrireLaDemande({ response_type: "code", client_id: client.client_id, code_challenge: defi, code_challenge_method: "S256", state: "s1" });
    expect(d).toMatchObject({ genre: "ok", nom: "Un nom choisi", hote: "claude.ai", claude: true, boucleLocale: false });
    expect(d.genre === "ok" && new URL(d.refus).searchParams.get("error")).toBe("access_denied");
    expect(await decrireLaDemande({ client_id: "blcl_inconnu" })).toEqual({ genre: "client_inconnu" });
    expect(await decrireLaDemande({ client_id: client.client_id, redirect_uri: "https://ailleurs.test/cb" })).toEqual({ genre: "retour_inconnu" });
    /* Sans PKCE : le retour est sûr, l’erreur y repart */
    const sansPkce = await decrireLaDemande({ response_type: "code", client_id: client.client_id, state: "s2" });
    expect(sansPkce.genre === "invalide" && new URL(sansPkce.retour).searchParams.get("error")).toBe("invalid_request");
  });

  it("autoriser est réservé à l’équipe : sans session 401, un compte ordinaire 404, une demande fausse 422", async () => {
    const { json: client } = await enregistrer({ redirect_uris: [RETOUR_CLAUDE], token_endpoint_auth_method: "none" });
    const demande = { response_type: "code", client_id: client.client_id, code_challenge: pkce().defi, code_challenge_method: "S256", state: "etat-de-claude" };
    etat.utilisateur = null;
    expect((await autoriser(demande)).status).toBe(401);
    etat.utilisateur = autre;
    expect((await autoriser(demande)).status).toBe(404);
    etat.utilisateur = admin;
    expect((await autoriser({ ...demande, code_challenge_method: "plain" })).status).toBe(422);
    const ok = await autoriser(demande);
    expect(ok.status).toBe(200);
    expect(ok.code).toMatch(/^blco_/);
    expect(ok.state).toBe("etat-de-claude");
    /* Seule l’empreinte du code est gardée */
    const [ligne] = await db()
      .select()
      .from(schema.mcpCodes)
      .where(eq(schema.mcpCodes.codeHash, empreinte(ok.code!)));
    expect(ligne).toMatchObject({ userId: admin.id, clientId: client.client_id });
  });
});

describe("les jetons", () => {
  it("un code s’échange une fois, avec le bon verifier", async () => {
    const { json: client } = await enregistrer({ redirect_uris: [RETOUR_CLAUDE], token_endpoint_auth_method: "none" });
    const { verifier, defi } = pkce();
    const { code } = await autoriser({ response_type: "code", client_id: client.client_id, code_challenge: defi, code_challenge_method: "S256" });
    const mauvais = await jeton({ grant_type: "authorization_code", code: code!, code_verifier: pkce().verifier, client_id: client.client_id });
    expect(mauvais.json).toMatchObject({ error: "invalid_grant" });
    /* Le code est parti dès sa première lecture, même refusée */
    const ensuite = await jeton({ grant_type: "authorization_code", code: code!, code_verifier: verifier, client_id: client.client_id });
    expect(ensuite.json).toMatchObject({ error: "invalid_grant" });
  });

  it("le bon échange rend un jeton d’accès d’une heure et un de rafraîchissement ; le même code ne resert pas", async () => {
    const { json: client } = await enregistrer({ redirect_uris: [RETOUR_CLAUDE], token_endpoint_auth_method: "none" });
    const { verifier, defi } = pkce();
    const { code } = await autoriser({ response_type: "code", client_id: client.client_id, code_challenge: defi, code_challenge_method: "S256" });
    const champs = { grant_type: "authorization_code", code: code!, code_verifier: verifier, client_id: client.client_id, redirect_uri: RETOUR_CLAUDE };
    const r = await jeton(champs);
    expect(r.status).toBe(200);
    expect(r.entetes.get("cache-control")).toBe("no-store");
    expect(r.json).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "lecture" });
    expect(r.json.access_token).toMatch(/^blat_/);
    expect(r.json.refresh_token).toMatch(/^blrt_/);
    expect((await jeton(champs)).json).toMatchObject({ error: "invalid_grant" });
  });

  it("un client confidentiel prouve son secret (Basic) ; sans lui, 401 invalid_client", async () => {
    const { json: client } = await enregistrer({ redirect_uris: [RETOUR_CLAUDE] });
    expect(client.token_endpoint_auth_method).toBe("client_secret_basic");
    expect(client.client_secret).toMatch(/^blcs_/);
    const { verifier, defi } = pkce();
    const { code } = await autoriser({ response_type: "code", client_id: client.client_id, code_challenge: defi, code_challenge_method: "S256" });
    const sansSecret = await jeton({ grant_type: "authorization_code", code: code!, code_verifier: verifier, client_id: client.client_id });
    expect(sansSecret.status).toBe(401);
    expect(sansSecret.entetes.get("www-authenticate")).toBe('Basic realm="blush"');
    const autreCode = await autoriser({ response_type: "code", client_id: client.client_id, code_challenge: defi, code_challenge_method: "S256" });
    const basic = `Basic ${Buffer.from(`${client.client_id}:${client.client_secret}`).toString("base64")}`;
    const ok = await jeton({ grant_type: "authorization_code", code: autreCode.code!, code_verifier: verifier }, { authorization: basic });
    expect(ok.status).toBe(200);
  });

  it("Claude Code : un retour en boucle locale vaut quel que soit son port", async () => {
    const { json: client } = await enregistrer({ redirect_uris: ["http://localhost:51000/callback"], token_endpoint_auth_method: "none" });
    const { verifier, defi } = pkce();
    const r = await autoriser({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: "http://localhost:62000/callback",
      code_challenge: defi,
      code_challenge_method: "S256",
    });
    expect(r.json.redirection).toMatch(/^http:\/\/localhost:62000\/callback\?code=/);
    const j = await jeton({
      grant_type: "authorization_code",
      code: r.code!,
      code_verifier: verifier,
      client_id: client.client_id,
      redirect_uri: "http://localhost:62000/callback",
    });
    expect(j.status).toBe(200);
  });

  it("un type de demande inconnu, un formulaire absent, une ressource d’ailleurs : refusés", async () => {
    expect((await jeton({ grant_type: "password", client_id: "x" })).json).toMatchObject({ error: "unsupported_grant_type" });
    expect((await jeton({ grant_type: "refresh_token", client_id: "x", resource: "https://ailleurs.test/mcp" })).json).toMatchObject({ error: "invalid_target" });
    expect((await jeton({ grant_type: "refresh_token" })).status).toBe(401);
    const json = await postJeton(new Request("http://localhost/api/oauth/jeton", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
    expect(await json.json()).toMatchObject({ error: "invalid_request" });
  });
});

describe("les outils", () => {
  it("initialize, tools/list (tous en lecture seule), puis chaque outil répond du JSON", async () => {
    const { acces } = await connecter();
    const init = await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }, acces);
    expect(init.json?.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "blush" }, capabilities: { tools: {} } });
    expect((await mcp("notifications/initialized", {}, acces, { notification: true })).status).toBe(202);
    const liste = (await mcp("tools/list", {}, acces)).json?.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] };
    expect(liste.tools.map((o) => o.name)).toEqual(OUTILS.map((o) => o.name));
    expect(liste.tools.every((o) => o.annotations.readOnlyHint)).toBe(true);
    for (const o of OUTILS) {
      const r = await mcp("tools/call", { name: o.name, arguments: {} }, acces);
      expect({ outil: o.name, erreur: (r.json?.result as { isError?: boolean }).isError ?? false }).toEqual({ outil: o.name, erreur: false });
      expect(contenu(r.json!)).toBeTypeOf("object");
    }
  });

  it("le pilotage sur 30 jours (le nombre peut venir en texte), une période inconnue refusée au modèle", async () => {
    const { acces } = await connecter();
    const p = contenu((await mcp("tools/call", { name: "pilotage", arguments: { jours: "30" } }, acces)).json!);
    expect(p).toMatchObject({ jours: 30, margeApresIAPct: { cible: 80 } });
    expect(p).toHaveProperty("chiffreDAffaires.netEuros.valeur");
    expect(p).toHaveProperty("tunnel");
    /* Le tunnel détaillé : l’import appli par appli aussi */
    expect(contenu((await mcp("tools/call", { name: "tunnel", arguments: { jours: 30 } }, acces)).json!)).toHaveProperty("importParAppli");
    const faux = (await mcp("tools/call", { name: "pilotage", arguments: { jours: 5 } }, acces)).json?.result as { isError: boolean; content: { text: string }[] };
    expect(faux.isError).toBe(true);
    expect(faux.content[0]!.text).toContain("1, 7, 30");
    expect((await mcp("tools/call", { name: "donner_des_bulles", arguments: {} }, acces)).json?.error?.code).toBe(-32602);
  });

  it("un email retiré de BLUSH_ADMINS perd ses accès, sans rien effacer", async () => {
    const { acces } = await connecter();
    expect((await mcp("ping", {}, acces)).status).toBe(200);
    etat.admins.delete(admin.email);
    expect((await mcp("ping", {}, acces)).status).toBe(401);
    etat.admins.add(admin.email);
    expect((await mcp("ping", {}, acces)).status).toBe(200);
  });
});

describe("le rafraîchissement et la révocation", () => {
  it("chaque rafraîchissement donne de nouveaux jetons ; l’ancien jeton de rafraîchissement vaut encore une fois, puis plus", async () => {
    const { clientId, acces, rafraichissement } = await connecter();
    const r1 = await jeton({ grant_type: "refresh_token", refresh_token: rafraichissement, client_id: clientId });
    expect(r1.status).toBe(200);
    expect(r1.json.refresh_token).not.toBe(rafraichissement);
    /* L’ancien jeton d’accès ne vaut plus, le nouveau si */
    expect((await mcp("ping", {}, acces)).status).toBe(401);
    expect((await mcp("ping", {}, r1.json.access_token)).status).toBe(200);
    /* La réponse s’est perdue : Claude réessaie avec l’ancien, une fois */
    const r2 = await jeton({ grant_type: "refresh_token", refresh_token: rafraichissement, client_id: clientId });
    expect(r2.status).toBe(200);
    expect((await jeton({ grant_type: "refresh_token", refresh_token: rafraichissement, client_id: clientId })).json).toMatchObject({ error: "invalid_grant" });
    /* Un autre client ne rafraîchit pas les jetons de celui-ci */
    const { clientId: autreClient } = await connecter();
    expect((await jeton({ grant_type: "refresh_token", refresh_token: r2.json.refresh_token, client_id: autreClient })).json).toMatchObject({ error: "invalid_grant" });
  });

  it("révoquer un jeton fait partir tout l’accès ; un jeton inconnu répond 200 aussi", async () => {
    const { clientId, acces, rafraichissement } = await connecter();
    const revoquer = (champs: Record<string, string>) => postRevocation(formulaire("http://localhost/api/oauth/revocation", champs));
    expect((await revoquer({ token: rafraichissement, client_id: clientId })).status).toBe(200);
    expect((await mcp("ping", {}, acces)).status).toBe(401);
    expect((await jeton({ grant_type: "refresh_token", refresh_token: rafraichissement, client_id: clientId })).json).toMatchObject({ error: "invalid_grant" });
    expect((await revoquer({ token: "blrt_inconnu" })).status).toBe(200);
    expect((await revoquer({})).status).toBe(400);
  });
});

describe("la purge de nuit", () => {
  it("efface les codes et les accès expirés, et les clients restés sans accès 90 jours", async () => {
    const { clientId } = await connecter();
    const { json: vieux } = await enregistrer({ redirect_uris: [RETOUR_CLAUDE], token_endpoint_auth_method: "none" });
    const { json: codeSeul } = await enregistrer({ redirect_uris: [RETOUR_CLAUDE], token_endpoint_auth_method: "none" });
    await autoriser({ response_type: "code", client_id: codeSeul.client_id, code_challenge: pkce().defi, code_challenge_method: "S256" });
    const ilYa100Jours = new Date(Date.now() - 100 * 86400e3);
    await db()
      .update(schema.mcpClients)
      .set({ creeLe: ilYa100Jours })
      .where(inArray(schema.mcpClients.id, [vieux.client_id, codeSeul.client_id, clientId]));
    await db().update(schema.mcpAcces).set({ rafraichissementExpireLe: ilYa100Jours }).where(eq(schema.mcpAcces.clientId, clientId));
    /* Le lendemain : le code de codeSeul a expiré lui aussi */
    await purgerLOAuth(new Date(Date.now() + 86400e3));
    const restants = await db()
      .select({ id: schema.mcpClients.id })
      .from(schema.mcpClients)
      .where(inArray(schema.mcpClients.id, [vieux.client_id, codeSeul.client_id, clientId]));
    expect(restants).toEqual([]);
    expect(await db().select().from(schema.mcpAcces).where(eq(schema.mcpAcces.clientId, clientId))).toEqual([]);
  });

  it("un compte effacé emporte ses accès", async () => {
    const passager = await compteDeTest("mcp-passager");
    etat.admins.add(passager.email);
    etat.utilisateur = passager;
    const { clientId } = await connecter();
    await db().delete(schema.users).where(eq(schema.users.id, passager.id));
    expect(await db().select().from(schema.mcpAcces).where(eq(schema.mcpAcces.clientId, clientId))).toEqual([]);
  });
});
