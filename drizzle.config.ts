import { defineConfig } from "drizzle-kit";

/* Migrations versionnées dans drizzle/ : `npx drizzle-kit generate` après un changement de schéma, `npm run db:migrer` pour les appliquer. */
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost:5432/blush_dev" },
});
