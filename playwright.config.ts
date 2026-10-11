import { isAbsolute, relative, resolve, sep } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { ADMIN, BOITE_MAILS, CLE, CRON_SECRET, DATABASE_URL, INVITES, PORT, PORT_BETA, RACINE, URL_APPLI, URL_BETA } from "./tests/e2e/reglages";

/*
 * Les tests de bout en bout (tests/e2e) : les vrais parcours, dans un vrai navigateur, contre le back-end, avec le
 * modèle factice, une base Postgres recréée à chaque lancement et la boîte à mails des tests.
 *   npm run e2e:build   le build du back-end, une fois puis après chaque changement de l’appli
 *   npm run e2e         E2E_PORT (3400) et E2E_DB (blush_e2e) pour lancer plusieurs suites en même temps
 *   npm run e2e:visuel  les captures de référence des écrans (tests/e2e/visuel.spec.ts), avec E2E_VISUEL_DIR
 *   npm run galerie     la galerie des écrans (scripts/galerie), avec BLUSH_GALERIE=1 (posé par la commande)
 * Chromium sur ordinateur, et WebKit en iPhone (le moteur de Safari, là où BLUSH se teste à la main).
 */
const CI = !!process.env.CI;

/**
 * Un serveur des tests (tests/e2e/serveur.mjs vérifie le build, recrée la base, puis lance `next start`). Tout est
 * fictif, et il n’a aucune clé d’API : ni Anthropic, ni Resend, ni ElevenLabs, ni Mistral.
 */
const serveur = (port: number, betaFermee: boolean) => ({
  name: betaFermee ? "bêta fermée" : "appli",
  command: "node tests/e2e/serveur.mjs",
  cwd: RACINE,
  url: `http://localhost:${port}/`,
  /* Toujours un serveur neuf, sur le build et la base de ce lancement : un port déjà pris est une erreur (prends un autre E2E_PORT) */
  reuseExistingServer: false,
  timeout: 120_000,
  stdout: "pipe" as const,
  stderr: "pipe" as const,
  env: {
    E2E_PORT_SERVEUR: String(port),
    /* Le premier serveur recrée la base et vide la boîte ; le second (bêta fermée) démarre après lui, sur la même base */
    E2E_PREPARER: betaFermee ? "0" : "1",
    DATABASE_URL,
    BLUSH_CLE: CLE,
    BLUSH_IA_FACTICE: "1",
    BLUSH_URL: `http://localhost:${port}`,
    BLUSH_ACCES_LIBRE: INVITES.join(","),
    BLUSH_ALERTES: ADMIN,
    BLUSH_ADMINS: ADMIN,
    CRON_SECRET,
    BLUSH_BETA_FERMEE: betaFermee ? "1" : "0",
    BLUSH_BOITE_MAILS: BOITE_MAILS,
  },
});

const navigateurs = [
  /*
   * Un micro factice (un bip), et son autorisation donnée d’office : les vocaux du chat s’enregistrent dans Chromium
   * (chat-vocal.spec.ts). Sans ces deux réglages, Chromium sans écran refuse tout micro.
   */
  {
    name: "chromium",
    visuel: "visuel-chromium",
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width: 1280, height: 800 },
      launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
    },
  },
  { name: "webkit-iphone", visuel: "visuel-webkit", use: { ...devices["iPhone 15"] } },
];
/* Les fichiers *.beta.spec.ts tournent sur le serveur en bêta fermée, les autres sur le serveur ouvert */
const BETA = /\.beta\.spec\.ts$/;

/*
 * Les captures de référence des écrans (tests/e2e/visuel.spec.ts) : seulement avec E2E_VISUEL_DIR, le dossier où elles
 * s’écrivent (--update-snapshots) puis se comparent, hors du dépôt (elles dépendent des polices et des navigateurs de la
 * machine). Sans lui, ni ce fichier ni ses projets : `npm run e2e` et la CI ne les voient pas. Les captures se prennent
 * une à une (un seul worker) : le tableau de bord compte tout ce que la base contient.
 */
const VISUEL = process.env.E2E_VISUEL_DIR ? resolve(process.env.E2E_VISUEL_DIR) : null;
/* Jamais dans le dépôt (public) : un dossier sous sa racine est refusé, même ignoré par git */
const dansLeDepot = (dossier: string) => {
  const r = relative(RACINE, dossier);
  return r === "" || !(r === ".." || r.startsWith(`..${sep}`) || isAbsolute(r));
};
if (VISUEL && dansLeDepot(VISUEL)) throw new Error(`E2E_VISUEL_DIR doit être hors du dépôt : « ${VISUEL} » refusé (un dossier sous ${RACINE})`);
const CAPTURES = /[\\/]visuel\.spec\.ts$/;

/*
 * La galerie des écrans (scripts/galerie/galerie.spec.ts, `npm run galerie`) : chaque état, atteint par le vrai back-end,
 * capturé en mobile et en ordinateur dans Chromium (avec le micro factice des vocaux). Seulement avec BLUSH_GALERIE=1 :
 * sans lui, ni ce fichier ni ses projets (`npm run e2e` et la CI ne les voient pas). `metadata.ecran` : la clé des
 * captures (m ou d), celle de la page de la galerie. Avec, aussi le banc de fluidité de l’accueil sur un compte BLUSH+
 * semé (scripts/galerie/fluidite.spec.ts, `npm run fluidite`).
 */
const GALERIE = process.env.BLUSH_GALERIE === "1";
const ecransDeLaGalerie = [
  { name: "galerie-mobile", metadata: { ecran: "m" }, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  { name: "galerie-ordinateur", metadata: { ecran: "d" }, viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5 },
];

/* Un dossier de résultats et un rapport par port : deux suites en même temps ne s’effacent pas */
const rapport = PORT === 3400 ? "playwright-report" : `playwright-report-${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: `test-results/${PORT}`,
  /*
   * Un test fait tout un parcours (quelques secondes d’habitude) : de la marge pour une machine chargée. Une attente
   * (expect) couvre un aller-retour au serveur : un import, une réponse du chat, un écran rendu par le serveur.
   */
  timeout: 90_000,
  expect: { timeout: 30_000 },
  /* Les tests d’un fichier à la suite, les fichiers en parallèle : chaque test a ses emails, son IP (aide/index.ts) */
  fullyParallel: false,
  workers: VISUEL ? 1 : Number(process.env.E2E_WORKERS) || (CI ? 2 : 3),
  /* Aucun nouvel essai, en CI non plus : un test qui ne passe qu’une fois sur deux est un test à corriger */
  retries: 0,
  forbidOnly: CI,
  /* En CI, les échecs s’affichent aussi en annotations sur le commit (github) */
  reporter: [["list"], ...(CI ? [["github"] as const] : []), ["html", { outputFolder: rapport, open: "never" }]],
  use: {
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [
    ...navigateurs.map((n) => ({ name: n.name, testIgnore: [BETA, CAPTURES], use: { ...n.use, baseURL: URL_APPLI } })),
    ...navigateurs.map((n) => ({ name: `${n.name}-beta`, testMatch: BETA, use: { ...n.use, baseURL: URL_BETA } })),
    /* Une capture par écran et par navigateur : <E2E_VISUEL_DIR>/visuel-chromium/accueil.png… */
    ...(VISUEL
      ? navigateurs.map((n) => ({ name: n.visuel, testMatch: CAPTURES, snapshotPathTemplate: `${VISUEL}/{projectName}/{arg}{ext}`, use: { ...n.use, baseURL: URL_APPLI } }))
      : []),
    ...(GALERIE
      ? ecransDeLaGalerie.map(({ name, metadata, viewport, deviceScaleFactor }) => ({
          name,
          metadata,
          testDir: "scripts/galerie",
          testMatch: /[\\/]galerie\.spec\.ts$/,
          /* Chaque état a son propre compte : les états du fichier se capturent en parallèle */
          fullyParallel: true,
          use: { ...navigateurs[0]!.use, viewport, deviceScaleFactor, baseURL: URL_APPLI },
        }))
      : []),
    ...(GALERIE ? [{ name: "galerie-fluidite", testDir: "scripts/galerie", testMatch: /[\\/]fluidite\.spec\.ts$/, use: { ...navigateurs[0]!.use, baseURL: URL_APPLI } }] : []),
  ],
  webServer: [serveur(PORT, false), serveur(PORT_BETA, true)],
});
