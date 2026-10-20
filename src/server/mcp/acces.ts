import "server-only";
import { and, eq, gt, lt, notExists, or, sql } from "drizzle-orm";
import { empreinte, memeEmpreinte } from "../chiffrement";
import { db, schema } from "../db";
import { env, estAdmin } from "../env";
import { LIMITES, sousLaLimite } from "../limites";
import {
  ACCES_DUREE_S,
  CODE_DUREE_MS,
  PREFIXES,
  RAFRAICHISSEMENT_DUREE_MS,
  adressesOAuth,
  avecParametres,
  estBoucleLocale,
  estRetourClaude,
  hoteDe,
  ressourceConforme,
  retourEnregistre,
  secretAleatoire,
  validerDemande,
  type AdressesOAuth,
  type Enregistrement,
  type ParametresDAutorisation,
  type RefusOAuth,
} from "./oauth";

/*
 * L’OAuth du serveur MCP, côté base (le protocole se décide dans src/server/mcp/oauth.ts). Le parcours, vu de Claude :
 * 1. POST /api/mcp sans jeton : un 401 qui montre les métadonnées ;
 * 2. POST /api/oauth/enregistrement : un client (enregistrerClient) ;
 * 3. la personne arrive sur /admin/connecter, dans BLUSH où elle a sa session, lit ce qu’elle accorde et à qui, puis
 *    autorise (accorder) ou refuse ;
 * 4. POST /api/oauth/jeton échange le code (echangerLeCode), puis rafraîchit (rafraichir) ;
 * 5. chaque appel à /api/mcp porte le jeton d’accès (accesDuJeton).
 * Seul un compte de BLUSH_ADMINS accorde un accès, et chaque appel le revérifie : un email retiré de BLUSH_ADMINS coupe
 * tous ses accès, sans rien effacer. Les secrets ne sont gardés que par leur empreinte.
 */

/** Les adresses de l’OAuth sur ce site (BLUSH_URL). */
export const adresses = (): AdressesOAuth => adressesOAuth(env().BLUSH_URL);

/** Combien de jours on garde un client enregistré qui n’a aucun accès (un enregistrement resté sans suite). */
const MCP_CLIENTS_GARDES_JOURS = 90;
/** « Utilisé le » ne s’écrit qu’une fois toutes les cinq minutes, pas à chaque appel. */
const RAFRAICHIR_L_USAGE_MS = 5 * 60 * 1000;

/**
 * Enregistre un client (RFC 7591), dans la limite de l’heure pour tous (enregistrements à la chaîne). Rend son
 * identifiant, son secret (en clair, cette seule fois ; aucun pour un client public) et sa date ; null : la limite.
 */
export async function enregistrerClient(e: Enregistrement): Promise<{ clientId: string; secret: string | null; creeLe: Date } | null> {
  if (!(await sousLaLimite("mcp:enregistrement", LIMITES.mcpEnregistrementsParHeure))) return null;
  const clientId = secretAleatoire(PREFIXES.client, 16);
  const secret = e.methode === "none" ? null : secretAleatoire(PREFIXES.secret);
  const [client] = await db()
    .insert(schema.mcpClients)
    .values({ id: clientId, secretHash: secret ? empreinte(secret) : null, methode: e.methode, nom: e.nom, retours: e.retours })
    .returning({ creeLe: schema.mcpClients.creeLe });
  return { clientId, secret, creeLe: client!.creeLe };
}

type Client = typeof schema.mcpClients.$inferSelect;

/** Ce que dit une demande d’autorisation, avant toute session : d’où elle vient, et où elle repart. */
type Demande =
  /* Un client inconnu, ou un retour qui n’est pas l’un des siens : rien ne dit où repartirait une redirection, on n’en fait pas */
  | { genre: "client_inconnu" }
  | { genre: "retour_inconnu" }
  /* Le reste est faux, mais le retour est sûr : l’erreur y repart */
  | { genre: "invalide"; retour: string }
  | { genre: "ok"; client: Client; retour: string; defi: string; portee: string; ressource?: string; state?: string };

async function lireLaDemande(p: ParametresDAutorisation): Promise<Demande> {
  const [client] = p.client_id ? await db().select().from(schema.mcpClients).where(eq(schema.mcpClients.id, p.client_id)) : [];
  if (!client) return { genre: "client_inconnu" };
  const retour = p.redirect_uri ?? (client.retours.length === 1 ? client.retours[0] : undefined);
  if (!retour || !retourEnregistre(client.retours, retour)) return { genre: "retour_inconnu" };
  const d = validerDemande(p, adresses().ressource);
  if (!d.ok) return { genre: "invalide", retour: avecParametres(retour, { error: d.error, error_description: d.description, state: p.state }) };
  return { genre: "ok", client, retour, ...d.valeur };
}

/**
 * Ce que montre la page de consentement (/admin/connecter). Le nom du client, c’est lui qui le choisit : la page ne dit
 * « Claude » que si le code repart vers claude.ai, et montre toujours l’hôte du retour. `refus` : où renvoyer « Refuser ».
 */
export type DemandeDAutorisation =
  | { genre: "client_inconnu" | "retour_inconnu" }
  | { genre: "invalide"; retour: string }
  | { genre: "ok"; nom: string; hote: string; claude: boolean; boucleLocale: boolean; refus: string };

export async function decrireLaDemande(p: ParametresDAutorisation): Promise<DemandeDAutorisation> {
  const d = await lireLaDemande(p);
  if (d.genre !== "ok") return d;
  return {
    genre: "ok",
    nom: d.client.nom,
    hote: hoteDe(d.retour),
    claude: estRetourClaude(d.retour),
    boucleLocale: estBoucleLocale(d.retour),
    refus: avecParametres(d.retour, { error: "access_denied", state: d.state }),
  };
}

/**
 * La personne autorise : la demande se relit (elle a pu changer depuis l’affichage), puis le code part vers le retour du
 * client, et seule son empreinte reste. null : la demande ne vaut plus, ou le compte n’est pas de BLUSH_ADMINS.
 */
export async function accorder(utilisateur: { id: string; email: string }, p: ParametresDAutorisation): Promise<string | null> {
  if (!estAdmin(utilisateur.email)) return null;
  const d = await lireLaDemande(p);
  if (d.genre !== "ok") return null;
  const code = secretAleatoire(PREFIXES.code);
  await db()
    .insert(schema.mcpCodes)
    .values({
      codeHash: empreinte(code),
      clientId: d.client.id,
      userId: utilisateur.id,
      retour: d.retour,
      defi: d.defi,
      portee: d.portee,
      ressource: d.ressource ?? null,
      expireLe: new Date(Date.now() + CODE_DUREE_MS),
    });
  return avecParametres(d.retour, { code, state: d.state });
}

/** Ce que rend /token : les jetons en clair (une seule fois) et la portée, ou un refus de l’OAuth. */
export type IssueDuJeton = { ok: true; acces: string; rafraichissement: string; portee: string } | RefusOAuth;

const CLIENT_REFUSE: RefusOAuth = { ok: false, error: "invalid_client", description: "Unknown client or bad credentials." };
const perdu = (description: string): RefusOAuth => ({ ok: false, error: "invalid_grant", description });

/** Le client, s’il prouve qui il est : un client public (PKCE seul) n’a pas de secret à montrer. */
async function clientAuthentifie(clientId: string, secret: string | undefined): Promise<Client | null> {
  const [client] = await db().select().from(schema.mcpClients).where(eq(schema.mcpClients.id, clientId));
  if (!client) return null;
  if (client.methode !== "none" && (secret === undefined || !client.secretHash || !memeEmpreinte(secret, client.secretHash))) return null;
  return client;
}

/** Deux nouveaux jetons, et leurs dates de fin. */
function nouveauxJetons(maintenant: number) {
  const acces = secretAleatoire(PREFIXES.acces);
  const rafraichissement = secretAleatoire(PREFIXES.rafraichissement);
  return {
    acces,
    rafraichissement,
    colonnes: {
      accesHash: empreinte(acces),
      accesExpireLe: new Date(maintenant + ACCES_DUREE_S * 1000),
      rafraichissementHash: empreinte(rafraichissement),
      rafraichissementExpireLe: new Date(maintenant + RAFRAICHISSEMENT_DUREE_MS),
    },
  };
}

/**
 * Échange un code contre des jetons (authorization_code). Le code part dès qu’on le lit, même refusé : il ne sert
 * qu’une fois. `defi` : le défi S256 recalculé depuis le verifier reçu (defiS256).
 */
export async function echangerLeCode(a: { code: string; clientId: string; secret?: string; retour?: string; defi: string; ressource?: string }): Promise<IssueDuJeton> {
  const [code] = await db()
    .delete(schema.mcpCodes)
    .where(eq(schema.mcpCodes.codeHash, empreinte(a.code)))
    .returning();
  if (!code) return perdu("Unknown or already used code.");
  const client = await clientAuthentifie(a.clientId, a.secret);
  if (!client) return CLIENT_REFUSE;
  const maintenant = Date.now();
  if (code.expireLe.getTime() < maintenant) return perdu("Code expired.");
  if (code.clientId !== client.id) return perdu("Code issued to another client.");
  if (a.retour !== undefined && a.retour !== code.retour) return perdu("redirect_uri does not match the authorization request.");
  if (a.defi !== code.defi) return perdu("PKCE verification failed.");
  if (a.ressource && code.ressource && !ressourceConforme(a.ressource, code.ressource)) return perdu("resource does not match the authorization request.");
  const j = nouveauxJetons(maintenant);
  await db()
    .insert(schema.mcpAcces)
    .values({ clientId: client.id, userId: code.userId, nom: client.nom, hote: hoteDe(code.retour), portee: code.portee, ...j.colonnes });
  return { ok: true, acces: j.acces, rafraichissement: j.rafraichissement, portee: code.portee };
}

/**
 * Rafraîchit un accès (refresh_token), avec rotation : de nouveaux jetons à chaque fois. Le jeton d’avant la dernière
 * rotation vaut encore une fois (une réponse perdue en route), puis plus du tout. Un accès expiré part.
 */
export async function rafraichir(a: { rafraichissement: string; clientId: string; secret?: string }): Promise<IssueDuJeton> {
  const h = empreinte(a.rafraichissement);
  const [acces] = await db()
    .select()
    .from(schema.mcpAcces)
    .where(or(eq(schema.mcpAcces.rafraichissementHash, h), eq(schema.mcpAcces.precedentHash, h)));
  const mort = perdu("Refresh token unknown, revoked or expired.");
  if (!acces) return mort;
  const client = await clientAuthentifie(a.clientId, a.secret);
  if (!client) return CLIENT_REFUSE;
  if (acces.clientId !== client.id) return mort;
  const maintenant = Date.now();
  if (acces.rafraichissementExpireLe.getTime() < maintenant) {
    await db().delete(schema.mcpAcces).where(eq(schema.mcpAcces.id, acces.id));
    return mort;
  }
  const parLePrecedent = acces.precedentHash === h;
  const j = nouveauxJetons(maintenant);
  /* Conditionnée au jeton reçu : deux rafraîchissements en même temps, un seul passe */
  const [tourne] = await db()
    .update(schema.mcpAcces)
    .set({ ...j.colonnes, precedentHash: parLePrecedent ? null : acces.rafraichissementHash })
    .where(and(eq(schema.mcpAcces.id, acces.id), parLePrecedent ? eq(schema.mcpAcces.precedentHash, h) : eq(schema.mcpAcces.rafraichissementHash, h)))
    .returning({ id: schema.mcpAcces.id });
  if (!tourne) return mort;
  return { ok: true, acces: j.acces, rafraichissement: j.rafraichissement, portee: acces.portee };
}

/** Révoque l’accès d’un jeton, d’accès ou de rafraîchissement (RFC 7009) : l’accès entier part. Du client qui le demande, s’il se nomme. */
export async function revoquer(a: { jeton: string; clientId?: string }): Promise<void> {
  const h = empreinte(a.jeton);
  const duJeton = or(eq(schema.mcpAcces.accesHash, h), eq(schema.mcpAcces.rafraichissementHash, h), eq(schema.mcpAcces.precedentHash, h));
  await db()
    .delete(schema.mcpAcces)
    .where(a.clientId ? and(duJeton, eq(schema.mcpAcces.clientId, a.clientId)) : duJeton);
}

/**
 * Le compte d’un jeton d’accès, s’il vaut encore et que le compte est de BLUSH_ADMINS : null sinon (inconnu, expiré,
 * révoqué, compte effacé ou retiré de l’équipe). Note l’usage, toutes les cinq minutes au plus.
 */
export async function accesDuJeton(jeton: string): Promise<{ userId: string; nom: string } | null> {
  const [acces] = await db()
    .select({ id: schema.mcpAcces.id, userId: schema.mcpAcces.userId, nom: schema.mcpAcces.nom, utiliseLe: schema.mcpAcces.utiliseLe, email: schema.users.email })
    .from(schema.mcpAcces)
    .innerJoin(schema.users, eq(schema.users.id, schema.mcpAcces.userId))
    .where(and(eq(schema.mcpAcces.accesHash, empreinte(jeton)), gt(schema.mcpAcces.accesExpireLe, sql`now()`)));
  if (!acces || !estAdmin(acces.email)) return null;
  if (!acces.utiliseLe || Date.now() - acces.utiliseLe.getTime() > RAFRAICHIR_L_USAGE_MS)
    await db()
      .update(schema.mcpAcces)
      .set({ utiliseLe: sql`now()` })
      .where(eq(schema.mcpAcces.id, acces.id));
  return { userId: acces.userId, nom: acces.nom };
}

/**
 * La purge de la nuit (src/server/purge.ts) : les codes expirés, les accès dont le rafraîchissement a expiré, et les
 * clients restés sans accès ni code depuis MCP_CLIENTS_GARDES_JOURS.
 */
export async function purgerLOAuth(maintenant: Date): Promise<void> {
  await db().delete(schema.mcpCodes).where(lt(schema.mcpCodes.expireLe, maintenant));
  await db().delete(schema.mcpAcces).where(lt(schema.mcpAcces.rafraichissementExpireLe, maintenant));
  await db()
    .delete(schema.mcpClients)
    .where(
      and(
        lt(schema.mcpClients.creeLe, new Date(maintenant.getTime() - MCP_CLIENTS_GARDES_JOURS * 86400e3)),
        notExists(
          db()
            .select({ un: sql`1` })
            .from(schema.mcpAcces)
            .where(eq(schema.mcpAcces.clientId, schema.mcpClients.id)),
        ),
        notExists(
          db()
            .select({ un: sql`1` })
            .from(schema.mcpCodes)
            .where(eq(schema.mcpCodes.clientId, schema.mcpClients.id)),
        ),
      ),
    );
}
