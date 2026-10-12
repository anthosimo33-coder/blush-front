import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Page, Route, TestInfo } from "@playwright/test";
import {
  ALERTE_FACTICE,
  attendreTaches,
  autreCode,
  chiffrer,
  connecterParApi,
  dechiffrer,
  debloquerLaConv,
  dernierCode,
  derniereHistoire,
  DOMAINE,
  emailLibre,
  ENTETE_DU_JETON,
  expect,
  exportWhatsApp,
  histoiresDe,
  lectureComplete,
  lectureFaite,
  lireUneConvParApi,
  nouvelInvite,
  oublierEmail,
  origine,
  fauxCloudflare,
  pageAuRepos,
  poserLaReprise,
  prouverHumain,
  poserLeParcours,
  rapportCommeLeVraiModele,
  RESEAU,
  sql,
  suivreLeNavigateur,
  test,
  URL_APPLI,
} from "../../tests/e2e/aide";
import { STATES } from "./screens.mjs";

/*
 * La galerie des écrans, sur le vrai back-end : chaque état de scripts/galerie/screens.mjs, une fois en mobile et une
 * fois en ordinateur (les projets galerie-* de playwright.config.ts, seulement avec BLUSH_GALERIE=1). Le serveur est
 * celui des tests de bout en bout (tests/e2e/serveur.mjs : la base recréée, le modèle factice, aucune clé d’API, la
 * boîte à mails) ; chaque état prépare son propre compte par les routes /api et les aides des tests (tests/e2e/aide),
 * puis la page est capturée dans .galerie/img, avec sa fiche dans .galerie/etats (lue par capture.mjs, qui assemble
 * la page de la galerie).
 *   npm run e2e:build && npm run galerie
 */

/** Le dossier de la galerie (ignoré par git). */
const SORTIE = resolve(__dirname, "../../.galerie");

type Etat = (typeof STATES)[number];
type Prepare = { histoire: string | null; codeFaux: string | null };

/** L’email du parcours (07c, 07d) : un par état et par écran, et le code demandé pour lui. */
const emailDuParcours = (id: string, ecran: "m" | "d") => `noe-${id.toLowerCase()}-${ecran}@${DOMAINE}`;

/** Une conv importée sans compte (POST /api/import), comme à l’écran de l’export : le brouillon tient par son cookie. */
async function importerUnBrouillon(page: Page, testInfo: TestInfo): Promise<string> {
  const conv = exportWhatsApp(testInfo);
  await prouverHumain(page.request, testInfo);
  const envoi = await page.request.post("/api/import", {
    headers: origine(testInfo),
    multipart: { fichier: { name: conv.nom, mimeType: "application/zip", buffer: readFileSync(conv.chemin) } },
    timeout: RESEAU,
  });
  expect(envoi.status(), "l’export de la conv est importé").toBe(200);
  return ((await envoi.json()) as { story: { id: string } }).story.id;
}

/**
 * Les rapports écrits du compte, aux chapitres 1 et 2 tels que les écrit le vrai modèle (rapportCommeLeVraiModele) : la
 * révélation du verdict d’un compte payant montre alors la confiance, ce que veulent dire les chiffres, et ses cartes
 * « le moment » et « à toi de jouer », comme en production.
 */
const commeLeVraiModele = (email: string) => rapportCommeLeVraiModele(email, { chapitre1: true });

/**
 * Le niveau du verdict de la dernière histoire du compte, réécrit dans la base : le modèle factice écrit toujours une
 * étape (« On se le dit »), jamais la température que le vrai modèle donne à une conv « En couple ».
 */
async function temperatureDuVerdict(email: string, niveau: "eloigne" | "coince" | "va" | "soudes"): Promise<void> {
  const [v] = await sql()<{ data: Uint8Array }[]>`select data from verdicts where story_id = ${derniereHistoire(email)}`;
  if (!v) throw new Error(`aucun verdict pour ${email}`);
  const donnees = dechiffrer<{ sortie: Record<string, unknown> }>(v.data);
  await sql()`update verdicts set data = ${chiffrer({ ...donnees, sortie: { ...donnees.sortie, niveau } })} where story_id = ${derniereHistoire(email)}`;
}

/**
 * Un compte dont une conv est lue et toute la suite écrite, connecté dans ce navigateur : « equipe » (un invité, tout
 * ouvert), ou « rapport » (un compte qui paie, son rapport débloqué après le verdict comme un achat livré).
 */
async function comptePayant(page: Page, testInfo: TestInfo, compte: "rapport" | "equipe"): Promise<string> {
  const email = compte === "equipe" ? await lectureComplete(page, testInfo) : emailLibre(testInfo, "galerie-rapport");
  if (compte === "rapport") {
    await connecterParApi(page, testInfo, email);
    await lireUneConvParApi(page, testInfo);
    await attendreTaches(email);
    /* Débloqué : ouvrir le rapport lance la suite, d’un trait */
    await debloquerLaConv(email);
    expect((await page.request.get("/api/rapport")).status()).toBe(200);
    await attendreTaches(email);
  }
  await commeLeVraiModele(email);
  return email;
}

/** Prépare le compte de l’état (screens.mjs, `compte`) : rien, un brouillon, ou un compte et ses convs. */
async function preparer(etat: Etat, page: Page, testInfo: TestInfo, ecran: "m" | "d"): Promise<Prepare> {
  const sans: Prepare = { histoire: null, codeFaux: null };
  switch (etat.compte) {
    case undefined:
      return sans;
    case "brouillon":
      return { ...sans, histoire: await importerUnBrouillon(page, testInfo) };
    case "code": {
      /* L’email du parcours, puis « Recevoir mon code » : un vrai code, dans la boîte à mails des tests */
      const email = emailDuParcours(etat.id, ecran);
      await oublierEmail(email);
      const histoire = await importerUnBrouillon(page, testInfo);
      const depuis = Date.now();
      const envoi = await page.request.post("/api/auth/code", { headers: { ...origine(testInfo), ...ENTETE_DU_JETON }, data: { email }, timeout: RESEAU });
      expect(envoi.status(), "le code de connexion est demandé").toBe(200);
      await poserLeParcours(page, { email });
      return { histoire, codeFaux: autreCode(await dernierCode(email, { depuis })) };
    }
    case "gratuit":
      return { ...sans, histoire: await lectureFaite(page, testInfo, emailLibre(testInfo, "galerie")) };
    case "lecture-en-cours": {
      const email = emailLibre(testInfo, "galerie-lecture");
      const histoire = await lectureFaite(page, testInfo, email);
      /*
       * Le modèle factice lit en un instant : la tâche du verdict remise « en cours », à mi-chemin, comme pendant la
       * réflexion du modèle. Son battement de cœur dans une heure : personne ne la croit abandonnée, rien ne la relance.
       */
      await sql()`
        update tasks set status = 'en_cours', progress = 50, heartbeat_at = now() + interval '1 hour', updated_at = now() - interval '10 minutes'
        where kind = 'verdict' and story_id = ${derniereHistoire(email)}`;
      return { ...sans, histoire };
    }
    case "rapport":
    case "equipe": {
      const email = await comptePayant(page, testInfo, etat.compte);
      return { ...sans, histoire: (await histoiresDe(email)).at(-1)?.id ?? null };
    }
    case "sobre":
      return { ...sans, histoire: await lectureFaite(page, testInfo, emailLibre(testInfo, "galerie-sobre"), { ajout: { de: "autre", texte: ALERTE_FACTICE } }) };
    case "plusieurs": {
      /* Trois convs lues : Romane, Inès, puis Maëlys, ouverte en dernier */
      const email = await nouvelInvite(testInfo);
      await connecterParApi(page, testInfo, email);
      await lireUneConvParApi(page, testInfo, { personnes: { toi: "Noé", autre: "Romane" } });
      await lireUneConvParApi(page, testInfo, { personnes: { toi: "Noé", autre: "Inès" } });
      const histoire = await lireUneConvParApi(page, testInfo);
      await attendreTaches(email);
      await commeLeVraiModele(email);
      return { ...sans, histoire };
    }
    case "couple": {
      /* « En couple » à « Qui es-tu ? », de l’équipe, puis le verdict à « Ça coince », comme le vrai modèle l’écrirait */
      const email = await lectureComplete(page, testInfo, { enCouple: true });
      await commeLeVraiModele(email);
      await temperatureDuVerdict(email, "coince");
      return { ...sans, histoire: (await histoiresDe(email)).at(-1)?.id ?? null };
    }
  }
}

/** Attend la page posée : le réseau calme (ou 5 secondes : /lecture interroge le serveur chaque seconde), les polices et les images. */
async function pagePosee(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  await page.evaluate(async () => {
    for (const image of Array.from(document.images)) image.loading = "eager";
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, (image) => image.decode().catch(() => {})));
  });
}

/** Écrit la capture et sa fiche (.galerie/etats/<id>-<écran>.json) ; l’image d’une capture précédente du même état est retirée. */
function garder(etat: Etat, ecran: "m" | "d", capture: { src: string; w: number; h: number }): void {
  const fiche = join(SORTIE, "etats", `${etat.id}-${ecran}.json`);
  try {
    const avant = JSON.parse(readFileSync(fiche, "utf8")) as { src: string };
    if (avant.src !== capture.src) rmSync(join(SORTIE, avant.src), { force: true });
  } catch {
    /* pas de capture précédente */
  }
  writeFileSync(fiche, JSON.stringify(capture));
}

for (const etat of STATES) {
  test(`${etat.id} · ${etat.title}${etat.state ? ` · ${etat.state}` : ""}`, async ({ browser, extraHTTPHeaders }, testInfo) => {
    const ecran = testInfo.project.metadata.ecran as "m" | "d";
    test.skip(!!etat.only && etat.only !== ecran, `seulement en ${etat.only === "m" ? "mobile" : "ordinateur"}`);
    /* Un compte de l’équipe et trois convs lues : de la marge sur une machine chargée */
    if (etat.compte === "plusieurs" || etat.compte === "equipe" || etat.compte === "rapport" || etat.compte === "couple") test.slow();
    const { viewport, deviceScaleFactor = 1 } = testInfo.project.use;
    if (!viewport) throw new Error(`le projet ${testInfo.project.name} n’a pas d’écran (playwright.config.ts)`);
    /* `touch` : le mobile est capturé comme un vrai écran tactile (pas de survol, pointeur grossier) */
    const tactile = !!etat.touch && ecran === "m";
    const contexte = await browser.newContext({
      baseURL: URL_APPLI,
      viewport,
      deviceScaleFactor,
      locale: "fr-FR",
      timezoneId: "Europe/Paris",
      reducedMotion: etat.motion ? "no-preference" : "reduce",
      hasTouch: tactile,
      isMobile: tactile,
      /* L’IP du test (tests/e2e/aide/index.ts) : les limites anti-abus comptent par IP */
      extraHTTPHeaders,
      permissions: ["clipboard-read", "clipboard-write", "microphone"],
    });
    suivreLeNavigateur(contexte);
    /* Le faux script de Cloudflare : le CAPTCHA passe, sans réseau (tests/e2e/aide/captcha.ts) */
    await fauxCloudflare(contexte);
    const retenues: Route[] = [];
    try {
      const page = await contexte.newPage();
      const { histoire, codeFaux } = await preparer(etat, page, testInfo, ecran);
      /* `journey` : l’état du parcours de l’onglet, que l’écran lit (src/state/journey.tsx) */
      if (etat.journey) await poserLeParcours(page, etat.journey);
      /* `reprise` : où la lecture du rapport s’était arrêtée, pour l’histoire préparée */
      if (etat.reprise) {
        if (!histoire) throw new Error(`${etat.id} : une reprise sans histoire`);
        await poserLaReprise(page, histoire, etat.reprise);
      }
      /* `retenir` : la requête part, mais le serveur ne la reçoit jamais : l’écran reste « en train d’écrire » */
      const retenir = etat.retenir;
      if (retenir)
        await page.route(`**${retenir.chemin}`, (route) => {
          if (route.request().method() === (retenir.methode ?? "POST")) retenues.push(route);
          else void route.fallback();
        });

      await page.goto(etat.route);
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await pagePosee(page);
      await page.waitForTimeout(etat.wait ?? 600);
      if (etat.steps) await etat.steps(page, { ecran, histoire, codeFaux });
      if (etat.hover) {
        const cible =
          typeof etat.hover === "string"
            ? page.locator(etat.hover).first()
            : page.getByRole(etat.hover.role as Parameters<Page["getByRole"]>[0], { name: etat.hover.name }).first();
        await cible.hover();
        await page.waitForTimeout(700);
      }
      /* États animés : les entrées (rebond, montée) sont figées à leur état final, la progression continue */
      if (etat.motion) await page.addStyleTag({ content: "[data-popin],[data-rise],[data-pop]{animation:none!important}" });
      /*
       * Les autres sont capturés posés : la scène finie, le texte arrivé (le survol, lui, reste). Au bout de 10 secondes,
       * on capture quand même (un compte à rebours, une lecture qui interroge le serveur), et on le dit.
       */
      else if (!(await pageAuRepos(page, { max: 10_000, echouer: false }))) console.warn(`${etat.id} (${ecran}) : la page bouge encore après 10 secondes, capturée quand même`);

      const entiere = !etat.sheet;
      const hauteur = entiere ? await page.evaluate(() => Math.max(document.documentElement.scrollHeight, window.innerHeight)) : viewport.height;
      const src = `img/${ecran}-${etat.id}-${Date.now().toString(36)}.jpg`;
      mkdirSync(join(SORTIE, "img"), { recursive: true });
      mkdirSync(join(SORTIE, "etats"), { recursive: true });
      /* Au-delà de ~16 000 px, le navigateur recolle mal l’image : on capture alors en pixels CSS */
      await page.screenshot({ path: join(SORTIE, src), type: "jpeg", quality: 85, fullPage: entiere, scale: hauteur * deviceScaleFactor > 15000 ? "css" : "device" });
      garder(etat, ecran, { src, w: viewport.width, h: hauteur });
    } finally {
      await Promise.all(retenues.map((r) => r.abort().catch(() => {})));
      await contexte.close();
    }
  });
}
