#!/usr/bin/env node
/*
 * Au build sur Vercel : met la base à jour (les migrations de drizzle/), avant de construire l’appli.
 * L’URL de la base n’existe que dans Vercel : on n’a jamais besoin de la voir. Sans base, rien à faire.
 * Hors de Vercel, rien non plus : en local, c’est `npm run dev` qui migre la base (scripts/developper.mjs), ou `npm run db:migrer`.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/* Neon : l’URL sans pooler pour les migrations (Vercel la nomme DATABASE_URL_UNPOOLED) */
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!process.env.VERCEL || !url) {
  console.log("migrations : rien à faire ici");
  process.exit(0);
}
const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  console.log("migrations : base à jour");
} finally {
  await client.end();
}
