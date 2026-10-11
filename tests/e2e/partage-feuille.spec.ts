import { attendreLaScene, DESSIN, emailLibre, expect, lectureFaite, liensDe, mesurerCompteurs, noterLaFeuilleDuSysteme, ouvrirLePartage, partageDeFichiers, releverLePressePapiers, test } from "./aide";

/*
 * « Partager mon verdict » : la feuille de partage, depuis le rapport et depuis la révélation du verdict, et « En savoir
 * plus », ce que BLUSH fait de ta conv. Le lien public (/v/<id>) est créé à la première ouverture, puis c’est toujours
 * le même, jusqu’à ce qu’on le désactive. Ce qu’il montre aux potes : partage-lien.spec.ts.
 */

/* Le verdict du modèle factice (src/server/ia/factice.ts) */
const EMOJI = "🤏";
const TITRE = "Vous êtes à deux doigts.";
const VERDICT = `${EMOJI} ${TITRE}`;
/* Le texte qui part avec le lien, dans WhatsApp ou Messages (src/app/rapport/Partage.tsx) */
const texteAvecLien = (url: string) => `j’ai fait lire notre conv à BLUSH 💀\nverdict\u00a0: ${EMOJI} «\u00a0${TITRE}\u00a0»\n${url}`;
const texteDe = (href: string | null) => new URL(href!).searchParams.get("text");

test("depuis le rapport : l’aperçu du lien, copier, WhatsApp, Messages ; le même lien à chaque ouverture", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "partage");
  const copie = await releverLePressePapiers(page);
  await lectureFaite(page, testInfo, email);
  await page.goto("/rapport");
  const partager = page.getByRole("main").getByRole("button", { name: "Partager mon verdict" });

  const { feuille, id } = await test.step("la première ouverture crée le lien, et montre l’aperçu tel qu’il s’affichera dans une conv", async () => {
    expect(await liensDe(email)).toEqual([]);
    const feuille = await mesurerCompteurs(() => ouvrirLePartage(page), { partage_ouvert: 1, lien_cree: 1 });
    /* La carte de l’aperçu, dessinée par le serveur : « Préparation de la carte » s’efface quand elle est là */
    await expect(feuille.getByRole("img", { name: VERDICT })).toBeVisible();
    await expect(feuille.getByRole("status", { name: "Préparation de la carte" })).toBeHidden({ timeout: DESSIN });
    await expect(feuille.getByRole("figure")).toContainText(VERDICT);
    await expect(feuille.getByRole("figure")).toContainText("askblush.com");
    await expect(feuille.getByText("Le lien montre ce verdict, rien d’autre : ni vos messages, ni son prénom.")).toBeVisible();
    const liens = await liensDe(email);
    expect(liens).toHaveLength(1);
    return { feuille, id: liens[0] };
  });
  const url = `${testInfo.project.use.baseURL}/v/${id}`;

  await test.step("« Copier » met le lien dans le presse-papiers", async () => {
    await feuille.getByRole("button", { name: "Copier" }).click();
    await expect(feuille.getByRole("button", { name: "Copié" })).toBeVisible();
    expect(await copie()).toBe(url);
    /* Le bouton redevient « Copier » après un instant */
    await expect(feuille.getByRole("button", { name: "Copier" })).toBeVisible();
  });

  await test.step("WhatsApp et Messages partent avec le verdict et le lien", async () => {
    expect(texteDe(await feuille.getByRole("link", { name: "WhatsApp" }).getAttribute("href"))).toBe(texteAvecLien(url));
    const messages = await feuille.getByRole("link", { name: "Messages" }).getAttribute("href");
    expect(messages).toMatch(/^sms:\?&body=/);
    expect(decodeURIComponent(messages!.replace("sms:?&body=", ""))).toBe(texteAvecLien(url));
  });

  await test.step("fermée puis rouverte sur la même page : le même lien, sans le redemander", async () => {
    await feuille.getByRole("button", { name: "Fermer" }).click();
    await expect(feuille).toBeHidden();
    await mesurerCompteurs(async () => {
      await partager.click();
      await expect(feuille).toBeVisible();
    }, {});
    expect(texteDe(await feuille.getByRole("link", { name: "WhatsApp" }).getAttribute("href"))).toBe(texteAvecLien(url));
  });

  await test.step("le rapport rechargé : l’ouverture compte, et c’est toujours le même lien", async () => {
    await page.goto("/rapport");
    await mesurerCompteurs(() => ouvrirLePartage(page), { partage_ouvert: 1 });
    expect(texteDe(await feuille.getByRole("link", { name: "WhatsApp" }).getAttribute("href"))).toBe(texteAvecLien(url));
    expect(await liensDe(email)).toEqual([id]);
  });
});

test("« Désactiver le lien » : la page ne montre plus rien, et le partage suivant crée un autre lien", async ({ page, request }, testInfo) => {
  const email = emailLibre(testInfo, "desactive");
  await lectureFaite(page, testInfo, email);
  await page.goto("/rapport");
  const feuille = await mesurerCompteurs(() => ouvrirLePartage(page), { partage_ouvert: 1, lien_cree: 1 });
  const [ancien] = await liensDe(email);

  await test.step("une demande venue d’un autre site ne le désactive pas", async () => {
    const forgee = await page.request.delete("/api/partage", { headers: { origin: "https://ailleurs.example" } });
    expect(forgee.status()).toBe(403);
    expect(await liensDe(email)).toEqual([ancien]);
  });

  await test.step("désactivé : la feuille se ferme, le lien n’existe plus", async () => {
    await feuille.getByRole("button", { name: "Désactiver le lien" }).click();
    await expect(feuille).toBeHidden();
    await expect.poll(() => liensDe(email)).toEqual([]);
  });

  await test.step("l’ancien lien ne montre plus le verdict, ni son image", async () => {
    await mesurerCompteurs(async () => {
      await page.goto(`/v/${ancien}`);
      await expect(page.getByRole("heading", { level: 1, name: "Ce lien ne montre plus rien." })).toBeVisible();
    }, {});
    await expect(page.getByText("La personne qui l’a partagé l’a désactivé. C’est elle qui décide.")).toBeVisible();
    await expect(page.getByText(TITRE)).toHaveCount(0);
    await expect(page).toHaveTitle("Lien désactivé · BLUSH");
    expect((await request.get(`/v/${ancien}/image`)).status()).toBe(404);
  });

  await test.step("repartager crée un nouveau lien", async () => {
    await page.goto("/rapport");
    await mesurerCompteurs(() => ouvrirLePartage(page), { partage_ouvert: 1, lien_cree: 1 });
    const liens = await liensDe(email);
    expect(liens).toHaveLength(1);
    expect(liens[0]).not.toBe(ancien);
  });
});

test("« Story » sur ordinateur : l’image du verdict s’enregistre, prête pour une story", async ({ page }, testInfo) => {
  test.skip(await partageDeFichiers(page), "ce navigateur sait partager un fichier : « Story » ouvre la feuille du système (test suivant)");
  const email = emailLibre(testInfo, "story");
  await lectureFaite(page, testInfo, email);
  await page.goto("/rapport");
  const feuille = await mesurerCompteurs(() => ouvrirLePartage(page), { partage_ouvert: 1, lien_cree: 1 });
  /* L’image story se prépare avant le toucher : le bouton s’active quand elle est là */
  const story = feuille.getByRole("button", { name: "Story" });
  await expect(story).toBeEnabled({ timeout: DESSIN });
  const [telechargement] = await Promise.all([page.waitForEvent("download"), story.click()]);
  expect(telechargement.suggestedFilename()).toBe("verdict-blush.png");
  await expect(feuille.getByText("Image enregistrée.")).toBeVisible();
});

test("« Story » sur iPhone : la feuille de partage du système reçoit l’image du verdict", async ({ page }, testInfo) => {
  test.skip(!(await partageDeFichiers(page)), "ce navigateur ne sait pas partager un fichier : l’image s’enregistre (test précédent)");
  /* La feuille du système, que Playwright ne pilote pas, remplacée par une feuille qui note ce qu’on lui donne */
  const partages = await noterLaFeuilleDuSysteme(page);
  const email = emailLibre(testInfo, "story-iphone");
  await lectureFaite(page, testInfo, email);
  await page.goto("/rapport");
  const feuille = await mesurerCompteurs(() => ouvrirLePartage(page), { partage_ouvert: 1, lien_cree: 1 });
  const story = feuille.getByRole("button", { name: "Story" });
  await expect(story).toBeEnabled({ timeout: DESSIN });
  await story.click();
  await expect.poll(partages).toEqual([{ nom: "verdict-blush.png", type: "image/png", octets: expect.any(Number) }]);
  expect((await partages())[0].octets).toBeGreaterThan(0);
  /* Partagé, rien ne s’enregistre en plus */
  await expect(feuille.getByText("Image enregistrée.")).toHaveCount(0);
});

test("depuis la révélation du verdict : la même feuille ; Échap la ferme sans quitter le verdict", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "revelation");
  await lectureFaite(page, testInfo, email);
  /* La lecture finie : l’écran de la lecture mène au verdict */
  await page.goto("/lecture");
  await page.getByRole("link", { name: "Voir mon rapport" }).click();
  /* « Voir mon rapport » recharge toute la page : la scène répond une fois vivante (les 64 messages de la conv) */
  await attendreLaScene(page, 64);
  const suivant = page.getByRole("button", { name: "Suivant" });
  await suivant.click();
  await expect(page.getByRole("heading", { name: "Étape 2 sur 4 : Vous êtes à deux doigts." })).toBeVisible();
  await suivant.click();
  await suivant.click();
  const derniere = page.getByRole("heading", { name: "Étape 4 sur 4 : Ton rapport est prêt." });
  await expect(derniere).toBeVisible();

  const feuille = await mesurerCompteurs(() => ouvrirLePartage(page, page.getByRole("button", { name: "Partager mon verdict" })), { partage_ouvert: 1, lien_cree: 1 });
  const [id] = await liensDe(email);
  expect(texteDe(await feuille.getByRole("link", { name: "WhatsApp" }).getAttribute("href"))).toBe(texteAvecLien(`${testInfo.project.use.baseURL}/v/${id}`));
  await expect(feuille.getByRole("img", { name: VERDICT })).toBeVisible();

  await test.step("Échap ferme la feuille, la dernière carte reste ; un second Échap mène au rapport", async () => {
    await page.keyboard.press("Escape");
    await expect(feuille).toBeHidden();
    await expect(page).toHaveURL(/\/rapport\/verdict$/);
    await expect(derniere).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/rapport$/);
  });

  await test.step("le rapport partage le même lien", async () => {
    await mesurerCompteurs(() => ouvrirLePartage(page), { partage_ouvert: 1 });
    expect(await liensDe(email)).toEqual([id]);
  });
});

test("« En savoir plus » : ce que BLUSH fait de ta conv, et la main sur ton compte", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "confidentialite");
  await lectureFaite(page, testInfo, email);
  await page.goto("/rapport");
  const rapport = page.getByRole("main");
  const enSavoirPlus = rapport.getByRole("button", { name: "En savoir plus" });
  await expect(rapport.getByText("Ta conv reste à toi, et c’est toi qui décides.")).toBeVisible();

  const feuille = page.getByRole("dialog", { name: "Ta conv reste à toi." });
  await test.step("la feuille dit ce que devient la conv, et que rien ne part sans toi", async () => {
    await enSavoirPlus.click();
    await expect(feuille).toBeVisible();
    await expect(feuille.getByText("Chiffrée, lue seulement par l’IA")).toBeVisible();
    await expect(feuille.getByText("Ta conv, ton rapport et le chat sont chiffrés. Personne chez BLUSH ne les lit.")).toBeVisible();
    await expect(feuille.getByText("Effacée après ton rapport")).toBeVisible();
    await expect(feuille.getByText("La conv brute part dès que ton rapport est prêt. D’ici là, elle reste chiffrée, et tu la supprimes quand tu veux. Une conv jamais lue est effacée au bout de 24\u00a0h.")).toBeVisible();
    await expect(feuille.getByText("Rien ne sort sans toi")).toBeVisible();
    await expect(feuille.getByText("La personne avec qui tu parles n’est jamais contactée. Quand tu partages, seul ton verdict part, sans son prénom.")).toBeVisible();
    /* Cette feuille ne crée aucun lien */
    expect(await liensDe(email)).toEqual([]);
  });

  await test.step("Fermer la referme ; « Notre politique de confidentialité » mène à la politique", async () => {
    await feuille.getByRole("button", { name: "Fermer" }).click();
    await expect(feuille).toBeHidden();
    await enSavoirPlus.click();
    await feuille.getByRole("link", { name: "Notre politique de confidentialité" }).click();
    await expect(page).toHaveURL(/\/confidentialite$/);
    await expect(page).toHaveTitle(/^Ta conv, en sécurité/);
  });

  await test.step("« Gérer mon compte » mène au compte, avec cette histoire", async () => {
    await page.goto("/rapport");
    await enSavoirPlus.click();
    await expect(feuille).toBeVisible();
    await feuille.getByRole("link", { name: /^Gérer mon compte/ }).click();
    await expect(page).toHaveURL(/\/compte$/);
    await expect(page.getByText("Maëlys et toi").first()).toBeVisible();
  });
});

test("sans session, ou depuis un autre site, l’API du partage ne crée ni ne dessine rien", async ({ request }, testInfo) => {
  const origine = { origin: testInfo.project.use.baseURL! };
  await mesurerCompteurs(async () => {
    /* Sans l’en-tête Origin de l’appli : refusé avant tout */
    const sansOrigine = await request.post("/api/partage");
    expect(sansOrigine.status()).toBe(403);
    expect(await sansOrigine.json()).toEqual({ erreur: "origine" });
    expect((await request.post("/api/partage", { headers: { origin: "https://ailleurs.example" } })).status()).toBe(403);
    /* De l’appli, mais sans session */
    const sansSession = await request.post("/api/partage", { headers: origine });
    expect(sansSession.status()).toBe(401);
    expect(await sansSession.json()).toEqual({ erreur: "connexion" });
    expect((await request.get("/api/partage")).status()).toBe(401);
    expect((await request.delete("/api/partage", { headers: origine })).status()).toBe(401);
    expect((await request.post("/api/partage/image", { headers: origine, data: { type: "reponse", echange: 1 } })).status()).toBe(401);
    expect((await request.post("/api/partage/compte", { headers: origine })).status()).toBe(401);
  }, {});
});
