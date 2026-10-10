import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
 * Un import vers un dossier de src, écrit avec l’alias ou en chemin relatif : `@/server/db`, `../../server/db`, `./server`.
 * Pas `next/server` ni `react-dom/server`, qui ne sont pas à nous.
 */
const versSrc = (chemin) => `^(@|\\.\\.?)(/\\.\\.)*/${chemin}`;
/* Une variable CSS se passe dans `style` sans cast (src/types/css.d.ts) : `as CSSProperties` couperait la vérification de tout l’objet */
const PAS_DE_CAST_CSS = [
  { selector: "TSAsExpression > TSTypeReference > Identifier[name='CSSProperties']", message: "Pas de `as CSSProperties` : les variables CSS (--d, --r…) sont permises dans `style` (src/types/css.d.ts)." },
  { selector: "TSAsExpression > TSTypeReference > TSQualifiedName[right.name='CSSProperties']", message: "Pas de `as CSSProperties` : les variables CSS (--d, --r…) sont permises dans `style` (src/types/css.d.ts)." },
];
const NAVIGATEUR_SANS_SERVEUR = "Le navigateur ne lit pas le serveur : une page serveur passe par src/services/serveur.ts, un écran par les routes /api (src/services/api.ts).";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // L’appli tourne toujours sur son back-end : jamais de données factices dans son code (le contenu du produit est dans src/contenu).
  // Les seules qui restent servent aux aperçus locaux (src/app/apercu, 404 en production) : aucun autre fichier ne les importe.
  // src/mocks n’existe plus : la règle empêche seulement qu’il revienne.
  {
    files: ["src/**"],
    ignores: ["src/app/apercu/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/mocks", "@/mocks/*"], message: "Pas de données factices dans l’appli : le contenu du produit vit dans src/contenu." },
            { group: ["@/app/apercu", "@/app/apercu/*", "**/apercu/*"], message: "Les aperçus (/apercu) gardent des données fictives : aucun écran de l’appli ne les importe." },
          ],
        },
      ],
    },
  },
  // Une variable CSS sans `as CSSProperties` (PAS_DE_CAST_CSS). Le bloc du navigateur, plus bas, reprend ces sélecteurs :
  // un bloc qui redonne no-restricted-syntax remplace toute sa liste.
  {
    files: ["src/**/*.tsx", "src/**/*.ts"],
    rules: { "no-restricted-syntax": ["error", ...PAS_DE_CAST_CSS] },
  },
  // Les frontières entre couches. Un `import type` passe toujours : il disparaît à la compilation.
  // Le navigateur ne touche pas au serveur : tout src, sauf ce qui tourne sur le serveur (src/server, les routes /api, les
  // fichiers que Next rend sur le serveur, serveur.ts qui les sert, ConvDeLaPage et le proxy). Ni par l’alias, ni en chemin
  // relatif, ni par un import() dynamique. Seul server-only le disait, et au build ; schema.ts et les mails ne l’ont pas.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/server/**",
      "src/app/api/**",
      "src/app/**/{page,layout,route,loading,not-found,template,default}.{ts,tsx}",
      "src/app/**/{opengraph-image,twitter-image,icon,apple-icon,sitemap,robots,manifest}.{ts,tsx}",
      "src/services/serveur.ts",
      "src/components/shell/ConvDeLaPage.tsx",
      "src/proxy.ts",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", { patterns: [{ regex: `${versSrc("server")}(/|$)`, allowTypeImports: true, message: NAVIGATEUR_SANS_SERVEUR }] }],
      "no-restricted-syntax": ["error", ...PAS_DE_CAST_CSS, { selector: `ImportExpression[source.value=/${versSrc("server").replaceAll("/", "\\u002F")}/]`, message: NAVIGATEUR_SANS_SERVEUR }],
    },
  },
  // Le serveur ne passe pas par la couche du navigateur. donnees.ts lit encore des types d’api.ts (ils iront dans src/types/api.ts au lot 3).
  {
    files: ["src/server/**", "src/app/api/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: `${versSrc("services/api")}$`, allowTypeImports: true, message: "src/services/api.ts appelle les routes /api depuis le navigateur : le serveur lit ses propres modules (src/server)." },
            { regex: `${versSrc("lib/query")}$`, allowTypeImports: true, message: "Le cache des requêtes vit dans le navigateur : le serveur n’en a pas." },
            { regex: `${versSrc("state")}(/|$)`, allowTypeImports: true, message: "L’état du parcours vit dans le navigateur : le serveur lit la base." },
          ],
        },
      ],
    },
  },
  // Le sous-module des prompts ne dépend pas de l’appli (seulement vérifié ici : il ne change pas avec elle).
  {
    files: ["prompts/lib/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: "^@/", message: "prompts/lib est un sous-module à part : il n’importe rien de l’appli (src)." }] }],
    },
  },
  // Les promesses du serveur : une promesse oubliée (ni attendue, ni `void`) échoue sans que personne le voie.
  // Avertissements pour l’instant, des erreurs au lot 3. Ces règles lisent les types (projectService) : seulement ici.
  {
    files: ["src/server/**/*.{ts,tsx}", "src/app/api/**/*.ts"],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
    },
  },
  // Un `eslint-disable` qui ne désactive plus rien est une erreur : il cacherait la prochaine vraie.
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Le banc de test des prompts (scripts .mjs) et le module généré des textes.
    "prompts/evals/**",
    "src/server/ia/textes.generated.ts",
    // Les résultats des tests de bout en bout (le rapport HTML de Playwright embarque son propre code).
    "test-results/**",
    "playwright-report*/**",
  ]),
]);

export default eslintConfig;
