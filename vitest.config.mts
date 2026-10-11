import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

/*
 * Les tests sans base : des règles pures (tests/unit), les lectures de conv de prompts/lib, les scripts de vérification.
 * Ils forment le projet `unit`, lancé seul par `npm run test:unit`, sans Postgres. Les autres fichiers de tests/ gardent
 * leur nom : la liste les désigne. Un test qui touche à la base va dans le projet `db`, ailleurs que dans cette liste.
 */
const SANS_BASE = [
  "boite-mails",
  "chapitres",
  "chiffrement",
  "conv-gardee",
  "defilement",
  "documentation",
  "erreurs-api",
  "formats",
  "garde",
  "instagram",
  "lecture",
  "lint",
  "memoire",
  "query",
  "verifier-fuite",
  "verifier-migrations",
  "verifier-typo",
  "vocabulaire",
  "vocal",
  "zip",
].map((nom) => `tests/${nom}.test.ts`);
const UNITAIRES = [...SANS_BASE, "tests/unit/**/*.test.ts"];

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@prompts": fileURLToPath(new URL("./prompts", import.meta.url)),
      /* server-only refuse d’être importé hors des composants serveur, client-only dans un composant serveur : dans les tests, ce sont des modules vides */
      "server-only": fileURLToPath(new URL("./tests/vide.ts", import.meta.url)),
      "client-only": fileURLToPath(new URL("./tests/vide.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    /* Les deux projets ont les mêmes variables : env() les lit toutes, même sans jamais ouvrir la base */
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST || "postgres://localhost:5432/blush_test",
      BLUSH_CLE: "dGVzdC10ZXN0LXRlc3QtdGVzdC10ZXN0LXRlc3QtMzI=",
      BLUSH_IA_FACTICE: "1",
      BLUSH_ALERTES: "equipe@blush.test",
    },
    projects: [
      { extends: true, test: { name: "unit", include: UNITAIRES } },
      {
        extends: true,
        test: {
          name: "db",
          include: ["tests/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...UNITAIRES],
          /*
           * La base des tests : DATABASE_URL_TEST (en CI, celle du service Postgres), ou blush_test en local. Un clone neuf
           * ou la CI n’ont rien à préparer à la main : tests/preparer-la-base.ts la crée si elle manque, la migre (drizzle/)
           * et remet ses limites et ses compteurs à zéro.
           */
          globalSetup: ["tests/preparer-la-base.ts"],
          /*
           * Un fichier après l’autre : tous écrivent dans la même base, et certains la parcourent en entier (la purge des
           * brouillons, les tâches bloquées du tableau de bord, les limites communes). Les espions (vi.spyOn) sont rendus
           * avant chaque test, et ce que les fixtures créent est effacé à la fin du fichier (tests/aide/isolation.ts).
           */
          fileParallelism: false,
          restoreMocks: true,
          setupFiles: ["tests/aide/isolation.ts"],
        },
      },
    ],
  },
});
