import { resolve } from "node:path";
import { CLES_DE_TEST_TURNSTILE } from "../../src/lib/captcha";

/*
 * Les réglages des tests de bout en bout, lus par playwright.config.ts (les serveurs) et par les aides (tests/e2e/aide).
 * Plusieurs suites peuvent tourner en même temps sur cette machine : chacune son port (E2E_PORT) et sa base (E2E_DB).
 * Tout est fictif : la clé de chiffrement, le secret de la purge, les emails (le domaine .test n’existe pas).
 */

/** La racine du projet. */
export const RACINE = resolve(__dirname, "../..");

export const PORT = Number(process.env.E2E_PORT ?? 3400);
/** Le second serveur, en bêta fermée (BLUSH_BETA_FERMEE=1), sur le port suivant : il sert les fichiers *.beta.spec.ts. */
export const PORT_BETA = PORT + 1;
export const URL_APPLI = `http://localhost:${PORT}`;
export const URL_BETA = `http://localhost:${PORT_BETA}`;

/** La base des tests, recréée à chaque lancement. Son nom commence toujours par blush_e2e : jamais blush_dev, blush_test… */
const NOM_BASE = process.env.E2E_DB ?? "blush_e2e";
if (!/^blush_e2e[a-z0-9_]*$/.test(NOM_BASE)) throw new Error(`E2E_DB doit commencer par blush_e2e (minuscules, chiffres, _) : « ${NOM_BASE} » refusé`);
/** Le serveur Postgres, sans la base (en local, celui de Homebrew ; en CI, celui du service). */
const POSTGRES = (process.env.E2E_POSTGRES ?? "postgres://localhost:5432").replace(/\/$/, "");
export const DATABASE_URL = `${POSTGRES}/${NOM_BASE}`;

/** La boîte à mails du serveur (BLUSH_BOITE_MAILS) : un fichier JSON par mail, vidée à chaque lancement. */
export const BOITE_MAILS = resolve(RACINE, `test-results/boite-mails-${PORT}`);

/** Une clé de chiffrement fictive (32 octets en base64), pour ces tests seulement. */
export const CLE = "Y2xlLWZpY3RpdmUtZGVzLXRlc3RzLWUyZS1ibHVzaCE=";
export const CRON_SECRET = "secret-fictif-de-la-purge-e2e";

/**
 * Les clés de test de Cloudflare qui passent toujours (src/lib/captcha.ts) : la publique est écrite dans les pages au build
 * (tests/e2e/construire.mjs), la secrète fait répondre le serveur sans appeler Cloudflare (src/server/captcha.ts).
 */
export const TURNSTILE = { publique: CLES_DE_TEST_TURNSTILE.publiques[0], secrete: CLES_DE_TEST_TURNSTILE.secretes[0] };

export const DOMAINE = "e2e.blush.test";
/** L’équipe : reçoit les alertes (BLUSH_ALERTES) et ouvre /admin (BLUSH_ADMINS). */
export const ADMIN = `admin@${DOMAINE}`;
/** Les workers en parallèle au plus (playwright test --workers) : chacun a ses invités. */
const WORKERS_MAX = 16;
/**
 * Les invités (BLUSH_ACCES_LIBRE) : de l’équipe (tous leurs rapports ouverts, bulles illimitées), et les seuls à entrer
 * sur le serveur en bêta fermée. Deux par worker (invite-<worker>-<0|1>@e2e.blush.test), effacés au début de chaque test
 * qui les prend (aide/emails.ts) : jamais deux tests en même temps sur le même compte. Tout autre email paie.
 */
export const INVITES = Array.from({ length: WORKERS_MAX }, (_, w) => [0, 1].map((k) => `invite-${w}-${k}@${DOMAINE}`)).flat();
