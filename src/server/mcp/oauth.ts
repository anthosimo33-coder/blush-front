import { createHash, randomBytes } from "node:crypto";
import { METHODES_CLIENT_OAUTH, type MethodeClientOAuth } from "../db/enums";

/*
 * L’OAuth du serveur MCP (src/app/api/mcp), en module pur : sans base ni réseau, testé seul
 * (tests/unit/mcp-oauth.test.ts). Le dépôt (src/server/mcp/acces.ts) et les routes (src/app/api/oauth) ne font que
 * brancher la base et les requêtes sur ce qui se décide ici. Repris de celui de Jarvia, qui marche avec Claude.
 *
 * Pourquoi l’OAuth : claude.ai, Claude Desktop et le mobile n’acceptent un serveur distant que comme connecteur, une
 * adresse puis une connexion OAuth ; pas de clé à copier. BLUSH est donc son propre serveur d’autorisation : Claude
 * s’enregistre (RFC 7591), envoie la personne sur la page de consentement de BLUSH (/admin/connecter, où elle a sa
 * session), puis échange le code contre un jeton.
 *
 * Ce que Claude exige : un 401 qui porte `WWW-Authenticate: Bearer resource_metadata="…"`, les métadonnées de la
 * ressource (RFC 9728) et du serveur (RFC 8414), PKCE S256 annoncé et exigé, /token en formulaire et /register en JSON,
 * `invalid_grant` (et aucun autre code) pour un jeton de rafraîchissement mort, la rotation de ce jeton (client public),
 * le retour https://claude.ai/api/mcp/auth_callback, et pour Claude Code un retour en boucle locale dont le port change à
 * chaque connexion. L’émetteur est la racine du site : rien d’autre n’y publie de métadonnées.
 */

/** La seule permission : lire les chiffres de /admin. Le serveur n’a aucun outil qui modifie. */
const PORTEE_LECTURE = "lecture";
/** Demandée par Claude pour obtenir un jeton de rafraîchissement. */
const PORTEE_HORS_LIGNE = "offline_access";
const PORTEES_CONNUES = [PORTEE_LECTURE, PORTEE_HORS_LIGNE] as const;

/** Un code d’autorisation : échangé dans la foulée, dix minutes suffisent. */
export const CODE_DUREE_MS = 10 * 60 * 1000;
/** Un jeton d’accès : une heure. Claude le renouvelle seul, sur un 401 ou avant son échéance. */
export const ACCES_DUREE_S = 60 * 60;
/**
 * Un jeton de rafraîchissement : 30 jours glissants (chaque rotation les relance). Un Claude qui ne s’en sert pas pendant
 * un mois se reconnecte : ce sont les chiffres de toute l’entreprise.
 */
export const RAFRAICHISSEMENT_DUREE_MS = 30 * 86400e3;

const RETOURS_MAX = 10;
const NOM_CLIENT_MAX = 100;
const URL_MAX = 2048;
const STATE_MAX = 2048;

/** Le début de chaque secret : il dit ce qu’il est, dans un journal ou une fuite. */
export const PREFIXES = { client: "blcl_", secret: "blcs_", code: "blco_", acces: "blat_", rafraichissement: "blrt_" } as const;

/* ———— Les adresses ———— */

/** Les adresses du serveur d’autorisation et de la ressource, sous l’adresse du site (BLUSH_URL). */
export type AdressesOAuth = {
  /** L’émetteur (RFC 8414) : la racine du site. */
  emetteur: string;
  /** La ressource protégée : l’adresse qu’on colle dans Claude. */
  ressource: string;
  metadonneesRessource: string;
  /** La page de consentement, dans /admin : là où la personne a sa session. */
  autorisation: string;
  jeton: string;
  enregistrement: string;
  revocation: string;
};

/** Les adresses d’après celle du site (BLUSH_URL, sans barre finale). */
export function adressesOAuth(site: string): AdressesOAuth {
  const base = site.replace(/\/+$/, "");
  return {
    emetteur: base,
    ressource: `${base}/api/mcp`,
    metadonneesRessource: `${base}/.well-known/oauth-protected-resource/api/mcp`,
    autorisation: `${base}/admin/connecter`,
    jeton: `${base}/api/oauth/jeton`,
    enregistrement: `${base}/api/oauth/enregistrement`,
    revocation: `${base}/api/oauth/revocation`,
  };
}

/** Les métadonnées de la ressource (RFC 9728) : ce que Claude lit après le 401 pour trouver l’émetteur. */
export function metadonneesDeLaRessource(a: AdressesOAuth) {
  return {
    resource: a.ressource,
    authorization_servers: [a.emetteur],
    scopes_supported: [PORTEE_LECTURE],
    bearer_methods_supported: ["header"],
    resource_name: "BLUSH",
  };
}

/**
 * Les métadonnées du serveur d’autorisation (RFC 8414). Sans `client_id_metadata_document_supported` : Claude choisit
 * alors l’enregistrement dynamique, le seul mode prévu ici.
 */
export function metadonneesDuServeur(a: AdressesOAuth) {
  return {
    issuer: a.emetteur,
    authorization_endpoint: a.autorisation,
    token_endpoint: a.jeton,
    registration_endpoint: a.enregistrement,
    revocation_endpoint: a.revocation,
    scopes_supported: [...PORTEES_CONNUES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: [...METHODES_CLIENT_OAUTH],
    revocation_endpoint_auth_methods_supported: [...METHODES_CLIENT_OAUTH],
    code_challenge_methods_supported: ["S256"],
  };
}

/** L’en-tête du 401 de /api/mcp. `jetonPresente` : un jeton est venu, mais il ne vaut pas (ou plus) : Claude le rafraîchit. */
export function enteteDuDefi(a: AdressesOAuth, jetonPresente: boolean): string {
  return ['Bearer realm="blush"', ...(jetonPresente ? ['error="invalid_token"'] : []), `resource_metadata="${a.metadonneesRessource}"`, `scope="${PORTEE_LECTURE}"`].join(", ");
}

/* ———— Les retours ———— */

const BOUCLE_LOCALE = new Set(["localhost", "127.0.0.1", "[::1]"]);
/**
 * Les seuls hôtes en https où un code peut partir : ceux de Claude. Un site tiers qui s’enregistrerait avec son propre
 * retour ne peut donc pas se faire autoriser par un lien envoyé à l’équipe (l’hameçonnage du consentement) : ce sont
 * les chiffres de toute l’entreprise. Claude Code, lui, revient en boucle locale.
 */
const HOTES_DE_CLAUDE = new Set(["claude.ai", "claude.com"]);

function lireUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

/**
 * Un retour acceptable : en https chez Claude (HOTES_DE_CLAUDE), ou en http en boucle locale (RFC 8252), sans fragment ni
 * identifiants.
 */
export function retourAcceptable(uri: string): boolean {
  if (uri.length > URL_MAX) return false;
  const u = lireUrl(uri);
  if (!u || u.hash !== "" || u.username !== "" || u.password !== "") return false;
  if (u.protocol === "https:") return HOTES_DE_CLAUDE.has(u.hostname) && u.port === "";
  return u.protocol === "http:" && BOUCLE_LOCALE.has(u.hostname);
}

export function estBoucleLocale(uri: string): boolean {
  const u = lireUrl(uri);
  return u !== null && u.protocol === "http:" && BOUCLE_LOCALE.has(u.hostname);
}

/**
 * Le retour demandé est-il l’un de ceux du client ? À l’identique, sauf en boucle locale où le port ne compte pas
 * (RFC 8252 §7.3) : Claude Code ouvre un port différent à chaque connexion.
 */
export function retourEnregistre(enregistres: readonly string[], demande: string): boolean {
  if (enregistres.includes(demande)) return true;
  const d = lireUrl(demande);
  if (!d || !estBoucleLocale(demande)) return false;
  return enregistres.some((r) => {
    const e = lireUrl(r);
    return e !== null && estBoucleLocale(r) && e.hostname === d.hostname && e.pathname === d.pathname && e.search === d.search;
  });
}

/** Le retour, avec ces paramètres en plus, sans écraser les siens. */
export function avecParametres(uri: string, parametres: Record<string, string | undefined>): string {
  const u = new URL(uri);
  for (const [cle, valeur] of Object.entries(parametres)) if (valeur !== undefined) u.searchParams.set(cle, valeur);
  return u.toString();
}

/** L’hôte que montre la page de consentement : là où le code partira. */
export const hoteDe = (uri: string) => lireUrl(uri)?.host ?? uri;

/** Le retour mène-t-il à Claude lui-même ? Le seul cas où la page dit « Claude » : le nom d’un client, lui, il le choisit. */
export function estRetourClaude(uri: string): boolean {
  const u = lireUrl(uri);
  return u !== null && u.protocol === "https:" && (u.hostname === "claude.ai" || u.hostname === "claude.com");
}

/* ———— L’enregistrement dynamique (RFC 7591) ———— */

/** Un refus de l’OAuth : son code (RFC 6749 §5.2, RFC 7591 §3.2.2) et sa description, en anglais comme les clients l’attendent. */
export type RefusOAuth = { ok: false; error: string; description: string };
type Issue<T> = { ok: true; valeur: T } | RefusOAuth;

const refus = (error: string, description: string): RefusOAuth => ({ ok: false, error, description });

/** Un client à enregistrer : ses retours, son nom (qu’il choisit lui-même), et comment il s’authentifie. */
export type Enregistrement = { retours: string[]; nom: string; methode: MethodeClientOAuth };

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const estMethode = (x: unknown): x is MethodeClientOAuth => (METHODES_CLIENT_OAUTH as readonly unknown[]).includes(x);

/** Le corps de l’enregistrement, vérifié : le premier problème, sinon le client à créer. */
export function validerEnregistrement(corps: unknown): Issue<Enregistrement> {
  if (!estObjet(corps)) return refus("invalid_client_metadata", "JSON object expected.");
  const uris = corps.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > RETOURS_MAX || !uris.every((u) => typeof u === "string"))
    return refus("invalid_redirect_uri", `redirect_uris: 1 to ${RETOURS_MAX} URIs required.`);
  const invalide = (uris as string[]).find((u) => !retourAcceptable(u));
  if (invalide !== undefined) return refus("invalid_redirect_uri", `Redirect URI not allowed (Claude over HTTPS, or HTTP on loopback only): ${invalide.slice(0, 200)}`);
  /* RFC 7591 §2 : sans méthode dite, c’est client_secret_basic */
  const methode = corps.token_endpoint_auth_method ?? "client_secret_basic";
  if (!estMethode(methode)) return refus("invalid_client_metadata", `token_endpoint_auth_method must be one of: ${METHODES_CLIENT_OAUTH.join(", ")}.`);
  const grants = corps.grant_types;
  if (grants !== undefined && (!Array.isArray(grants) || !grants.every((g) => g === "authorization_code" || g === "refresh_token")))
    return refus("invalid_client_metadata", "grant_types: only authorization_code and refresh_token are supported.");
  const reponses = corps.response_types;
  if (reponses !== undefined && (!Array.isArray(reponses) || !reponses.every((r) => r === "code")))
    return refus("invalid_client_metadata", "response_types: only code is supported.");
  const nom = typeof corps.client_name === "string" ? corps.client_name.trim().replace(/\s+/g, " ").slice(0, NOM_CLIENT_MAX) : "";
  return { ok: true, valeur: { retours: [...new Set(uris as string[])], nom, methode } };
}

/* ———— La demande d’autorisation ———— */

/** Les paramètres de la page de consentement, tels que reçus (tous facultatifs). */
export type ParametresDAutorisation = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
  resource?: string;
};

/** Le reste d’une demande valide, une fois le client et son retour vérifiés. */
export type DemandeValide = { defi: string; portee: string; ressource?: string; state?: string };

/** La portée accordée : ce qui est connu dans la demande, et toujours la lecture. */
export function porteeAccordee(demandee: string | undefined): string {
  const voulues = new Set((demandee ?? "").split(/\s+/).filter(Boolean));
  voulues.add(PORTEE_LECTURE);
  return PORTEES_CONNUES.filter((p) => voulues.has(p)).join(" ");
}

/** Une ressource désigne-t-elle notre serveur MCP ? Absente : oui. La barre finale ne compte pas. */
export function ressourceConforme(ressource: string | undefined, attendue: string): boolean {
  if (ressource === undefined || ressource === "") return true;
  const sansBarre = (s: string) => s.replace(/\/+$/, "");
  return sansBarre(ressource) === sansBarre(attendue);
}

/** Un défi S256 : base64url(SHA-256(verifier)), 32 octets, 43 caractères. */
const DEFI_S256 = /^[A-Za-z0-9_-]{43}$/;

/**
 * Le reste de la demande, une fois le client et son retour vérifiés. Un refus ici repart vers le client (son retour est
 * sûr) ; un client ou un retour inconnus, jamais : l’appelant les traite avant.
 */
export function validerDemande(p: ParametresDAutorisation, ressourceAttendue: string): Issue<DemandeValide> {
  if (p.response_type !== "code") return refus("unsupported_response_type", "response_type must be code.");
  if (!p.code_challenge) return refus("invalid_request", "PKCE is required (code_challenge, S256).");
  if (p.code_challenge_method !== "S256") return refus("invalid_request", "code_challenge_method must be S256.");
  if (!DEFI_S256.test(p.code_challenge)) return refus("invalid_request", "Malformed code_challenge.");
  if (!ressourceConforme(p.resource, ressourceAttendue)) return refus("invalid_target", "Unknown resource.");
  if (p.state !== undefined && p.state.length > STATE_MAX) return refus("invalid_request", "state is too long.");
  return {
    ok: true,
    valeur: { defi: p.code_challenge, portee: porteeAccordee(p.scope), ...(p.resource ? { ressource: p.resource } : {}), ...(p.state !== undefined ? { state: p.state } : {}) },
  };
}

/* ———— Les secrets, PKCE, le formulaire ———— */

/** Un secret tiré au hasard, avec son préfixe. */
export const secretAleatoire = (prefixe: string, octets = 32) => prefixe + randomBytes(octets).toString("base64url");

/** RFC 7636 : de 43 à 128 caractères non réservés. */
export const verifierValide = (v: string) => /^[A-Za-z0-9\-._~]{43,128}$/.test(v);

/** Le défi S256 d’un verifier : ce que le client a envoyé à l’autorisation. */
export const defiS256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** `Authorization: Basic …` (RFC 6749 §2.3.1 : l’id et le secret encodés comme un formulaire). */
function lireBasic(entete: string | null): { clientId: string; secret: string } | null {
  const m = entete?.match(/^\s*Basic\s+(\S+)\s*$/i);
  if (!m?.[1]) return null;
  const brut = Buffer.from(m[1], "base64").toString("utf8");
  const i = brut.indexOf(":");
  if (i < 0) return null;
  try {
    return { clientId: decodeURIComponent(brut.slice(0, i).replace(/\+/g, " ")), secret: decodeURIComponent(brut.slice(i + 1).replace(/\+/g, " ")) };
  } catch {
    return null;
  }
}

/** Qui est le client, à /token et /revoke : Basic, sinon les champs du formulaire. Sans secret : un client public (PKCE seul). */
export function identiteDuClient(form: Record<string, string>, authorization: string | null): { clientId: string; secret?: string } | null {
  const basic = lireBasic(authorization);
  if (basic) return basic;
  if (!form.client_id) return null;
  return form.client_secret !== undefined ? { clientId: form.client_id, secret: form.client_secret } : { clientId: form.client_id };
}

/** Les champs texte d’un formulaire (la première valeur de chacun). */
export function champsDuFormulaire(form: FormData): Record<string, string> {
  const champs: Record<string, string> = {};
  for (const [cle, valeur] of form) if (typeof valeur === "string" && !(cle in champs)) champs[cle] = valeur;
  return champs;
}

/** La réponse de /token. */
export const reponseDeJeton = (t: { acces: string; rafraichissement: string; portee: string }) => ({
  access_token: t.acces,
  token_type: "Bearer" as const,
  expires_in: ACCES_DUREE_S,
  refresh_token: t.rafraichissement,
  scope: t.portee,
});
