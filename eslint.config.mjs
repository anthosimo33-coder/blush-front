import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
