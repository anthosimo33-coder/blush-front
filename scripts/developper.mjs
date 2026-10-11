#!/usr/bin/env node
/*
 * `npm run dev` : l’appli en local, avec son back-end, sur une base Postgres de ce poste et le modèle factice.
 * 1. les fichiers .env du projet, comme `next dev` (.env.development.local, .env.local, .env.development, .env) ; ce
 *    qu’ils ne donnent pas : la base blush_dev de ce poste et le modèle factice (BLUSH_IA_FACTICE=1). Ce qu’on donne dans
 *    le shell l’emporte toujours ;
 * 2. BLUSH_CLE est exigée : sans fichier .env (cp .env.example .env.development.local) ni BLUSH_CLE dans le shell, rien
 *    ne démarre. Et le modèle factice refuse les vraies clés d’API ;
 * 3. une base locale est créée si elle manque (jamais effacée), puis les migrations de drizzle/ y sont appliquées ;
 * 4. puis `next dev`, avec les arguments donnés (npm run dev -- -p 3001), sur ce poste seulement (127.0.0.1) : next dev
 *    écoute sinon sur toutes les interfaces (0.0.0.0), et le Wi-Fi joindrait l’appli et les outils de l’équipe (/apercu,
 *    dont /apercu/demander, qui appelle le vrai modèle avec ta clé). Pour un téléphone du réseau, le dire soi-même :
 *    npm run dev -- -H 0.0.0.0.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { estLocale } from "./base.mjs";

const RACINE = fileURLToPath(new URL("..", import.meta.url));

function arreter(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/* 1. L’environnement : celui du shell, puis les fichiers .env (next dev les relira lui-même), puis les valeurs par défaut */
const shell = { ...process.env };
nextEnv.loadEnvConfig(RACINE, true, { info: () => {}, error: console.error });
const parDefaut = {};
if (!process.env.DATABASE_URL) parDefaut.DATABASE_URL = process.env.DATABASE_URL = "postgres://localhost:5432/blush_dev";
if (!process.env.BLUSH_IA_FACTICE) parDefaut.BLUSH_IA_FACTICE = process.env.BLUSH_IA_FACTICE = "1";

/* 2. La clé de chiffrement, et pas de vraie clé d’API avec le modèle factice */
if (!process.env.BLUSH_CLE) arreter("BLUSH_CLE manque : copie la configuration de dev (cp .env.example .env.development.local), puis relance `npm run dev`");
/*
 * Le modèle factice ne coûte rien, mais une vraie clé qui traîne ferait quand même partir de vrais appels (une voix
 * ElevenLabs, un mail par Resend). On refuse plutôt que de la laisser passer.
 */
const INTERDITES = ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "RESEND_API_KEY_CODES", "MISTRAL_API_KEY", "ELEVENLABS_API_KEY"];
const trouvees = process.env.BLUSH_IA_FACTICE === "1" ? INTERDITES.filter((cle) => process.env[cle]) : [];
if (trouvees.length) arreter(`le modèle factice (BLUSH_IA_FACTICE=1) avec ${trouvees.join(", ")} : de vrais appels partiraient. Retire-les, ou lance le vrai modèle avec BLUSH_IA_FACTICE=0`);

/* 3. La base : créée si elle manque, jamais effacée, puis migrée. Seulement sur ce poste : une base distante reste telle quelle */
const url = new URL(process.env.DATABASE_URL);
const nom = decodeURIComponent(url.pathname.slice(1));
if (estLocale(url.href)) {
  const serveurPg = new URL(url.href);
  serveurPg.pathname = "/postgres";
  try {
    const admin = postgres(serveurPg.href, { max: 1, onnotice: () => {} });
    try {
      const [existe] = await admin`select 1 from pg_database where datname = ${nom}`;
      if (!existe) {
        await admin.unsafe(`create database "${nom.replaceAll('"', '""')}"`);
        console.log(`base ${nom} créée`);
      }
    } finally {
      await admin.end();
    }
    const client = postgres(url.href, { max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle(client), { migrationsFolder: join(RACINE, "drizzle") });
    } finally {
      await client.end();
    }
  } catch (e) {
    arreter(`la base ${nom} n’a pas pu être préparée sur ${url.host} (Postgres est-il lancé ?) : ${e.message}`);
  }
  console.log(`base ${nom} à jour`);
} else console.log(`base ${nom} sur ${url.host} : ni créée ni migrée ici (npm run db:migrer)`);

/* 4. next dev, avec l’environnement du shell et les valeurs par défaut (les fichiers .env, il les lit lui-même), sur 127.0.0.1 sauf -H donné */
const args = process.argv.slice(2);
const hote = args.some((a) => a === "-H" || a === "--hostname" || a.startsWith("--hostname=")) ? [] : ["-H", "127.0.0.1"];
const next = spawn(process.execPath, [join(RACINE, "node_modules/next/dist/bin/next"), "dev", ...hote, ...args], {
  cwd: RACINE,
  env: { ...shell, ...parDefaut },
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => next.kill(signal));
next.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
