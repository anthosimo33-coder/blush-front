import { DESSIN, ecrireABlush, expect, filDuChat, lectureBlushPlus, mesurerCompteurs, noterLaFeuilleDuSysteme, ouvrir, ouvrirLeRapport, partageDeFichiers, reponseAuGeste, test } from "./aide";

/*
 * « Partager en image » une réponse de BLUSH dans le chat (BLUSH+, une fois la mémoire faite), ou la chute d’un chapitre
 * du rapport : le serveur dessine le moment en story, d’après le compte (jamais d’après la requête), le prénom de l’autre
 * masqué ; on la partage (la feuille du système, là où le navigateur sait partager un fichier) ou on l’enregistre. Le
 * masque ne se lit pas dans un PNG : masqueDe, que la route applique, a ses tests (tests/partage.test.ts).
 */

test("« Partager en image » une réponse du chat : la story dessinée par le serveur, partagée ou enregistrée", async ({ page }, testInfo) => {
  /* Là où le navigateur sait partager un fichier (Safari sur iPhone), « Partager » ouvre la feuille du système : on la remplace par une feuille qui note */
  const partages = (await partageDeFichiers(page)) ? await noterLaFeuilleDuSysteme(page) : null;
  /* Le chat attend la mémoire, la dernière étape de la chaîne */
  await lectureBlushPlus(page, testInfo);

  const conv = filDuChat(page);
  await test.step("une question, et la réponse de BLUSH (modèle factice)", async () => {
    await ouvrir(page, "/app");
    const question = "Maëlys me cherche ou pas ?";
    expect(await ecrireABlush(page, question)).toBe(200);
    await expect(conv.getByText(question)).toBeVisible();
    await expect(conv.getByText("elle te cherche 👀")).toBeVisible();
    await expect(conv.getByText("tu lui as répondu quoi ?")).toBeVisible();
  });

  const feuille = page.getByRole("dialog", { name: "Partager en image" });
  await test.step("« Partager » sous la réponse : la story (1080 × 1920), dessinée par le serveur, arrive dans la feuille", async () => {
    const image = await reponseAuGeste(page, { chemin: "/api/partage/image", timeout: DESSIN }, () => conv.getByRole("button", { name: "Partager", exact: true }).click());
    await expect(feuille).toBeVisible();
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
    /* L’échange partagé : celui de la question, jamais un texte venu du navigateur */
    expect(image.request().postDataJSON()).toEqual({ type: "reponse", echange: expect.any(Number) });
    /* L’image affichée, telle qu’elle partira : au format story */
    const apercu = feuille.getByRole("img", { name: "L’image à partager" });
    await expect(apercu).toBeVisible();
    await expect.poll(() => apercu.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([1080, 1920]);
    await expect(feuille.getByText("Son prénom devient une initiale, le tien reste. Parfait pour ta story.")).toBeVisible();
  });

  if (partages)
    await test.step("« Partager » : la feuille du système reçoit l’image, blush.png, et l’image est comptée", async () => {
      await mesurerCompteurs(() => feuille.getByRole("button", { name: "Partager", exact: true }).click(), { image_partagee: 1 });
      expect(await partages()).toEqual([{ nom: "blush.png", type: "image/png", octets: expect.any(Number) }]);
      expect((await partages())[0].octets).toBeGreaterThan(0);
    });

  await test.step("enregistrée : le fichier blush.png, et l’image comptée", async () => {
    /* « Enregistrer l’image » sur ordinateur ; « Enregistrer », à côté de « Partager », là où le navigateur sait partager un fichier */
    const telechargement = await mesurerCompteurs(async () => {
      const [fichier] = await Promise.all([page.waitForEvent("download"), feuille.getByRole("button", { name: /^Enregistrer/ }).click()]);
      await expect(feuille.getByRole("button", { name: "Image enregistrée." })).toBeVisible();
      return fichier;
    }, { image_partagee: 1 });
    expect(telechargement.suggestedFilename()).toBe("blush.png");
  });

  await test.step("Fermer referme la feuille, la conv reste", async () => {
    await feuille.getByRole("button", { name: "Fermer" }).click();
    await expect(feuille).toBeHidden();
    await expect(conv.getByText("elle te cherche 👀")).toBeVisible();
  });
});

test("« Partager cette phrase en image » : la chute d’un chapitre du rapport, dessinée en story par le serveur", async ({ page }, testInfo) => {
  await lectureBlushPlus(page, testInfo);
  const rapport = await ouvrirLeRapport(page);
  const chapitre2 = rapport.getByRole("region", { name: "Chapitre 2 : Chapitre 2" });
  const feuille = page.getByRole("dialog", { name: "Partager en image" });

  /* La chute du modèle factice, « Et voilà. » : le troisième bloc du chapitre (l’accroche, le récit, la chute) */
  await expect(chapitre2.getByText("Et voilà.")).toBeVisible();
  const image = await reponseAuGeste(page, { chemin: "/api/partage/image", timeout: DESSIN }, () => chapitre2.getByRole("button", { name: "Partager cette phrase en image" }).click());
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
  /* Le moment désigné par sa place dans le rapport du compte, jamais par son texte */
  expect(image.request().postDataJSON()).toEqual({ type: "moment", chapitre: 2, bloc: 2 });
  await expect(feuille).toBeVisible();
  const apercu = feuille.getByRole("img", { name: "L’image à partager" });
  await expect.poll(() => apercu.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([1080, 1920]);
  await feuille.getByRole("button", { name: "Fermer" }).click();
  await expect(feuille).toBeHidden();
});
