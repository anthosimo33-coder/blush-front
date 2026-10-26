#!/usr/bin/env node
/*
 * Un serveur des tests de bout en bout, lancé par Playwright (webServer de playwright.config.ts) :
 * 1. il vérifie que .next est le build fait par `npm run e2e:build` ;
 * 2. le premier serveur (E2E_PREPARER=1) recrée la base des tests, y applique les migrations de drizzle/, et vide la
 *    boîte à mails. C’est ici, pas dans un globalSetup : Playwright lance les serveurs avant le globalSetup ;
 * 3. il lance `next start` avec l’environnement des tests seulement : aucune clé d’API du shell ne passe.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const RACINE = fileURLToPath(new URL("../..", import.meta.url));
const { DATABASE_URL, BLUSH_BOITE_MAILS, E2E_PORT_SERVEUR } = process.env;

function arreter(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}
const lire = (chemin) => {
  try {
    return readFileSync(join(RACINE, chemin), "utf8");
  } catch {
    return null;
  }
};

if (!DATABASE_URL || !BLUSH_BOITE_MAILS || !E2E_PORT_SERVEUR) arreter("lance les tests avec `npm run e2e` (ce serveur prend ses réglages dans playwright.config.ts)");

/* 1. Le build : celui fait par `npm run e2e:build` (tests/e2e/construire.mjs pose sa marque) */
const buildId = lire(".next/BUILD_ID")?.trim();
if (!buildId) arreter("pas de build dans .next : lance d’abord `npm run e2e:build`");
let marque = null;
try {
  marque = JSON.parse(lire(".next/e2e-build.json") ?? "null");
} catch {
  /* une marque illisible : comme pas de marque */
}
if (marque?.buildId !== buildId) arreter("le build de .next n’est pas celui des tests : relance `npm run e2e:build`");

/*
 * `next start` lit aussi les fichiers .env du projet, sans écraser ce qu’on lui donne : une vraie clé d’API qui y traîne
 * ferait partir de vrais appels (une voix ElevenLabs, une alerte par Resend, un paiement chez Whop), et BLUSH_APERCU ou BLUSH_DEMANDER ouvriraient
 * les aperçus sur de vrais rapports des prompts (les tests y attendent une 404). On refuse plutôt que de les laisser passer.
 */
const INTERDITES = [
  "ANTHROPIC_API_KEY",
  "RESEND_API_KEY",
  "RESEND_API_KEY_CODES",
  "MISTRAL_API_KEY",
  "ELEVENLABS_API_KEY",
  "WHOP_API_KEY",
  "WHOP_WEBHOOK_SECRET",
  "VERCEL",
  "BLUSH_APERCU",
  "BLUSH_DEMANDER",
];
for (const fichier of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  const contenu = lire(fichier) ?? "";
  const trouvees = INTERDITES.filter((cle) => new RegExp(`^\\s*(?:export\\s+)?${cle}\\s*=`, "m").test(contenu));
  if (trouvees.length) arreter(`${fichier} définit ${trouvees.join(", ")} : \`next start\` les lirait pendant les tests. Retire-les de ${fichier} pour lancer les tests`);
}

/* 2. La base et la boîte à mails, à neuf (le premier serveur seulement : le second partage sa base) */
if (process.env.E2E_PREPARER === "1") {
  const url = new URL(DATABASE_URL);
  const nom = url.pathname.slice(1);
  /* Jamais une autre base que celle des tests : blush_dev, blush_test et les autres ne sont pas touchées */
  if (!/^blush_e2e[a-z0-9_]*$/.test(nom)) arreter(`base refusée : « ${nom} » (le nom doit commencer par blush_e2e)`);
  const serveurPg = new URL(DATABASE_URL);
  serveurPg.pathname = "/postgres";
  try {
    const admin = postgres(serveurPg.href, { max: 1, onnotice: () => {} });
    try {
      await admin.unsafe(`drop database if exists "${nom}" with (force)`);
      await admin.unsafe(`create database "${nom}"`);
    } finally {
      await admin.end();
    }
    const client = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle(client), { migrationsFolder: join(RACINE, "drizzle") });
    } finally {
      await client.end();
    }
  } catch (e) {
    arreter(`la base ${nom} n’a pas pu être recréée sur ${serveurPg.host} (Postgres est-il lancé ?) : ${e.message}`);
  }
  rmSync(BLUSH_BOITE_MAILS, { recursive: true, force: true });
  mkdirSync(BLUSH_BOITE_MAILS, { recursive: true });
  console.log(`base ${nom} recréée et migrée, boîte à mails vidée`);
}

/* 3. next start, avec l’environnement des tests et le strict nécessaire du système */
const SYSTEME = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "LC_ALL", "TERM", "CI"];
const TESTS = [
  "DATABASE_URL",
  "BLUSH_CLE",
  "BLUSH_IA_FACTICE",
  "BLUSH_PAIEMENT_FACTICE",
  "BLUSH_URL",
  "BLUSH_ACCES_LIBRE",
  "BLUSH_ALERTES",
  "BLUSH_ADMINS",
  "CRON_SECRET",
  "BLUSH_BETA_FERMEE",
  "BLUSH_BOITE_MAILS",
  "BLUSH_LECTURE_PARTIELLE",
  /* Les clés de test de Cloudflare (le CAPTCHA passe toujours, sans appel : src/server/captcha.ts) */
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
];
const envServeur = Object.fromEntries([...SYSTEME, ...TESTS].filter((cle) => process.env[cle] !== undefined).map((cle) => [cle, process.env[cle]]));
/*
 * Les requêtes des tests (request, page.request) gardent leurs connexions ouvertes d’une requête à l’autre. Node ferme
 * une connexion inutilisée au bout de 5 s : si une requête repart dessus au même instant, elle échoue (ECONNRESET).
 * Ici, une connexion inutilisée reste ouverte 10 minutes, plus longtemps qu’aucun test.
 */
const next = spawn(process.execPath, [join(RACINE, "node_modules/next/dist/bin/next"), "start", "-p", E2E_PORT_SERVEUR, "--keepAliveTimeout", "600000"], {
  cwd: RACINE,
  env: { ...envServeur, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => next.kill(signal));
next.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
