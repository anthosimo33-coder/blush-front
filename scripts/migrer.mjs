#!/usr/bin/env node
/*
 * Au build de la production sur Vercel : met la base à jour (les migrations de drizzle/), avant de construire l’appli.
 * L’URL de la base n’existe que dans Vercel : on n’a jamais besoin de la voir. Sans base, rien à faire.
 * Seulement en production (VERCEL_ENV=production, S-45) : une prévisualisation ne touche jamais la base, même si elle en
 * avait l’URL. Hors de Vercel, rien non plus : en local, c’est `npm run dev` qui migre la base (scripts/developper.mjs),
 * ou `npm run db:migrer`.
 * Une migration que drizzle sauterait (plus ancienne que la dernière appliquée, jamais appliquée elle-même) arrête le
 * build au lieu de partir en silence (migrationsSautees, scripts/base.mjs).
 */
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { migrationsSautees, sslPour } from "./base.mjs";

/* Neon : l’URL sans pooler pour les migrations (Vercel la nomme DATABASE_URL_UNPOOLED) */
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (process.env.VERCEL_ENV !== "production" || !url) {
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
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    console.log("migrations : base à jour");
  }
} finally {
  await client.end();
}
