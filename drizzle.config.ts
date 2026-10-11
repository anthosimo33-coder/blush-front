import { defineConfig } from "drizzle-kit";
import { urlVerifiee } from "./scripts/base.mjs";

/*
 * Migrations versionnées dans drizzle/ : `npx drizzle-kit generate` après un changement de schéma, `npm run db:migrer` pour
 * les appliquer. Hors de la machine, le certificat de la base est vérifié (urlVerifiee, scripts/base.mjs : S-36).
 */
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: urlVerifiee(process.env.DATABASE_URL ?? "postgres://localhost:5432/blush_dev") },
});
