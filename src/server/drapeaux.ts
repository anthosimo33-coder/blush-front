/*
 * Les drapeaux lus sans le schéma d’env.ts, et sans server-only : src/proxy.ts (qui ne tourne pas parmi les composants
 * serveur) et les pages rendues au build, sans les secrets, ne peuvent pas appeler env(). Rien de secret ici : où tourne
 * l’appli, la bêta fermée, et les chemins des aperçus locaux. Avec env.ts, le seul fichier qui lit process.env (ESLint).
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

/**
 * La bêta fermée (BLUSH_BETA_FERMEE=1), lue à l’exécution : un même build sert la bêta ouverte ou fermée. Validée par
 * env(), qui l’exige en production : peutEntrer la lit là-bas.
 */
export const betaFermee = () => process.env.BLUSH_BETA_FERMEE === "1";

/** Les aperçus locaux (/apercu) : le fichier ou le dossier des rapports écrits par les prompts (BLUSH_APERCU), ou null. */
export const cheminDesApercus = () => process.env.BLUSH_APERCU || null;

/** Le vrai chat des aperçus (/apercu/demander) : le fichier de sa configuration (BLUSH_DEMANDER), ou null. */
export const configDuChatLocal = () => process.env.BLUSH_DEMANDER || null;
