import type { BrowserContext, Page, TestInfo } from "@playwright/test";
import {
  allerAuChapitre,
  attendreLaScene,
  attendreLecture,
  attendreTaches,
  champDuChat,
  choisirFichier,
  connecterParApi,
  definirPlan,
  demanderCode,
  derniereHistoire,
  DOMAINE,
  ecrireABlush,
  expect,
  exportWhatsApp,
  fermerLaFeuille,
  filDuChat,
  importerWhatsApp,
  lectureBlushPlus,
  lectureFaite,
  lireUneConvParApi,
  nouvelInvite,
  oublierEmail,
  ouvrir,
  ouvrirExportWhatsApp,
  ouvrirLePartage,
  ouvrirLeRapport,
  PAIEMENT,
  pageAuRepos,
  pagePrete,
  partageIllisible,
  partagerParApi,
  rapportCommeLeVraiModele,
  repondreQui,
  REPONSES_NOE,
  seConnecterAdmin,
  sql,
  test,
  URL_BETA,
} from "./aide";

/*
 * La référence visuelle des écrans de la production : chaque état qui compte, atteint par le vrai back-end (le modèle
 * factice, la base des tests), puis capturé en entier et comparé au pixel près. De quoi vérifier qu’un changement du
 * code ne change rien à ce que voit quelqu’un : les captures d’abord, puis la comparaison après le changement.
 *   npm run e2e:build
 *   E2E_VISUEL_DIR=<dossier> E2E_PORT=3520 E2E_DB=blush_e2e_visuel npm run e2e:visuel -- --update-snapshots   les captures
 *   E2E_VISUEL_DIR=<dossier> E2E_PORT=3520 E2E_DB=blush_e2e_visuel npm run e2e:visuel                         la comparaison
 * Le dossier est hors du dépôt : les captures dépendent des polices et des navigateurs de la machine. On compare sur la
 * même machine, et loin de minuit à Paris (le serveur dit « aujourd’hui » d’après la vraie date). Sans E2E_VISUEL_DIR,
 * ce fichier ne tourne pas (playwright.config.ts) ; avec, les tests passent un à un (le tableau de bord vide la base).
 *
 * Ce qui change d’un lancement à l’autre est figé à sa source : l’heure du navigateur (midi à Paris, le jour même : le
 * serveur, lui, dit « aujourd’hui » d’après la vraie date), l’heure des lignes de la base qu’un écran affiche, le hasard
 * (Math.random), les emails des comptes, l’identifiant du lien partagé, les animations (la page capturée au repos), les
 * blocs qui apparaissent au défilement, les polices et les images (chargées avant), la souris (rangée dans un coin).
 * Seule l’heure que le serveur écrit dans le tableau de bord est remplacée dans la page (figerLeTableauDeBord).
 */

/** Midi à Paris, aujourd’hui : l’heure du navigateur pendant les captures. */
function midiAParis(): Date {
  const jour = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const midiUtc = Date.parse(`${jour}T12:00:00Z`);
  /* Quand il est midi UTC, il est 13 h ou 14 h à Paris (l’heure d’hiver, l’heure d’été) */
  const heureParis = Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "numeric", hourCycle: "h23" }).formatToParts(midiUtc).find((p) => p.type === "hour")?.value);
  return new Date(midiUtc - (heureParis - 12) * 3600e3);
}
const MIDI = midiAParis();

/** Le même hasard à chaque chargement : un générateur à graine fixe, à la place de Math.random. */
function hasardFixe() {
  let graine = 1;
  Math.random = () => ((graine = (graine * 16807) % 2147483647) - 1) / 2147483646;
}

/** Fige un navigateur : son heure (ses minuteurs, eux, tournent) et son hasard, dès le prochain chargement de ses pages. */
async function figer(contexte: BrowserContext): Promise<void> {
  await contexte.addInitScript(hasardFixe);
  await contexte.clock.setFixedTime(MIDI);
}

test.beforeEach(async ({ context }) => {
  await figer(context);
});

/**
 * Capture la page en entier et la compare à sa référence, au pixel et à la couleur près. Avant : les images différées
 * chargées tout de suite, les polices et les images prêtes, la souris rangée dans un coin (pas de survol laissé par le
 * dernier geste), et la page au repos (pageAuRepos). La capture se prend sans les animations sans fin (arrêtées le
 * temps de la capture), et sans le curseur des champs.
 */
async function capturer(page: Page, nom: string): Promise<void> {
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    for (const image of Array.from(document.images)) image.loading = "eager";
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, (image) => image.decode().catch(() => {})));
  });
  await pageAuRepos(page);
  /* threshold 0 : même un pixel à peine plus clair compte (par défaut, Playwright tolère un petit écart de couleur) */
  await expect(page).toHaveScreenshot(`${nom}.png`, { fullPage: true, animations: "disabled", maxDiffPixels: 0, threshold: 0 });
}

/**
 * La landing fait apparaître ses blocs au défilement : on la parcourt jusqu’en bas, comme un lecteur, puis on remonte
 * en haut. Tous ses blocs sont alors apparus.
 */
async function parcourirLaLanding(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const image = () => new Promise((fin) => requestAnimationFrame(() => requestAnimationFrame(fin)));
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight / 2) {
      scrollTo({ top: y, behavior: "instant" });
      await image();
    }
    scrollTo({ top: 0, behavior: "instant" });
    await image();
  });
  await expect(page.locator("[data-reveal]:not([data-shown])")).toHaveCount(0);
}

/** Un email fixe (les écrans l’affichent), effacé d’abord de la base et de la boîte à mails : le compte repart de zéro. */
async function emailFixe(nom: string): Promise<string> {
  const email = `visuel-${nom}@${DOMAINE}`;
  await oublierEmail(email);
  return email;
}

/** Le lien public du verdict, toujours le même (12 caractères, comme ceux du serveur : src/server/partages.ts). */
const LIEN = "VisuelBlush1";

/** Donne au lien partagé du compte l’identifiant fixe LIEN : le serveur reprend le lien existant à chaque ouverture de la feuille. */
async function figerLeLien(page: Page, testInfo: TestInfo): Promise<void> {
  const id = await partagerParApi(page, testInfo);
  await sql()`delete from shares where id = ${LIEN}`;
  await sql()`update shares set id = ${LIEN} where id = ${id}`;
}

/** L’heure du verdict de la dernière histoire du compte (celle de l’intro de BLUSH, sur l’accueil) : 11 h 50 à Paris, aujourd’hui. */
async function figerLHeureDuVerdict(email: string): Promise<void> {
  await sql()`update verdicts set created_at = ${new Date(MIDI.getTime() - 10 * 60e3)} where story_id = ${derniereHistoire(email)}`;
}

/** Toute la base des tests vidée (les migrations restent) : le tableau de bord ne compte plus que ce que le test y met. */
async function viderLaBase(): Promise<void> {
  const tables = await sql()<{ nom: string }[]>`select tablename as nom from pg_tables where schemaname = 'public'`;
  await sql().unsafe(`truncate table ${tables.map((t) => `"${t.nom}"`).join(", ")} restart identity cascade`);
}

/**
 * Le tableau de bord écrit l’heure du serveur (« Mis à jour à 15:42 ») et les jours des quatorze derniers (sous le
 * graphique) : on les remplace dans la page par ceux de midi, le 10 octobre 2026. Le reste est tel que le serveur l’a rendu.
 */
async function figerLeTableauDeBord(page: Page): Promise<void> {
  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) throw new Error("pas de tableau de bord");
    const textes = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let n = textes.nextNode(); n; n = textes.nextNode()) {
      if (/^\d{2}:\d{2}$/.test(n.textContent ?? "") && n.parentElement?.textContent?.startsWith("Mis à jour à ")) n.textContent = "12:00";
    }
    /* Un jour sur deux est écrit sous le graphique, en finissant par aujourd’hui */
    const jours = Array.from(main.querySelectorAll('svg[role="img"] text'));
    const reference = Date.UTC(2026, 9, 10);
    jours.forEach((jour, k) => (jour.textContent = String(new Date(reference - (jours.length - 1 - k) * 2 * 86400e3).getUTCDate())));
  });
}

/** Fait défiler la révélation du verdict carte par carte, et capture chacune (`prefixe`-1, -2…). Renvoie le nombre de cartes. */
async function capturerLaRevelation(page: Page, prefixe: string): Promise<number> {
  const premiere = page.getByRole("heading", { name: /^Étape 1 sur \d+ : / });
  await expect(premiere).toBeVisible();
  const sur = Number((await premiere.textContent())?.match(/sur (\d+)/)?.[1]);
  await attendreLaScene(page, 64, sur);
  for (let n = 1; n <= sur; n++) {
    await expect(page.getByRole("heading", { name: new RegExp(`^Étape ${n} sur ${sur} : `) })).toBeVisible();
    await capturer(page, `${prefixe}-${n}`);
    if (n < sur) await page.getByRole("button", { name: "Suivant" }).click();
  }
  return sur;
}

test("les pages publiques, sans compte", async ({ page }) => {
  await test.step("la landing", async () => {
    await page.goto("/");
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toContainText("en dit plus");
    await parcourirLaLanding(page);
    await capturer(page, "accueil");
  });

  const ecrans: [string, string, string][] = [
    ["commencer", "/commencer", "Vous vous parlez où ?"],
    ["commencer-beta-fermee", `${URL_BETA}/commencer`, "Vous vous parlez où ?"],
    ["importer-export-whatsapp", "/importer/export?app=whatsapp", "Exporte votre conv."],
    ["importer-export-instagram", "/importer/export?app=instagram", "Exporte votre conv."],
    ["importer-captures-autre", "/importer/captures?app=autre", "Choisis tes captures."],
    ["importer-captures-imessage", "/importer/captures?app=imessage", "Filme ta conv."],
    ["connexion", "/connexion", "Retrouve tes convs."],
    ["attente", "/attente", "BLUSH est en bêta privée."],
    ["confidentialite", "/confidentialite", "Ta conv, en sécurité."],
    ["introuvable", "/une-adresse-qui-n-existe-pas", "Cette page n’existe pas."],
  ];
  for (const [nom, adresse, titre] of ecrans)
    await test.step(nom, async () => {
      await page.goto(adresse);
      await expect(page.getByRole("heading", { level: 1, name: titre })).toBeVisible();
      await capturer(page, nom);
    });

  await test.step("une page qui plante", async () => {
    const partage = await partageIllisible();
    try {
      await page.goto(`/v/${partage.id}`);
      await expect(page.getByRole("heading", { level: 1, name: "Ça a coincé de notre côté." })).toBeVisible();
      /*
       * Le code de référence (le digest de Next) est une empreinte du message et de la pile de l’erreur : il change avec
       * les fichiers du build. On vérifie qu’il est là, puis on le fige le temps de la capture (même nombre de chiffres
       * qu’un digest de Next, au plus 10).
       */
      const code = page.getByText(/^Code de référence/).locator("span");
      await expect(code).toHaveText(/^\d+$/);
      await code.evaluate((n) => void (n.textContent = "1234567890"));
      await capturer(page, "erreur-serveur");
    } finally {
      await partage.effacer();
    }
  });
});

test("le parcours d’un nouveau venu : une conv refusée, l’import, qui es-tu, l’email, le code", async ({ page }, testInfo) => {
  /* Le bouton « Renvoyer le code » attend une minute (CODE_RENVOI_S) */
  test.slow();
  const email = await emailFixe("parcours");

  await test.step("une conv trop courte : l’écran d’erreur de l’import", async () => {
    await ouvrirExportWhatsApp(page);
    await choisirFichier(page, exportWhatsApp(testInfo, { n: 49, format: "txt" }).chemin);
    await expect(page.getByRole("alertdialog", { name: "Votre conv est encore trop courte." })).toBeVisible();
    await capturer(page, "import-erreur-courte");
  });

  await test.step("la conv importée", async () => {
    await importerWhatsApp(page, exportWhatsApp(testInfo));
    await capturer(page, "import-ok");
    await page.getByRole("link", { name: "Continuer" }).click();
  });

  await test.step("qui es-tu, vide puis rempli", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "Qui es-tu dans cette conv ?" })).toBeVisible();
    await capturer(page, "qui");
    await repondreQui(page, REPONSES_NOE);
    await capturer(page, "qui-rempli");
    await page.getByRole("button", { name: "Continuer" }).click();
  });

  await test.step("l’email", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "On t’envoie ton rapport où ?" })).toBeVisible();
    await capturer(page, "email");
  });

  await test.step("le code, une fois « Renvoyer le code » libre (son compte à rebours avance chaque seconde)", async () => {
    await demanderCode(page, email);
    await expect(page.getByRole("button", { name: "Renvoyer le code" })).toBeEnabled({ timeout: 70_000 });
    await capturer(page, "email-code");
  });
});

test("la lecture en cours", async ({ page }, testInfo) => {
  const email = await emailFixe("lecture");
  await lectureFaite(page, testInfo, email);
  /*
   * Le modèle factice lit en un instant : la tâche du verdict remise « en cours », à mi-chemin, comme pendant la
   * réflexion du modèle. Son battement de cœur dans une heure : personne ne la croit abandonnée, rien ne la relance.
   */
  await sql()`
    update tasks set status = 'en_cours', progress = 50, heartbeat_at = now() + interval '1 hour', updated_at = now() - interval '10 minutes'
    where kind = 'verdict' and story_id = ${derniereHistoire(email)}`;
  await page.goto("/lecture");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("BLUSH analyse tes 46 messages");
  await capturer(page, "lecture-en-cours");
});

test("compte gratuit : la lecture finie, la révélation du verdict, le rapport, le paiement, Mon compte", async ({ page }, testInfo) => {
  test.slow();
  const email = await emailFixe("gratuit");
  await lectureFaite(page, testInfo, email);
  await figerLHeureDuVerdict(email);

  await test.step("la lecture finie", async () => {
    await page.goto("/lecture");
    await attendreLecture(page);
    await capturer(page, "lecture-finie");
    await page.getByRole("link", { name: "Voir mon rapport" }).click();
  });

  await test.step("la révélation du verdict, carte par carte", async () => {
    await expect(page).toHaveURL(/\/rapport\/verdict$/);
    await pagePrete(page);
    expect(await capturerLaRevelation(page, "verdict-gratuit"), "les cartes d’un compte gratuit").toBe(4);
    await page.getByRole("link", { name: "Voir mon rapport" }).click();
  });

  const rapport = page.getByRole("main");
  await test.step("le rapport gratuit, en haut", async () => {
    await expect(page).toHaveURL(/\/rapport$/);
    await pagePrete(page);
    await expect(rapport.getByRole("heading", { level: 1, name: "Noé & Maëlys" })).toBeVisible();
    await capturer(page, "rapport-gratuit");
  });

  await test.step("les chapitres fermés", async () => {
    await rapport.getByText("La suite de ton rapport · 7 chapitres").scrollIntoViewIfNeeded();
    await capturer(page, "rapport-gratuit-chapitres-fermes");
  });

  await test.step("le paiement, ouvert par un chapitre fermé", async () => {
    await rapport.getByRole("button", { name: /Ce qui coince/ }).click();
    await expect(page.getByRole("dialog", { name: PAIEMENT })).toBeVisible();
    await capturer(page, "rapport-gratuit-paiement");
    await fermerLaFeuille(page);
    await expect(page.getByRole("dialog", { name: PAIEMENT })).toBeHidden();
  });

  await test.step("Mon compte", async () => {
    await ouvrir(page, "/compte");
    await expect(page.getByRole("link", { name: "Lire la suite" })).toBeVisible();
    await capturer(page, "compte-gratuit");
  });

  await test.step("le chat, sous le paiement de BLUSH+", async () => {
    await ouvrir(page, "/app");
    await expect(page.getByRole("dialog", { name: PAIEMENT })).toBeVisible();
    await capturer(page, "app-gratuit-paiement");
  });

  await test.step("ta question, sous le paiement", async () => {
    await page.goto("/rapport/question");
    await expect(page.getByRole("dialog", { name: PAIEMENT })).toBeVisible();
    await capturer(page, "rapport-question-gratuit");
  });
});

test("le rapport qui s’écrit, juste après l’accès", async ({ page }, testInfo) => {
  const email = await emailFixe("ecriture");
  await lectureFaite(page, testInfo, email);
  await definirPlan(email, "blushplus");
  /*
   * Le modèle factice écrit en un instant : le plan du rapport posé « en cours », aux deux cinquièmes, comme pendant
   * l’écriture. Son battement de cœur dans une heure : personne ne le croit abandonné, rien ne le relance, et la suite
   * (les chapitres, le vocal, la mémoire) attend qu’il finisse.
   */
  await sql()`
    insert into tasks (story_id, kind, status, attempts, progress, heartbeat_at, updated_at)
    values (${derniereHistoire(email)}, 'rapport_plan', 'en_cours', 1, 40, now() + interval '1 hour', now())`;
  const rapport = await ouvrirLeRapport(page);
  await expect(rapport.getByText("La suite de ton rapport s’écrit · 7 chapitres")).toBeVisible();
  await capturer(page, "rapport-ecriture");
});

test("BLUSH+ : la landing, l’accueil, sa fiche, Mon compte, la révélation, le rapport, le partage, ta question, un message", async ({ page, autreAppareil }, testInfo) => {
  test.slow();
  const email = await lectureBlushPlus(page, testInfo);
  await figerLHeureDuVerdict(email);
  /* Le chapitre 2 tel que l’écrit le vrai modèle : la révélation montre aussi « le moment » et « à toi de jouer » */
  await rapportCommeLeVraiModele(email);
  await figerLeLien(page, testInfo);

  await test.step("la landing, connecté", async () => {
    await page.goto("/");
    await expect(page.getByRole("main").getByRole("link", { name: "Retrouver ma conv" }).first()).toBeVisible();
    await parcourirLaLanding(page);
    await capturer(page, "blushplus-accueil-connecte");
  });

  await test.step("l’accueil : l’intro de BLUSH", async () => {
    await ouvrir(page, "/app");
    await expect(filDuChat(page).getByText("Elle vient de répondre ?")).toBeVisible();
    await capturer(page, "blushplus-app-intro");
  });

  await test.step("sa fiche", async () => {
    await ouvrir(page, "/app/fiche");
    await expect(page.getByRole("heading", { level: 1, name: "Maëlys" })).toBeVisible();
    await capturer(page, "blushplus-fiche");
  });

  await test.step("Mon compte", async () => {
    await ouvrir(page, "/compte");
    await expect(page.getByRole("main").getByRole("button", { name: /^Tout effacer/ })).toBeVisible();
    await capturer(page, "blushplus-compte");
  });

  await test.step("la révélation du verdict, carte par carte : le moment et « à toi de jouer » viennent du chapitre 2", async () => {
    await page.goto("/rapport/verdict");
    expect(await capturerLaRevelation(page, "blushplus-verdict"), "les cartes d’un compte BLUSH+").toBe(5);
  });

  const rapport = page.getByRole("main");
  await test.step("le rapport complet, en haut", async () => {
    await ouvrirLeRapport(page);
    await expect(rapport.getByText("Complet", { exact: true })).toBeVisible();
    await capturer(page, "blushplus-rapport");
  });

  await test.step("le rapport, au chapitre 3", async () => {
    await allerAuChapitre(page, 3, "Ch. 3");
    await capturer(page, "blushplus-rapport-chapitre-3");
  });

  await test.step("la feuille de partage", async () => {
    await ouvrirLeRapport(page);
    const feuille = await ouvrirLePartage(page);
    await expect(feuille.getByRole("img").first()).toBeVisible();
    await capturer(page, "blushplus-partage");
  });

  await test.step("le verdict partagé, vu par un pote", async () => {
    const pote = await autreAppareil();
    await figer(pote.context());
    await pote.goto(`/v/${LIEN}`);
    await expect(pote.getByRole("link", { name: "Analyser ma conv" })).toBeVisible();
    await capturer(pote, "verdict-partage");
  });

  await test.step("ta question", async () => {
    await page.goto("/rapport/question");
    await expect(page.getByRole("log", { name: "Ta conversation avec BLUSH" }).getByText("une question sur vous deux ? balance")).toBeVisible();
    await capturer(page, "blushplus-question");
  });

  await test.step("l’accueil, après un message", async () => {
    await ouvrir(page, "/app");
    expect(await ecrireABlush(page, "on s’est vus hier soir, c’était trop bien")).toBe(200);
    await expect(champDuChat(page)).toHaveValue("");
    await expect(filDuChat(page).getByText("tu lui as répondu quoi ?")).toBeVisible();
    await capturer(page, "blushplus-app-message");
  });
});

test("BLUSH+ : « Tes convs », avec deux convs", async ({ page }, testInfo) => {
  test.slow();
  const email = await nouvelInvite(testInfo, 1);
  await connecterParApi(page, testInfo, email);
  await lireUneConvParApi(page, testInfo);
  await lireUneConvParApi(page, testInfo, { personnes: { toi: "Noé", autre: "Romane" } });
  await attendreTaches(email);
  await ouvrir(page, "/app/convs");
  await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "Tes convs" })).toBeVisible();
  await capturer(page, "blushplus-convs");
});

test("le tableau de bord de l’équipe", async ({ page }, testInfo) => {
  /* Il compte toute la base : vidée, puis une seule lecture gratuite */
  await viderLaBase();
  await lectureFaite(page, testInfo, await emailFixe("tableau"));
  await page.context().clearCookies();
  await seConnecterAdmin(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
  await figerLeTableauDeBord(page);
  await capturer(page, "admin");
});
