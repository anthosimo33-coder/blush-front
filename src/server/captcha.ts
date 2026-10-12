import "server-only";
import { after } from "next/server";
import { ACTIONS_CAPTCHA, CLES_DE_TEST_TURNSTILE, ENTETE_CAPTCHA, type ActionCaptcha } from "@/lib/captcha";
import { alerter } from "./alertes";
import { utilisateurDeSession, type Utilisateur } from "./auth";
import { empreinte, jeton as tirerJeton, memeEmpreinte } from "./chiffrement";
import { lireHumain, lireSession, poserHumain } from "./cookies";
import { surVercel } from "./drapeaux";
import { env } from "./env";
import { erreur } from "./http";
import { journal } from "./journal";
import { adresseDe, ipDe, LIMITES, sousLaLimite } from "./limites";

/*
 * Le CAPTCHA (Cloudflare Turnstile) : la porte que franchit un visiteur sans compte avant que BLUSH ne travaille pour lui
 * (un mail de code, une conv importée, des captures lues par le modèle payant). Le widget, dans la page, rend un jeton à
 * usage unique ; le serveur le fait vérifier par Cloudflare (siteverify), avec l’adresse IP, AVANT de compter quoi que
 * ce soit : un jeton refusé n’use aucune limite. Sans TURNSTILE_SECRET_KEY, pas de CAPTCHA (le dev sans clés, la bêta
 * fermée d’aujourd’hui) ; env() l’exige en production dès que la bêta est ouverte.
 * - La demande de code (/api/auth/code) : le jeton dans l’en-tête ENTETE_CAPTCHA, un par demande (jetonRefuse).
 * - Les imports sans compte (un export, des captures, un enregistrement d’écran lu par lots) : le jeton s’échange d’abord
 *   contre un laissez-passer (/api/captcha, un cookie signé de 20 minutes), que les routes de l’import comptent
 *   (humainRefuse). Un enregistrement envoie jusqu’à cinq lots à la fois : chacun ne peut pas avoir son jeton, et une
 *   lecture coupée par le réseau se reprend sans en redemander un. Un laissez-passer vaut pour un import (et son nouvel
 *   essai) et les lots d’un enregistrement : le navigateur en demande un neuf à chaque import.
 * Cloudflare injoignable (le réseau, une panne, sa réponse illisible) : on laisse passer, et l’équipe est prévenue. Ce
 * n’est pas une porte qu’un visiteur peut ouvrir (il ne choisit pas comment notre serveur joint Cloudflare), et les
 * limites par adresse et pour tous tiennent toujours ; fermer, ce serait fermer la connexion à tout le monde pendant la
 * panne. Une clé secrète refusée par Cloudflare (une erreur de configuration), elle, ferme : le CAPTCHA ne protège plus
 * rien sans elle, et l’alerte part en importante.
 */

/** La vérification d’un jeton : bon, refusé, ou Cloudflare injoignable (on laisse passer, voir l’en-tête). */
export type Verdict = "ok" | "refuse" | "injoignable";

/** L’adresse de la vérification chez Cloudflare. */
export const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Le plus long qu’on attend Cloudflare : la demande de code doit répondre vite, et un Cloudflare lent compte comme injoignable. */
export const DELAI_SITEVERIFY_MS = 3_000;
/** La longueur d’un jeton, au plus (Cloudflare : 2048 caractères) : au-delà, refusé sans appel. */
const JETON_MAX = 2048;
/** La durée d’un laissez-passer : de quoi lire un enregistrement d’écran et le rassembler, avec une reprise. */
export const LAISSEZ_PASSER_S = 20 * 60;

/** Le CAPTCHA est-il en place (la clé secrète posée) ? */
export const captchaActif = (): boolean => !!env().TURNSTILE_SECRET_KEY;

/* La réponse de siteverify, ce qu’on en lit */
type Reponse = { success?: unknown; "error-codes"?: unknown; action?: unknown };

/* Ce que répond Cloudflare pour une de ses clés secrètes de test (CLES_DE_TEST_TURNSTILE), comme il le documente */
function verdictDeTest(secret: string): Verdict | null {
  const [passe, echoue, dejaVu] = CLES_DE_TEST_TURNSTILE.secretes;
  if (secret === passe) return "ok";
  if (secret === echoue || secret === dejaVu) return "refuse";
  return null;
}

/**
 * Fait vérifier un jeton du widget par Cloudflare (siteverify), avec l’adresse IP de la requête quand on l’a, et
 * l’action attendue : un jeton tiré pour une autre action est refusé. Sans jeton (ou trop long) : refusé, sans appel. Les
 * clés secrètes de test répondent ici, hors de Vercel, sans appel (le dev et les tests de bout en bout restent hors
 * ligne) ; sur Vercel, Cloudflare répond pour elles (une préversion), et env() les refuse en production.
 */
export async function verifierJeton(jeton: string | null | undefined, { ip, action }: { ip: string | null; action: ActionCaptcha }): Promise<Verdict> {
  const secret = env().TURNSTILE_SECRET_KEY;
  if (!secret) return "ok";
  if (!jeton || jeton.length > JETON_MAX) return "refuse";
  const deTest = surVercel() ? null : verdictDeTest(secret);
  if (deTest) return deTest;
  let reponse: Reponse;
  try {
    const r = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, response: jeton, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(DELAI_SITEVERIFY_MS),
    });
    /* Une panne chez eux : injoignable. Une requête qu’ils refusent (4xx) : la nôtre est fausse, refusée */
    if (r.status >= 500) return "injoignable";
    reponse = (await r.json()) as Reponse;
    if (!r.ok) return erreursDe(reponse).includes("internal-error") ? "injoignable" : "refuse";
  } catch {
    /* Le réseau, le délai dépassé, une réponse qui n’est pas du JSON */
    return "injoignable";
  }
  if (reponse.success === true) return typeof reponse.action === "string" && reponse.action && reponse.action !== ACTIONS_CAPTCHA[action] ? "refuse" : "ok";
  const erreurs = erreursDe(reponse);
  if (erreurs.includes("internal-error")) return "injoignable";
  if (erreurs.some((e) => e === "invalid-input-secret" || e === "missing-input-secret")) cleRefusee();
  return "refuse";
}

const erreursDe = (r: Reponse): string[] => (Array.isArray(r["error-codes"]) ? r["error-codes"].filter((e): e is string => typeof e === "string") : []);

/* La clé secrète refusée par Cloudflare : plus personne sans compte ne passe. Une alerte importante, après la réponse */
function cleRefusee(): void {
  journal("CAPTCHA : clé secrète refusée par Cloudflare", {}, "erreur");
  after(() =>
    alerter(
      "CAPTCHA : clé secrète refusée",
      ["Cloudflare refuse TURNSTILE_SECRET_KEY : plus personne sans compte ne demande de code ni n’importe.", "À corriger dans les variables de Vercel."],
      { importante: true },
    ),
  );
}

/** Un jeton bon pour cette action ? Cloudflare injoignable : oui, et l’équipe est prévenue (voir l’en-tête). */
async function jetonAccepte(jeton: string | null | undefined, ip: string | null, action: ActionCaptcha): Promise<boolean> {
  const verdict = await verifierJeton(jeton, { ip, action });
  if (verdict !== "injoignable") return verdict === "ok";
  journal("CAPTCHA : Cloudflare injoignable, la requête passe", { action }, "alerte");
  after(() =>
    alerter("CAPTCHA : Cloudflare injoignable", [
      "La vérification du CAPTCHA n’a pas répondu (le réseau, le délai de 3 s, ou une panne chez Cloudflare) : les requêtes passent sans lui.",
      "Les limites par adresse et pour tous tiennent toujours.",
    ]),
  );
  return true;
}

/**
 * La demande de code : le jeton du widget, dans l’en-tête ENTETE_CAPTCHA. Rend la réponse 403 « captcha » à renvoyer
 * telle quelle, ou null : il passe (ou pas de CAPTCHA). À appeler avant toute limite.
 */
export async function jetonRefuse(req: Request, action: ActionCaptcha): Promise<Response | null> {
  if (!captchaActif()) return null;
  return (await jetonAccepte(req.headers.get(ENTETE_CAPTCHA), adresseDe(req), action)) ? null : erreur("captcha");
}

/* ———— Le laissez-passer des imports ———— */

/** Ce qu’un laissez-passer compte, chacun sa limite : un import (et son nouvel essai), les lots d’un enregistrement. */
export type UsageDuPasse = "brouillon" | "lot";
const LIMITE_DE = { brouillon: LIMITES.laissezPasserBrouillons, lot: LIMITES.laissezPasserLots } as const;

/* Ce que signe un laissez-passer : son identifiant et sa fin (en ms) */
const signe = (id: string, fin: number) => `humain:${id}.${fin}`;

/**
 * Échange un jeton du widget contre un laissez-passer (POST /api/captcha) : un cookie httpOnly, signé (empreinte de
 * chiffrement.ts), valable LAISSEZ_PASSER_S. Rend la réponse d’erreur à renvoyer (403 « captcha », ou 429 « trop » au-delà
 * de captchaParIp, compté avant d’appeler Cloudflare), ou null : posé. Un compte connecté n’en a pas besoin (ni le
 * serveur sans CAPTCHA) : rien n’est vérifié, compté ni posé.
 */
export async function echangerJeton(req: Request): Promise<Response | null> {
  if (!captchaActif() || (await utilisateurDeSession(await lireSession()))) return null;
  if (!(await sousLaLimite(`captcha:ip:${ipDe(req)}`, LIMITES.captchaParIp))) return erreur("trop");
  if (!(await jetonAccepte(req.headers.get(ENTETE_CAPTCHA), adresseDe(req), "import"))) return erreur("captcha");
  const id = tirerJeton().slice(0, 22);
  const fin = Date.now() + LAISSEZ_PASSER_S * 1000;
  await poserHumain(`${id}.${fin}.${empreinte(signe(id, fin))}`, new Date(fin));
  return null;
}

/* L’identifiant du laissez-passer de ce navigateur, s’il est bien signé et pas expiré */
async function laissezPasser(): Promise<string | null> {
  const [id, fin, signature, ...reste] = ((await lireHumain()) ?? "").split(".");
  if (!id || !fin || !signature || reste.length || !/^\d{13}$/.test(fin)) return null;
  if (Number(fin) < Date.now() || !memeEmpreinte(signe(id, Number(fin)), signature)) return null;
  return id;
}

/**
 * Les routes de l’import : un compte connecté passe ; un visiteur sans compte montre son laissez-passer, compté pour cet
 * usage (un import et son nouvel essai, ou les lots d’un enregistrement). Rend la réponse 403 « captcha » à renvoyer, ou
 * null : il passe (ou pas de CAPTCHA). À appeler avant toute limite. `utilisateur` : le compte, quand la route l’a déjà lu.
 */
export async function humainRefuse(usage: UsageDuPasse, utilisateur?: Utilisateur | null): Promise<Response | null> {
  if (!captchaActif()) return null;
  if (utilisateur !== undefined ? utilisateur : await utilisateurDeSession(await lireSession())) return null;
  const id = await laissezPasser();
  if (id && (await sousLaLimite(`humain:${id}:${usage}`, LIMITE_DE[usage]))) return null;
  return erreur("captcha");
}
