import { champsEditeurManquants, EDITEUR } from "@/contenu/mentions-legales";

/*
 * Les drapeaux lus sans le schéma d’env.ts, et sans server-only : src/proxy.ts (qui ne tourne pas parmi les composants
 * serveur) et les pages rendues au build, sans les secrets, ne peuvent pas appeler env(). Rien de secret ici : où tourne
 * l’appli, la bêta fermée (et la seule présence de ce que son ouverture exige), et les chemins des aperçus locaux. Avec
 * env.ts, le seul fichier qui lit process.env, NODE_ENV mis à part (ESLint). Il n’importe que des constantes et des
 * fonctions pures de src/contenu : ni server-only, ni la base.
 */

/** Sur Vercel, en ligne ou en préversion. Jamais en local, ni sur le serveur des tests de bout en bout. */
export const surVercel = () => !!process.env.VERCEL;

/** La production de Vercel (VERCEL_ENV), pas une préversion : env() y refuse une configuration dangereuse (src/server/env.ts). */
export const enProduction = () => process.env.VERCEL_ENV === "production";

/**
 * Les outils de l’équipe (/apercu, /styleguide) s’ouvrent-ils ici ? Jamais sur Vercel, ni en ligne ni en préversion : en
 * local et sur le serveur des tests, oui. Le seul critère, appliqué par src/proxy.ts (404).
 */
export const outilsDeLEquipe = () => !surVercel();

/** Les quatre variables de Whop : toutes, ou aucune (env() refuse la moitié en production). */
export const VARIABLES_WHOP = ["WHOP_API_KEY", "WHOP_WEBHOOK_SECRET", "WHOP_ACCOUNT_ID", "WHOP_PRODUCT_ID"] as const;

/**
 * Ce qui manque à la production pour s’ouvrir au public, chaque manque nommé : le paiement (aucune variable de Whop), le
 * CAPTCHA (sa clé secrète) et l’identité de l’éditeur (src/contenu/mentions-legales.ts). Une seule de ces absences, et la
 * bêta reste fermée même écrite BLUSH_BETA_FERMEE=0 : ici pour le proxy (betaFermee), dans env() pour le serveur, qui
 * prévient l’équipe. Jamais une panne : ce qui est dangereux (Whop à moitié configuré, une clé de test…) reste refusé
 * par env(). Hors de la production (le dev, les tests, les préversions) : rien ne manque.
 */
export function manquesPourOuvrir(): string[] {
  if (!enProduction()) return [];
  const manques: string[] = [];
  if (!VARIABLES_WHOP.some((v) => process.env[v])) manques.push(`le paiement (Whop, aucune de ses variables ${VARIABLES_WHOP.join(", ")})`);
  if (!process.env.TURNSTILE_SECRET_KEY) manques.push("le CAPTCHA (TURNSTILE_SECRET_KEY)");
  const editeur = champsEditeurManquants(EDITEUR);
  if (editeur.length) manques.push(`l’identité de l’éditeur (src/contenu/mentions-legales.ts, il manque ${editeur.join(", ")})`);
  return manques;
}

/**
 * La bêta fermée, lue à l’exécution : un même build sert la bêta ouverte ou fermée. Fermée quand BLUSH_BETA_FERMEE=1, ou
 * en production tant que son ouverture n’a pas ce qu’elle exige (manquesPourOuvrir) : la même réponse que
 * env().BLUSH_BETA_FERMEE, que peutEntrer lit sur le serveur (tests/ouverture.test.ts le vérifie).
 */
export const betaFermee = () => process.env.BLUSH_BETA_FERMEE === "1" || manquesPourOuvrir().length > 0;

/** Les aperçus locaux (/apercu) : le fichier ou le dossier des rapports écrits par les prompts (BLUSH_APERCU), ou null. */
export const cheminDesApercus = () => process.env.BLUSH_APERCU || null;

/** Le vrai chat des aperçus (/apercu/demander) : le fichier de sa configuration (BLUSH_DEMANDER), ou null. */
export const configDuChatLocal = () => process.env.BLUSH_DEMANDER || null;
