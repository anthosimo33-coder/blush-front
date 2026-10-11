import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

/*
 * Les tests sans base : des règles pures (tests/unit), les lectures de conv de prompts/lib, les scripts de vérification.
 * Ils forment le projet `unit`, que `npm run test:unit` lance sans Postgres avec le projet `client` (plus bas). Les
 * autres fichiers de tests/ gardent leur nom : la liste les désigne. Un test qui touche à la base va dans le projet
 * `db`, ailleurs que dans cette liste.
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
/*
 * Les tests du navigateur : les hooks et les composants des écrans (tests/client), dans un DOM simulé (happy-dom), rendus
 * par @testing-library/react. Sans base ni réseau : ce qu’ils appellent du serveur, ils le simulent (vi.mock).
 */
const CLIENT = ["tests/client/**/*.test.{ts,tsx}"];

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
    /* Les trois projets ont les mêmes variables : env() les lit toutes, même sans jamais ouvrir la base */
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST || "postgres://localhost:5432/blush_test",
      BLUSH_CLE: "dGVzdC10ZXN0LXRlc3QtdGVzdC10ZXN0LXRlc3QtMzI=",
      BLUSH_IA_FACTICE: "1",
      BLUSH_ALERTES: "equipe@blush.test",
    },
    /*
     * La couverture (`npm run check` et `npm run couverture`, donc la CI) : le code de src, ts et tsx, fichiers jamais
     * chargés compris, sans les textes générés des prompts ni les outils de l’équipe (/apercu, /styleguide, jamais en
     * ligne). Les seuils sont ceux mesurés au lot 9a (66,6 % des instructions, 59,7 % des branches, 59,9 % des fonctions,
     * 68,0 % des lignes), arrondis à l’unité en dessous : une baisse fait échouer la commande. Ils se relèvent quand la
     * couverture monte, et ne se baissent jamais pour faire passer un changement.
     */
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/server/ia/textes.generated.ts", "src/app/apercu/**", "src/app/styleguide/**"],
      reporter: ["text-summary", "html"],
      thresholds: { statements: 66, branches: 59, functions: 59, lines: 67 },
    },
    projects: [
      { extends: true, test: { name: "unit", include: UNITAIRES } },
      {
        extends: true,
        test: {
          name: "client",
          include: CLIENT,
          environment: "happy-dom",
          /* Chaque test démonte ce qu’il a rendu (tests/client/preparer.ts), et rend ses espions */
          setupFiles: ["tests/client/preparer.ts"],
          restoreMocks: true,
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["tests/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...UNITAIRES, ...CLIENT],
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
