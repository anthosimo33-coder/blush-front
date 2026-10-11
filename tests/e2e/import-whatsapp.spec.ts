import {
  attendreLaScene,
  attendreLecture,
  carteDuVerdict,
  choisirFichier,
  compteDe,
  demanderCode,
  devices,
  emailLibre,
  expect,
  exportWhatsApp,
  exportWhatsAppAndroid,
  histoiresDe,
  importerWhatsApp,
  jusquAuCode,
  mailsPour,
  ouvrirExportWhatsApp,
  quiEnregistre,
  repondreQui,
  saisirLeCodeRecu,
  tachesDe,
  test,
  toucherLaScene,
} from "./aide";

/*
 * L’import d’un export WhatsApp par quelqu’un qui découvre BLUSH, jusqu’au rapport : le _chat.txt seul ou le .zip de
 * l’iPhone, « Qui es-tu ? » (chaque réponse, et les objectifs du couple), l’email et son code, la lecture, puis la
 * révélation du verdict qu’on parcourt dans les deux sens. Un compte gratuit : quatre cartes, le verdict seul s’écrit.
 */

test("export .txt : Maëlys importe, en couple, puis parcourt son verdict dans les deux sens jusqu’à « Passer »", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "import-txt");
  /* 64 messages entre Noé et Maëlys, du 4 au 7 septembre, dont 2 vocaux : c’est Maëlys qui importe */
  const conv = exportWhatsApp(testInfo, { format: "txt" });

  await test.step("les étapes de l’export, celles de l’appareil : l’iPhone sur un iPhone, iPhone et Android ailleurs", async () => {
    await ouvrirExportWhatsApp(page);
    const etapes = (await page.evaluate(() => /iPhone|iPad|iPod/.test(navigator.userAgent)))
      ? ["Ouvre votre conv", "Touche son nom en haut", "Exporter la discussion, sans médias", "Enregistre dans Fichiers"]
      : ["Ouvre votre conv", "Touche son nom en haut (iPhone) ou ⋮ puis Plus (Android)", "Exporter la discussion, sans médias", "Enregistre dans Fichiers (iPhone) ou Drive (Android)"];
    for (const etape of etapes) await expect(page.getByText(etape, { exact: true })).toBeVisible();
  });

  await test.step("le _chat.txt seul est importé : son nom, ses dates, ses messages et ses vocaux", async () => {
    await choisirFichier(page, conv.chemin);
    await expect(page.getByRole("heading", { level: 1, name: "C’est bon, on a votre conv." })).toBeVisible();
    await expect(page.getByText("_chat.txt", { exact: true })).toBeVisible();
    await expect(page.getByText("4 sept. → 7 sept.")).toBeVisible();
    await expect(page.getByText(String(conv.messages), { exact: true })).toBeVisible();
    await expect(page.getByText(`messages · ${conv.vocaux} vocaux`)).toBeVisible();
    await page.getByRole("link", { name: "Continuer" }).click();
  });

  await test.step("qui es-tu : une réponse par question, et « Continuer » attend les quatre", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "Qui es-tu dans cette conv\u00a0?" })).toBeVisible();
    const continuer = page.getByRole("button", { name: "Continuer" });
    const choix = (nom: string) => page.getByRole("radio", { name: nom });
    await expect(continuer).toBeDisabled();
    /* Les deux personnes de la conv, la plus bavarde d’abord ; un seul « c’est moi » */
    await expect(page.getByRole("radiogroup", { name: "Qui es-tu dans cette conv\u00a0?" }).getByRole("radio")).toHaveText([/Noé/, /Maëlys/]);
    await choix("Noé").click();
    await choix("Maëlys").click();
    await expect(choix("Maëlys")).toBeChecked();
    await expect(choix("Noé")).not.toBeChecked();
    await choix("Une fille").click();
    await choix("On s’est vus").click();
    await expect(continuer).toBeDisabled();
    await choix("Qu’on soit ensemble").click();
    await expect(continuer).toBeEnabled();
  });

  await test.step("qui es-tu : « En couple » propose les objectifs du couple, et décoche celui qui n’y est pas", async () => {
    const continuer = page.getByRole("button", { name: "Continuer" });
    const choix = (nom: string) => page.getByRole("radio", { name: nom });
    const objectifs = page.getByRole("radiogroup", { name: "Ce que tu veux" }).getByRole("radio");
    await expect(objectifs).toHaveText(["Qu’on soit ensemble", "Savoir si c’est réciproque", "Juste comprendre"]);
    await choix("En couple").click();
    await expect(objectifs).toHaveText(["Que ça aille mieux", "Savoir où on en est", "Juste comprendre"]);
    await expect(page.getByRole("radiogroup", { name: "Ce que tu veux" }).getByRole("radio", { checked: true })).toHaveCount(0);
    await expect(continuer).toBeDisabled();
    /* « Juste comprendre » est des deux côtés : il reste coché en changeant d’avis */
    await choix("Juste comprendre").click();
    await choix("On se parle").click();
    await expect(choix("Juste comprendre")).toBeChecked();
    await choix("En couple").click();
    await expect(choix("Juste comprendre")).toBeChecked();
    await choix("Que ça aille mieux").click();
    await expect(choix("Juste comprendre")).not.toBeChecked();
    await continuer.click();
  });

  await test.step("l’email reçoit un code, le bon code lance la lecture", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "On t’envoie ton rapport où\u00a0?" })).toBeVisible();
    const depuis = await demanderCode(page, email);
    await expect(page.getByText(email)).toBeVisible();
    await saisirLeCodeRecu(page, email, depuis);
  });

  await test.step("la lecture des 64 messages se termine, et mène au verdict", async () => {
    await attendreLecture(page);
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(`BLUSH analyse tes\\s*${conv.messages}\\s*messages`) })).toBeVisible();
    await expect(page.getByRole("main").getByRole("status")).toHaveText("Ton rapport est prêt.");
    await page.getByRole("link", { name: "Voir mon rapport" }).click();
  });

  await test.step("le verdict : les flèches du clavier avancent et reculent, sans dépasser la première carte", async () => {
    await attendreLaScene(page, conv.messages);
    /* Les chiffres de la conv importée : une appli, 2 vocaux (sa durée : voir le test.fixme plus bas) */
    for (const chiffre of ["1 appli", `${conv.vocaux} vocaux`]) await expect(page.getByText(chiffre, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Précédent" })).toHaveCount(0);
    await page.keyboard.press("ArrowLeft");
    await expect(carteDuVerdict(page, 1, 4, `${conv.messages} messages, du premier au dernier.`)).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(carteDuVerdict(page, 2, 4, "Vous êtes à deux doigts.")).toBeVisible();
    await expect(page.getByText("Elle a posé la question, t’as esquivé.")).toBeVisible();
    await expect(page.getByText("7 preuves dans votre conv")).toBeVisible();
  });

  await test.step("le verdict : un toucher à droite avance, à gauche recule ; Maëlys y est « Toi », Noé « Il »", async () => {
    await toucherLaScene(page, "droite");
    await expect(carteDuVerdict(page, 3, 4, "Entre vous deux")).toBeVisible();
    const scene = page.getByRole("main");
    await expect(scene.getByText("Toi", { exact: true })).toBeVisible();
    await expect(scene.getByText("Il", { exact: true })).toBeVisible();
    await expect(scene.getByText("C’est flou parce que t’as esquivé.")).toBeVisible();
    await toucherLaScene(page, "gauche");
    await expect(carteDuVerdict(page, 2, 4, "Vous êtes à deux doigts.")).toBeVisible();
    await page.getByRole("button", { name: "Précédent" }).click();
    await expect(carteDuVerdict(page, 1, 4, `${conv.messages} messages, du premier au dernier.`)).toBeVisible();
  });

  await test.step("le verdict : « Suivant » jusqu’à la dernière carte, où l’on ne va pas plus loin", async () => {
    const suivant = page.getByRole("button", { name: "Suivant" });
    await suivant.click();
    await expect(carteDuVerdict(page, 2, 4, "Vous êtes à deux doigts.")).toBeVisible();
    await suivant.click();
    await expect(carteDuVerdict(page, 3, 4, "Entre vous deux")).toBeVisible();
    await suivant.click();
    await expect(carteDuVerdict(page, 4, 4, "Ton rapport est prêt.")).toBeVisible();
    await expect(suivant).toHaveCount(0);
    /* Au bout, → ne compte pas : ← ramène tout de suite à la carte d’avant */
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await expect(carteDuVerdict(page, 3, 4, "Entre vous deux")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(carteDuVerdict(page, 4, 4, "Ton rapport est prêt.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir mon rapport" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Partager mon verdict" })).toBeVisible();
  });

  await test.step("« Passer » mène au rapport, et « Retour » ne rouvre pas la scène du verdict", async () => {
    await page.getByRole("link", { name: "Passer" }).click();
    await expect(page).toHaveURL(/\/rapport$/);
    const rapport = page.getByRole("main");
    await expect(rapport.getByRole("heading", { level: 1, name: "Noé & Maëlys" })).toBeVisible();
    await expect(rapport.getByRole("region", { name: "Chapitre 1 : Le verdict" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/lecture$/);
    /* La lecture finie le reste : le bouton est là tout de suite */
    await expect(page.getByRole("link", { name: "Voir mon rapport" })).toBeVisible();
  });

  await test.step("côté serveur : un compte gratuit, la conv lue avec les réponses de Qui es-tu ?", async () => {
    expect(await compteDe(email)).toMatchObject({ plan: "gratuit" });
    expect(await histoiresDe(email)).toEqual([expect.objectContaining({ messages: conv.messages })]);
    expect(await quiEnregistre(email)).toEqual({ moi: "Maëlys", pronom: "elle", devinette: "ensemble", objectif: "mieux" });
    expect((await tachesDe(email)).map((t) => [t.genre, t.statut])).toEqual([["verdict", "fini"]]);
    expect(mailsPour(email)).toHaveLength(1);
  });
});

test("export .zip : Noé importe, corrige son email, puis Échap passe le verdict", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "import-zip");
  /* L’export tel que l’iPhone le partage : « WhatsApp Chat - Maëlys.zip », avec le _chat.txt et une photo */
  const conv = exportWhatsApp(testInfo);

  await test.step("le .zip est importé : son nom, ses dates, ses messages et ses vocaux", async () => {
    await importerWhatsApp(page, conv);
    await expect(page.getByText(conv.nom, { exact: true })).toBeVisible();
    await expect(page.getByText("4 sept. → 7 sept.")).toBeVisible();
    await expect(page.getByText(String(conv.messages), { exact: true })).toBeVisible();
    await expect(page.getByText(`messages · ${conv.vocaux} vocaux`)).toBeVisible();
    await page.getByRole("link", { name: "Continuer" }).click();
  });

  await test.step("qui es-tu : Noé, un garçon, c’est flou, savoir si c’est réciproque", async () => {
    await repondreQui(page, { moi: "Noé", tuEs: "Un garçon", ou: "C’est flou", veux: "Savoir si c’est réciproque" });
    await page.getByRole("button", { name: "Continuer" }).click();
  });

  await test.step("un email incomplet est signalé, et le code ne part pas", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "On t’envoie ton rapport où\u00a0?" })).toBeVisible();
    const champ = page.getByLabel("Ton email");
    const recevoir = page.getByRole("button", { name: "Recevoir mon code" });
    await champ.fill("noe@e2e");
    await expect(recevoir).toBeDisabled();
    await champ.blur();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Vérifie ton email : il manque quelque chose.");
    await expect(page).toHaveURL(/\/email$/);
    await expect(champ).toHaveAttribute("aria-invalid", "true");
  });

  await test.step("l’email corrigé reçoit le code ; « Renvoyer le code » attend une minute", async () => {
    const depuis = await demanderCode(page, email);
    await expect(page.getByRole("button", { name: /^Renvoyer le code \(\d+ s\)$/ })).toBeDisabled();
    await saisirLeCodeRecu(page, email, depuis);
    await attendreLecture(page);
    await page.getByRole("link", { name: "Voir mon rapport" }).click();
  });

  await test.step("le verdict : Noé y est « Toi », Maëlys « Elle », et Échap mène au rapport", async () => {
    await attendreLaScene(page, conv.messages);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(carteDuVerdict(page, 3, 4, "Entre vous deux")).toBeVisible();
    await expect(page.getByRole("main").getByText("Elle", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/rapport$/);
    await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "Noé & Maëlys" })).toBeVisible();
  });

  await test.step("côté serveur : les réponses de Qui es-tu ? sont gardées avec la conv, un seul mail", async () => {
    expect(await quiEnregistre(email)).toEqual({ moi: "Noé", pronom: "il", devinette: "flou", objectif: "reciproque" });
    expect(mailsPour(email).map((m) => m.sujet)).toEqual([expect.stringMatching(/^\d{6}\u00a0: ton code BLUSH$/)]);
  });
});

test.describe("sur un téléphone Android", () => {
  /* Un Pixel : son écran, son navigateur, son toucher. Le moteur reste celui du projet : Chromium seulement */
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
  test.skip(({ browserName }) => browserName !== "chromium", "un téléphone Android : Chromium");

  test("l’export d’un Android : ses étapes à lui, et son format (« 04/09/2026 19:08 - Maëlys: … ») est lu", async ({ page }, testInfo) => {
    const conv = exportWhatsAppAndroid(testInfo);
    await ouvrirExportWhatsApp(page);
    for (const etape of ["Ouvre votre conv", "Touche ⋮ puis Plus", "Exporter la discussion, sans médias", "Enregistre dans Drive"]) await expect(page.getByText(etape, { exact: true })).toBeVisible();
    await expect(page.getByText("Touche son nom en haut", { exact: false })).toHaveCount(0);
    await choisirFichier(page, conv.chemin);
    await expect(page.getByRole("heading", { level: 1, name: "C’est bon, on a votre conv." })).toBeVisible();
    await expect(page.getByText(String(conv.messages), { exact: true })).toBeVisible();
    await expect(page.getByText("4 sept. → 7 sept.")).toBeVisible();
    await page.getByRole("link", { name: "Continuer" }).click();
    await expect(page.getByRole("radiogroup", { name: "Qui es-tu dans cette conv ?" }).getByRole("radio")).toHaveText([/Noé/, /Maëlys/]);
  });
});

/*
 * La durée de la conv se lit deux fois, à quelques secondes d’écart : « 64 messages en 4 jours » pendant la lecture
 * (src/server/ecrans/trouvailles.ts:91 compte du 4 au 7 septembre compris), puis « 3 jours » sur la première carte du verdict
 * (src/server/conv-affichee.ts, storyAffichee, ne compte pas le premier jour : deux jours de messages y font « 1 jour »). Le bon compte,
 * partout : 4 jours.
 */
test.fixme("la durée de la conv est la même pendant la lecture et sur le verdict : 4 jours, du 4 au 7 septembre", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "import-duree");
  const conv = exportWhatsApp(testInfo, { format: "txt" });
  await saisirLeCodeRecu(page, email, await jusquAuCode(page, conv, email));
  await attendreLecture(page);
  await expect(page.getByRole("list", { name: "Ce que BLUSH remarque" })).toContainText(`${conv.messages} messages en 4 jours`);
  await page.getByRole("link", { name: "Voir mon rapport" }).click();
  await attendreLaScene(page, conv.messages);
  await expect(page.getByText("4 jours", { exact: true })).toBeVisible();
});
