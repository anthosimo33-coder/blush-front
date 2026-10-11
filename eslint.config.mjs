import { readFileSync } from "node:fs";
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
  {
    selector: "TSAsExpression > TSTypeReference > Identifier[name='CSSProperties']",
    message: "Pas de `as CSSProperties` : les variables CSS (--d, --r…) sont permises dans `style` (src/types/css.d.ts).",
  },
  {
    selector: "TSAsExpression > TSTypeReference > TSQualifiedName[right.name='CSSProperties']",
    message: "Pas de `as CSSProperties` : les variables CSS (--d, --r…) sont permises dans `style` (src/types/css.d.ts).",
  },
];
/* Le sélecteur d’un import() dynamique dont le chemin suit cette regex (un motif de no-restricted-imports) */
const dynamique = (regex, message) => ({ selector: `ImportExpression[source.value=/${regex.replaceAll("/", "\\u002F")}/]`, message });
const NAVIGATEUR_SANS_SERVEUR = "Le navigateur ne lit pas le serveur : une page serveur passe par src/services/serveur.ts, un écran par les routes /api (src/services/api.ts).";
/*
 * La configuration se lit à deux endroits : env() (src/server/env.ts, son schéma) et src/server/drapeaux.ts (le proxy et
 * les pages rendues au build). Ailleurs dans src, process.env ne sert qu’à NODE_ENV, que Next écrit en dur au build.
 * scripts/, tests/ et les fichiers de configuration (next.config.ts, playwright.config.ts…) sont hors de src : libres.
 */
const LA_CONFIG = "La configuration se lit par env() (src/server/env.ts) ou src/server/drapeaux.ts : ailleurs, process.env ne sert qu’à NODE_ENV.";
const PAS_DE_PROCESS_ENV = [
  /* process.env.X ou process.env[x], sauf NODE_ENV */
  { selector: "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV']", message: LA_CONFIG },
  /* process.env tout entier : passé, copié ou déstructuré */
  { selector: ":not(MemberExpression) > MemberExpression[object.name='process'][property.name='env']", message: LA_CONFIG },
];

/*
 * L’appli tourne toujours sur son back-end : jamais de données factices dans son code (le contenu du produit est dans
 * src/contenu). Les seules qui restent servent aux aperçus (src/app/apercu, jamais sur Vercel : src/proxy.ts) : aucun
 * autre fichier ne les importe. src/mocks n’existe plus : la règle empêche seulement qu’il revienne.
 */
const PAS_DE_MOCKS = { group: ["@/mocks", "@/mocks/*"], message: "Pas de données factices dans l’appli : le contenu du produit vit dans src/contenu." };
const PAS_D_APERCU = {
  group: ["@/app/apercu", "@/app/apercu/*", "**/apercu/*"],
  message: "Les aperçus (/apercu) gardent des données fictives : aucun écran de l’appli ne les importe.",
};
/*
 * Chiffrer et déchiffrer passent par le coffre (src/server/coffre.ts), qui sait ce que garde chaque colonne : ailleurs,
 * chiffrement.ts ne sert qu’à ses empreintes et ses jetons. Par l’alias, ou en chemin relatif depuis src/server. Une
 * liste de noms permis : une fonction ajoutée à chiffrement.ts (une autre façon de déchiffrer) reste au coffre, et
 * `import * as` est refusé. Un import() dynamique de chiffrement.ts est refusé à part (CHIFFREMENT_DYNAMIQUE).
 */
const CHIFFREMENT = "^(@/server|\\.\\.?(/\\.\\.)*(/server)?)/chiffrement$";
const PAR_LE_COFFRE_MESSAGE =
  "Une colonne chiffrée se lit et s’écrit par le coffre (src/server/coffre.ts : lire, ecrire, lireAudio, ecrireAudio) ; chiffrement.ts ne sert ailleurs qu’à empreinte, memeEmpreinte et jeton.";
const PAR_LE_COFFRE = { regex: CHIFFREMENT, allowImportNames: ["empreinte", "memeEmpreinte", "jeton"], message: PAR_LE_COFFRE_MESSAGE };
const CHIFFREMENT_DYNAMIQUE = dynamique(CHIFFREMENT, PAR_LE_COFFRE_MESSAGE);
/*
 * La base se lit et s’écrit dans src/server : les routes /api et les pages (tout src/app) passent par le dépôt
 * (src/server/depot.ts), les comptes (comptes.ts) ou les modules de leur domaine, jamais par la base (src/server/db) ni
 * par drizzle-orm. Une requête SQL écrite dans une route recopiait les lectures et leurs prédicats.
 */
const PAR_LE_DEPOT_MESSAGE = "Une route ou une page ne lit pas la base elle-même : elle passe par src/server (depot.ts, comptes.ts ou le module de son domaine).";
const PAR_LE_DEPOT = [
  { regex: `${versSrc("server/db")}(/|$)`, message: PAR_LE_DEPOT_MESSAGE },
  { regex: "^drizzle-orm(/|$)", message: PAR_LE_DEPOT_MESSAGE },
];
/* Les mêmes par un import() dynamique. La base (src/server/db) l’est déjà pour le navigateur (NAVIGATEUR_SANS_SERVEUR) */
const DRIZZLE_DYNAMIQUE = dynamique(PAR_LE_DEPOT[1].regex, PAR_LE_DEPOT_MESSAGE);
const PAR_LE_DEPOT_DYNAMIQUE = [dynamique(PAR_LE_DEPOT[0].regex, PAR_LE_DEPOT_MESSAGE), DRIZZLE_DYNAMIQUE];
/*
 * Le contrat des routes (src/types/api.ts) : ses types pour tout src, ses schémas zod (et zod avec eux) pour le serveur
 * seulement. Hors de src/server et des routes /api, il ne s’importe qu’en `import type` : zod n’entre pas dans les pages.
 * Ni par un import() dynamique, nulle part : il n’a rien à charger à la demande.
 */
const CONTRAT_MESSAGE =
  "Hors du serveur (src/server, les routes /api), le contrat (src/types/api.ts) ne s’importe qu’en `import type` : ses schémas zod n’entrent pas dans les pages.";
const CONTRAT = { regex: `${versSrc("types/api")}$`, allowTypeImports: true, message: CONTRAT_MESSAGE };
const CONTRAT_DYNAMIQUE = dynamique(CONTRAT.regex, CONTRAT_MESSAGE);
/*
 * Une valeur levée peut être n’importe quoi (une chaîne, null) : `(e as Error).name` le cache, comme `<Error>e`,
 * `.catch((e: Error) =>` ou le rejet de `.then(…, (e: Error) =>)`. Le type supposé : Error, une sous-classe (TypeError),
 * un type de Node (NodeJS.ErrnoException), seul ou dans une union ou une intersection (`Error & { code?: string }`).
 * Son nom se lit par nomErreur (src/lib/tracer.ts), une erreur s’écrit au journal par journalErreur ou auMieux
 * (src/server/journal.ts), qui n’en gardent que le nom et le code.
 */
const ERREUR_SUPPOSEE_MESSAGE = "Une valeur levée n’est pas forcément une Error : nomErreur(e) (src/lib/tracer.ts), ou journalErreur / auMieux (src/server/journal.ts).";
const NOM_D_ERREUR = "/(Error|Exception)$/";
const typesDErreur = (avant) =>
  [`${avant} >`, `${avant} > :matches(TSUnionType, TSIntersectionType) >`].flatMap((chemin) => [
    `${chemin} TSTypeReference > Identifier.typeName[name=${NOM_D_ERREUR}]`,
    `${chemin} TSTypeReference > TSQualifiedName.typeName[right.name=${NOM_D_ERREUR}]`,
  ]);
const PAS_D_ERREUR_SUPPOSEE = [
  "TSAsExpression",
  "TSTypeAssertion",
  "CallExpression[callee.property.name='catch'] > :function > Identifier.params > TSTypeAnnotation",
  /* Le second argument de `.then` : son gestionnaire de rejet */
  "CallExpression[callee.property.name='then'] > :function:nth-child(2) > Identifier.params > TSTypeAnnotation",
]
  .flatMap(typesDErreur)
  .map((selector) => ({ selector, message: ERREUR_SUPPOSEE_MESSAGE }));
/*
 * enLocal (src/server/journal.ts) écrit un texte libre en clair, l’email et le code de connexion compris : elle remplace
 * un mail en local, et ne sert qu’à email.ts et alertes.ts. Ailleurs, on écrit au journal.
 */
const EN_LOCAL = {
  regex: "^(@/server|\\.\\.?(/\\.\\.)*(/server)?)/journal$",
  importNames: ["enLocal"],
  message: "enLocal écrit en clair, à la place d’un mail en local : seuls email.ts et alertes.ts s’en servent. Ailleurs : journal, journalErreur ou auMieux.",
};

/*
 * Les textes des prompts (src/server/ia/textes.generated.ts, généré depuis le sous-module privé) ne s’importent que dans
 * src/server/ia/claude.ts, qui les envoie au modèle : importés ailleurs, ils pourraient finir dans une page ou une
 * réponse (S-42 ; scripts/verifier-fuite.mjs les cherche aussi dans le build).
 */
const TEXTES_DES_PROMPTS = {
  regex: "(^|/)textes\\.generated(\\.ts)?$",
  message: "Les textes des prompts ne s’importent que dans src/server/ia/claude.ts, qui les envoie au modèle (S-42).",
};

/*
 * Une couleur qui a son token (src/app/globals.css, Q59) ne s’écrit pas en hex dans le code : la classe du token
 * (text-pale, bg-disabled…) ou var(--…), pour qu’un token changé change tout l’écran. La règle lit les tokens dans
 * globals.css, et cherche leurs hex (six chiffres, ou huit avec l’opacité) dans les chaînes, les gabarits et le texte JSX,
 * valeurs arbitraires de Tailwind comprises (`bg-[#D9D6CF]`). Un hex sans token (les marques de WhatsApp, les maquettes)
 * reste permis. tests/unit/jetons.test.ts vérifie le reste : les classes et les var() citées existent.
 */
const JETONS = new Map(
  [...readFileSync(new URL("./src/app/globals.css", import.meta.url), "utf8").matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gim)].map(([, nom, hex]) => [
    hex.toLowerCase(),
    nom,
  ]),
);
const HEX = /#([0-9a-f]{6})(?:[0-9a-f]{2})?(?![0-9a-f])/gi;
const COULEUR_EN_JETON = {
  meta: {
    type: "problem",
    schema: [],
    messages: { jeton: "{{hex}} est la couleur du token {{jeton}} (src/app/globals.css) : sa classe (text-…, bg-…) ou var({{jeton}}), pas son hex." },
  },
  create(context) {
    const verifier = (node, texte) => {
      for (const [hex, rgb] of texte.matchAll(HEX)) {
        const jeton = JETONS.get(`#${rgb.toLowerCase()}`);
        if (jeton) context.report({ node, messageId: "jeton", data: { hex, jeton } });
      }
    };
    return {
      Literal: (node) => typeof node.value === "string" && verifier(node, node.value),
      TemplateElement: (node) => verifier(node, node.value.raw),
      JSXText: (node) => verifier(node, node.value),
    };
  },
};
/* Les règles propres à BLUSH, écrites ici */
const BLUSH = { rules: { "couleur-en-jeton": COULEUR_EN_JETON } };

/* Le serveur ne passe pas par la couche du navigateur : il lit les types du réseau dans src/types/api.ts */
const SERVEUR_SANS_NAVIGATEUR = [
  {
    regex: `${versSrc("services/api")}$`,
    allowTypeImports: true,
    message: "src/services/api.ts appelle les routes /api depuis le navigateur : le serveur lit ses propres modules (src/server).",
  },
  { regex: `${versSrc("lib/query")}$`, allowTypeImports: true, message: "Le cache des requêtes vit dans le navigateur : le serveur n’en a pas." },
  { regex: `${versSrc("state")}(/|$)`, allowTypeImports: true, message: "L’état du parcours vit dans le navigateur : le serveur lit la base." },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Ni données factices, ni aperçus, ni chiffrement hors du coffre (PAS_DE_MOCKS, PAS_D_APERCU, PAR_LE_COFFRE), ni les
  // textes des prompts hors de claude.ts (TEXTES_DES_PROMPTS), ni la base dans src/app (PAR_LE_DEPOT). Les quatre blocs
  // suivants reprennent ces motifs : un bloc qui redonne no-restricted-imports remplace toute sa liste.
  {
    files: ["src/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [PAS_DE_MOCKS, PAS_D_APERCU, PAR_LE_COFFRE, TEXTES_DES_PROMPTS] }] },
  },
  {
    files: ["src/app/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [PAS_DE_MOCKS, PAS_D_APERCU, PAR_LE_COFFRE, TEXTES_DES_PROMPTS, ...PAR_LE_DEPOT] }] },
  },
  // Les aperçus (src/app/apercu) gardent leurs données fictives, sans chiffrer ni lire la base pour autant.
  {
    files: ["src/app/apercu/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [PAR_LE_COFFRE, TEXTES_DES_PROMPTS, ...PAR_LE_DEPOT] }] },
  },
  // Le coffre chiffre.
  {
    files: ["src/server/coffre.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [PAS_DE_MOCKS, PAS_D_APERCU, TEXTES_DES_PROMPTS] }] },
  },
  // claude.ts envoie les textes des prompts au modèle.
  {
    files: ["src/server/ia/claude.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [PAS_DE_MOCKS, PAS_D_APERCU, PAR_LE_COFFRE] }] },
  },
  // Une variable CSS sans `as CSSProperties` (PAS_DE_CAST_CSS), la configuration lue à ses deux seuls endroits
  // (PAS_DE_PROCESS_ENV), une valeur levée jamais supposée Error (PAS_D_ERREUR_SUPPOSEE), et ni chiffrement.ts ni le
  // contrat par import() (CHIFFREMENT_DYNAMIQUE, CONTRAT_DYNAMIQUE) ;
  // dans src/app, ni la base ni drizzle-orm par import() non plus (PAR_LE_DEPOT_DYNAMIQUE). Les blocs suivants
  // reprennent ces sélecteurs : un bloc qui redonne no-restricted-syntax remplace toute sa liste.
  {
    files: ["src/**/*.tsx", "src/**/*.ts"],
    rules: { "no-restricted-syntax": ["error", ...PAS_DE_CAST_CSS, ...PAS_DE_PROCESS_ENV, ...PAS_D_ERREUR_SUPPOSEE, CHIFFREMENT_DYNAMIQUE, CONTRAT_DYNAMIQUE] },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...PAS_DE_CAST_CSS, ...PAS_DE_PROCESS_ENV, ...PAS_D_ERREUR_SUPPOSEE, CHIFFREMENT_DYNAMIQUE, CONTRAT_DYNAMIQUE, ...PAR_LE_DEPOT_DYNAMIQUE],
    },
  },
  {
    files: ["src/server/env.ts", "src/server/drapeaux.ts"],
    rules: { "no-restricted-syntax": ["error", ...PAS_DE_CAST_CSS, ...PAS_D_ERREUR_SUPPOSEE, CHIFFREMENT_DYNAMIQUE, CONTRAT_DYNAMIQUE] },
  },
  // Le contrat ne s’importe qu’en `import type` hors du serveur (CONTRAT) ; le bloc suivant, le navigateur, le reprend.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/**", "src/app/api/**", "src/types/api.ts"],
    rules: { "@typescript-eslint/no-restricted-imports": ["error", { patterns: [CONTRAT, EN_LOCAL] }] },
  },
  // Les frontières entre couches. Un `import type` passe toujours : il disparaît à la compilation.
  // Le navigateur ne touche pas au serveur : tout src, sauf ce qui tourne sur le serveur (src/server, les routes /api, les
  // fichiers que Next rend sur le serveur, serveur.ts qui les sert, et le proxy). Ni par l’alias, ni en chemin
  // relatif, ni par un import() dynamique. Seul server-only le disait, et au build ; schema.ts et les mails ne l’ont pas.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/server/**",
      "src/app/api/**",
      "src/app/**/{page,layout,route,loading,not-found,template,default}.{ts,tsx}",
      "src/app/**/{opengraph-image,twitter-image,icon,apple-icon,sitemap,robots,manifest}.{ts,tsx}",
      "src/services/serveur.ts",
      "src/proxy.ts",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { patterns: [{ regex: `${versSrc("server")}(/|$)`, allowTypeImports: true, message: NAVIGATEUR_SANS_SERVEUR }, CONTRAT] },
      ],
      /* Dans src/app, drizzle-orm par import() aussi : la base, elle, est déjà du serveur */
      "no-restricted-syntax": [
        "error",
        ...PAS_DE_CAST_CSS,
        ...PAS_DE_PROCESS_ENV,
        ...PAS_D_ERREUR_SUPPOSEE,
        CHIFFREMENT_DYNAMIQUE,
        CONTRAT_DYNAMIQUE,
        DRIZZLE_DYNAMIQUE,
        dynamique(versSrc("server"), NAVIGATEUR_SANS_SERVEUR),
      ],
    },
  },
  // Le serveur ne passe pas par la couche du navigateur : il lit les types du réseau dans src/types/api.ts. Ni enLocal
  // hors de email.ts et alertes.ts (EN_LOCAL) : le bloc suivant reprend la liste sans elle.
  {
    files: ["src/server/**", "src/app/api/**"],
    rules: { "@typescript-eslint/no-restricted-imports": ["error", { patterns: [...SERVEUR_SANS_NAVIGATEUR, EN_LOCAL] }] },
  },
  {
    files: ["src/server/email.ts", "src/server/alertes.ts"],
    rules: { "@typescript-eslint/no-restricted-imports": ["error", { patterns: SERVEUR_SANS_NAVIGATEUR }] },
  },
  // Le sous-module des prompts ne dépend pas de l’appli (seulement vérifié ici : il ne change pas avec elle).
  {
    files: ["prompts/lib/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: "^@/", message: "prompts/lib est un sous-module à part : il n’importe rien de l’appli (src)." }] }],
    },
  },
  // Pas de console dans src : le serveur écrit au journal (journal, journalErreur, auMieux ; enLocal pour ce que le
  // développeur lit en local, src/server/journal.ts), le navigateur par tracer (src/lib/tracer.ts). Ces deux fichiers
  // seuls écrivent dans la console. Les aperçus (src/app/apercu, jamais en ligne), scripts/ et tests/ restent libres.
  {
    files: ["src/**/*.{ts,tsx,js,mjs}"],
    ignores: ["src/app/apercu/**", "src/server/journal.ts", "src/lib/tracer.ts"],
    rules: { "no-console": "error" },
  },
  // Les promesses, partout dans src : une promesse oubliée (ni attendue, ni `void`, ni suivie d’un catch) échoue sans que
  // personne le voie, et une fonction async passée là où on attend un retour sans promesse (onClick, un forEach) aussi.
  // Ces règles lisent les types (projectService) : seulement sur src.
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  // Une couleur qui a son token ne s’écrit pas en hex (COULEUR_EN_JETON). Sauf dans les dessins (les objets en volume, les
  // éclats de la fête et les bulles de l’envol, peints en JS) et dans src/server/marque.ts : les mails, les images de
  // partage et la teinte des barres du navigateur n’ont pas le CSS de l’appli, ils lisent ses couleurs en hex là.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/brand/objects3d.tsx", "src/app/app/accueil/mouvement/{fete,vol}.ts", "src/server/marque.ts"],
    plugins: { blush: BLUSH },
    rules: { "blush/couleur-en-jeton": "error" },
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
    // Le banc de test des prompts (scripts .mts, vérifiés dans le dépôt des prompts) et le module généré des textes.
    "prompts/evals/**",
    "src/server/ia/textes.generated.ts",
    // Les résultats des tests de bout en bout (le rapport HTML de Playwright embarque son propre code).
    "test-results/**",
    "playwright-report*/**",
    // La couverture (npm run couverture : son rapport HTML), et les dossiers de travail des agents (.claude/worktrees :
    // d’autres branches, d’autres sessions), jamais vérifiés d’ici.
    "coverage/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
