import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Jalon } from "@/types";
import { cheminSur } from "@/lib/chemins";
import { NOMS_DU_TOURNAGE } from "@/lib/noms-cookies";
import { COOKIE_CHOIX_PUBS, COOKIE_FBC, COOKIE_FBP, evenementMetaDe, traceValide, type TraceMeta } from "@/lib/pubs";
import { db, schema } from "./db";
import { env, URL_SITE } from "./env";
import { auMieux, journal } from "./journal";
import { adresseDe } from "./limites";

/*
 * Les pubs sur Facebook et Instagram : ce que BLUSH dit à Meta (son API Conversions), pour qu’il montre les pubs à ceux
 * qui s’en servent vraiment. Aucun script de Meta dans les pages : tout part d’ici, et seulement :
 * - avec l’accord de la personne (le cookie blush-pubs à « oui », src/components/shell/BandeauPubs.tsx) ;
 * - quand Meta est branché (NEXT_PUBLIC_META_PIXEL_ID et META_CAPI_TOKEN) : en local et dans les tests, rien ne part ;
 * - un événement standard et rien de la conv : chaque page chargée (PageView, au premier signe de l’onglet, et au clic sur
 *   « Accepter » pour la page de la pub), la conv importée (Lead), le compte créé (CompleteRegistration), le
 *   paywall vu (ViewContent), le bouton qui paie touché (InitiateCheckout), une fois par jour et par personne comme
 *   leur jalon (src/server/visites.ts, noterJalon) ; et l’achat payé (Purchase, son montant), depuis son webhook, d’un
 *   vrai client seulement (achats.population : ni l’équipe, ni le tournage, ni l’offert) ;
 * - avec ce que Meta sait relier à un clic : ses deux cookies (_fbp, _fbc), le navigateur, l’adresse IP de la requête
 *   (lue, jamais écrite) et, pour un achat, l’email du compte haché (SHA-256, comme Meta le demande) ; l’adresse de la
 *   page sans identifiant ni requête (cheminSur).
 * À la commande, l’achat garde les deux cookies et le navigateur (achats.pubs_meta : le webhook n’a pas la requête),
 * effacés dès l’achat envoyé, et au plus tard par la purge. Rien de tout ça ne fait échouer ce qu’il suit (auMieux).
 */

/** La version de l’API de Meta (Graph). */
const VERSION_GRAPH = "v23.0";
/** Combien de jours un achat jamais payé garde ses traces pour Meta (achats.pubs_meta), avant que la purge les efface. */
export const PUBS_META_GARDEES_JOURS = 7;
/** Le temps laissé à Meta pour répondre : court, la livraison d’un achat l’attend. */
const DELAI_MS = 4000;

/** Ce que Meta reçoit de la personne (user_data). */
type Personne = TraceMeta & { ip?: string | null; email?: string | null };

/** Un événement tel que Meta le reçoit (son API Conversions). */
type EvenementMeta = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url: string;
  user_data: Record<string, string | string[]>;
  custom_data?: { value: number; currency: "EUR" };
};

/** Les cookies d’une requête, par leur nom. */
function cookiesDe(req: Request): Map<string, string> {
  const pot = new Map<string, string>();
  for (const morceau of (req.headers.get("cookie") ?? "").split(";")) {
    const i = morceau.indexOf("=");
    if (i > 0) pot.set(morceau.slice(0, i).trim(), decodeURIComponent(morceau.slice(i + 1).trim()));
  }
  return pot;
}

/**
 * Ce que cette requête peut dire à Meta : ses cookies de Meta (seulement au bon format) et son navigateur, si la
 * personne a accepté les pubs ; null sinon (refusé, pas encore choisi, ou un navigateur en mode tournage).
 */
export function traceDe(req: Request): TraceMeta | null {
  const pot = cookiesDe(req);
  if (pot.get(COOKIE_CHOIX_PUBS) !== "oui" || NOMS_DU_TOURNAGE.some((nom) => pot.has(nom))) return null;
  const fbp = pot.get(COOKIE_FBP);
  const fbc = pot.get(COOKIE_FBC);
  const agent = req.headers.get("user-agent")?.slice(0, 512);
  return { ...(traceValide(fbp) && { fbp }), ...(traceValide(fbc) && { fbc }), ...(agent && { agent }) };
}

/** Un email tel que Meta le compare : sans espace, en minuscules, haché (SHA-256, en hexadécimal). */
export const emailHache = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

/** L’adresse d’une page de BLUSH telle qu’elle part chez Meta : son chemin sans identifiant ni requête, sinon l’accueil. */
export function pageSure(adresse: string | null): string {
  try {
    if (adresse) return `${URL_SITE}${cheminSur(new URL(adresse).pathname)}`;
  } catch {
    /* Pas une adresse : l’accueil */
  }
  return `${URL_SITE}/`;
}

/** Un événement pour Meta : son nom, son identifiant (Meta ignore un doublon du même), l’heure, la page, la personne. */
export function evenementMeta({
  nom,
  id,
  le,
  page,
  personne,
  centimes,
}: {
  nom: string;
  id: string;
  le: Date;
  page: string;
  personne: Personne;
  centimes?: number;
}): EvenementMeta {
  const user_data: Record<string, string | string[]> = {};
  if (personne.fbp) user_data.fbp = personne.fbp;
  if (personne.fbc) user_data.fbc = personne.fbc;
  if (personne.agent) user_data.client_user_agent = personne.agent;
  if (personne.ip) user_data.client_ip_address = personne.ip;
  if (personne.email) user_data.em = [emailHache(personne.email)];
  return {
    event_name: nom,
    event_time: Math.floor(le.getTime() / 1000),
    event_id: id,
    action_source: "website",
    event_source_url: page,
    user_data,
    ...(centimes !== undefined && { custom_data: { value: centimes / 100, currency: "EUR" } }),
  };
}

/** Meta branché : l’ensemble de données et la clé de l’API Conversions ; null sinon (rien ne part). */
function configMeta(): { pixel: string; cle: string; test?: string } | null {
  const e = env();
  if (!e.NEXT_PUBLIC_META_PIXEL_ID || !e.META_CAPI_TOKEN) return null;
  return { pixel: e.NEXT_PUBLIC_META_PIXEL_ID, cle: e.META_CAPI_TOKEN, ...(e.META_TEST_EVENT_CODE && { test: e.META_TEST_EVENT_CODE }) };
}

/** Envoie un événement à Meta ; une réponse refusée se dit au journal (son statut et son message, jamais la clé). */
async function envoyer(evenement: EvenementMeta): Promise<void> {
  const config = configMeta();
  if (!config) return;
  const r = await fetch(`https://graph.facebook.com/${VERSION_GRAPH}/${config.pixel}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: [evenement], access_token: config.cle, ...(config.test && { test_event_code: config.test }) }),
    signal: AbortSignal.timeout(DELAI_MS),
  });
  if (!r.ok) {
    const corps = (await r.text().catch(() => "")).slice(0, 300);
    journal("événement refusé par Meta", { evenement: evenement.event_name, statut: r.status, reponse: corps }, "alerte");
  }
}

/**
 * Le jalon d’une personne qui a accepté les pubs, chez Meta (son événement standard : EVENEMENTS_META), la première
 * fois du jour (`nouveau`, noterJalon) ; les autres jalons, et sans accord, rien.
 */
export async function signalerJalonAMeta(req: Request, jalon: Jalon): Promise<void> {
  const nom = evenementMetaDe(jalon);
  const trace = nom && configMeta() ? traceDe(req) : null;
  if (!nom || !trace) return;
  await auMieux(
    envoyer(evenementMeta({ nom, id: randomUUID(), le: new Date(), page: pageSure(req.headers.get("referer")), personne: { ...trace, ip: adresseDe(req) } })),
    "jalon non envoyé à Meta",
    { jalon },
  );
}

/**
 * Une page chargée, chez Meta (PageView) : au premier signe d’un onglet (POST /api/presence, `chemin` : sa page
 * d’arrivée, déjà nettoyée) ou au clic sur « Accepter » (POST /api/pubs/vue, la page de la requête). Sans accord, rien.
 */
export async function signalerVueAMeta(req: Request, chemin: string | null): Promise<void> {
  const trace = configMeta() ? traceDe(req) : null;
  if (!trace) return;
  const page = pageSure(chemin ? new URL(chemin, URL_SITE).href : req.headers.get("referer"));
  await auMieux(envoyer(evenementMeta({ nom: "PageView", id: randomUUID(), le: new Date(), page, personne: { ...trace, ip: adresseDe(req) } })), "page vue non envoyée à Meta");
}

/**
 * L’achat payé, chez Meta (Purchase, son montant), depuis sa livraison : seulement celui d’un vrai client
 * (achats.population, rangé juste avant) commandé avec l’accord (achats.pubs_meta). Ses traces s’effacent ensuite,
 * envoyé ou non : on ne le renvoie jamais.
 */
export async function envoyerAchatAMeta(achatId: string): Promise<void> {
  if (!configMeta()) return;
  const a = schema.achats;
  const [achat] = await db()
    .select({ id: a.id, statut: a.statut, population: a.population, centimes: a.centimes, payeLe: a.payeLe, pubsMeta: a.pubsMeta, email: schema.users.email })
    .from(a)
    .leftJoin(schema.users, eq(schema.users.id, a.userId))
    .where(eq(a.id, achatId));
  if (!achat?.pubsMeta) return;
  if (achat.statut === "paye" && achat.population === "client") {
    await auMieux(
      envoyer(
        evenementMeta({
          nom: "Purchase",
          id: achat.id,
          le: achat.payeLe ?? new Date(),
          page: `${URL_SITE}/`,
          personne: { ...achat.pubsMeta, email: achat.email },
          centimes: achat.centimes,
        }),
      ),
      "achat non envoyé à Meta",
      { achat: achat.id },
    );
  }
  await db().update(a).set({ pubsMeta: null }).where(eq(a.id, achatId));
}
