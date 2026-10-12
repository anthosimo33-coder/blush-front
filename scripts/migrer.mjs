#!/usr/bin/env node
/*
 * Met une base à jour (les migrations de drizzle/), en refusant une migration que drizzle sauterait : plus ancienne que
 * la dernière appliquée, jamais appliquée elle-même (migrationsSautees, scripts/base.mjs). Elle arrête tout au lieu de
 * partir en silence.
 *
 * `node scripts/migrer.mjs` : au build de la production sur Vercel, en `postbuild`, une fois `next build` réussi. Un
 * build raté ne touche donc jamais la base, et la base n’est en avance sur la version en ligne que le temps de l’envoi et
 * de la promotion (BACKEND.md, « Les migrations »). L’URL de la base n’existe que dans Vercel : on n’a jamais besoin de
 * la voir. Seulement en production (VERCEL_ENV=production, S-45) : une prévisualisation ne touche jamais la base, même si
 * elle en avait l’URL. Ailleurs, rien à faire : en local, c’est `npm run dev` qui migre la base (scripts/developper.mjs).
 *
 * Puis les rattrapages de données (rattraper, scripts/base.mjs : les testeurs de la bêta), qui se rejouent sans effet.
 *
 * `npm run db:migrer` (`--ici`) : la base de DATABASE_URL (par défaut blush_dev sur ce poste), à la main, avec la même
 * garde.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { migrationsSautees, rattraper, sslPour } from "./base.mjs";

const ici = process.argv.includes("--ici");
/* Neon : l’URL sans pooler pour les migrations (Vercel la nomme DATABASE_URL_UNPOOLED) */
const url = ici ? (process.env.DATABASE_URL ?? "postgres://localhost:5432/blush_dev") : process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!ici && (process.env.VERCEL_ENV !== "production" || !url)) {
  console.log("migrations : rien à faire ici");
  process.exit(0);
}
const client = postgres(url, { max: 1, onnotice: () => {}, ssl: sslPour(url) });
try {
  const [{ existe }] = await client`select to_regclass('drizzle.__drizzle_migrations') is not null as existe`;
  const appliquees = existe ? (await client`select created_at from drizzle.__drizzle_migrations`).map((l) => Number(l.created_at)) : [];
  const { entries } = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  const sautees = migrationsSautees(entries, appliquees);
  if (sautees.length) {
    console.error(
      `✗ migrations : ${sautees.map((e) => e.tag).join(", ")} ${sautees.length > 1 ? "sont plus anciennes" : "est plus ancienne"} que la dernière appliquée à la base, ` +
        `et drizzle ${sautees.length > 1 ? "les sauterait. Régénère-les" : "la sauterait. Régénère-la"} après le rebase (BACKEND.md, « Les migrations »).`,
    );
    process.exitCode = 1;
  } else {
    await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
    /* Ce que les migrations générées ne font pas (les testeurs de la bêta) : une fois, rejouable sans effet */
    await rattraper(client);
    console.log("migrations : base à jour");
  }
} finally {
  await client.end();
}
