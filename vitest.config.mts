import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@prompts": fileURLToPath(new URL("./prompts", import.meta.url)),
      /* server-only refuse d’être importé hors des composants serveur : dans les tests, c’est un module vide */
      "server-only": fileURLToPath(new URL("./tests/vide.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    /*
     * La base des tests : DATABASE_URL_TEST (en CI, celle du service Postgres), ou blush_test en local. Un clone neuf ou
     * la CI n’ont rien à préparer à la main : tests/preparer-la-base.ts la crée si elle manque, puis la migre (drizzle/).
     */
    globalSetup: ["tests/preparer-la-base.ts"],
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST || "postgres://localhost:5432/blush_test",
      BLUSH_CLE: "dGVzdC10ZXN0LXRlc3QtdGVzdC10ZXN0LXRlc3QtMzI=",
      BLUSH_IA_FACTICE: "1",
      BLUSH_ALERTES: "equipe@blush.test",
    },
  },
});
