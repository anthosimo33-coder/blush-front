import {
  attendreLaScene,
  attendreLecture,
  carteDuVerdict,
  choisirFichier,
  compteDe,
  demanderCode,
  emailLibre,
  expect,
  exportInstagram,
  exportInstagramComplet,
  exportInstagramHtml,
  fermerLaFeuille,
  histoiresDe,
  lireConvJson,
  paquetDe,
  saisirLeCodeRecu,
  suivreLesEnvois,
  tachesDe,
  test,
} from "./aide";

/*
 * L’export Instagram : la tuile Instagram mène à l’export (pas aux captures). Le fichier se lit dans le navigateur : un
 * message_1.json, un message_1.html, ou l’export complet du compte, où « Quelle conv ? » fait choisir la bonne. Seule
 * celle-là part chez BLUSH. Les convs sont inventées (aide/exports.ts, aide/instagram-captures.ts).
 */

test("Instagram : l’export JSON importé, les prénoms accentués bien relus, puis la lecture jusqu’au verdict", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "insta-json");
  /* message_1.json : 64 messages entre Noé et Maëlys, l’UTF-8 écrit octet par octet comme Instagram (« MaÃ«lys ») */
  const conv = exportInstagram(testInfo);

  await test.step("la tuile Instagram mène à l’export Instagram, pas aux captures", async () => {
    await page.goto("/commencer");
    await page.getByRole("link", { name: "Instagram Export de tes messages" }).click();
    await expect(page).toHaveURL(/\/importer\/export\?app=instagram$/);
    await expect(page.getByRole("heading", { level: 1, name: "Exporte votre conv." })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Instagram" })).toBeChecked();
    await expect(page.getByText("Choisis seulement Messages, au format JSON")).toBeVisible();
  });

  await test.step("le message_1.json est lu : 64 messages, 2 vocaux, du 4 au 7 septembre", async () => {
    await choisirFichier(page, conv.chemin);
    await expect(page.getByRole("heading", { level: 1, name: "C’est bon, on a votre conv." })).toBeVisible();
    await expect(page.getByText(conv.nom)).toBeVisible();
    await expect(page.getByText(String(conv.messages), { exact: true })).toBeVisible();
    await expect(page.getByText(`messages · ${conv.vocaux} vocaux`)).toBeVisible();
    await expect(page.getByText("4 sept. → 7 sept.")).toBeVisible();
    await page.getByRole("link", { name: "Continuer" }).click();
  });

  await test.step("qui es-tu : Noé et Maëlys, avec leurs accents (pas « MaÃ«lys »), Noé d’abord", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "Qui es-tu dans cette conv\u00a0?" })).toBeVisible();
    const personnes = page.getByRole("radiogroup", { name: "Qui es-tu dans cette conv\u00a0?" }).getByRole("radio");
    await expect(personnes).toHaveCount(2);
    await expect(personnes.nth(0)).toHaveAccessibleName(/Noé$/);
    await expect(personnes.nth(1)).toHaveAccessibleName(/Maëlys$/);
    await expect(page.getByText("Ã", { exact: false })).toHaveCount(0);
    await page.getByRole("radio", { name: "Noé" }).click();
    await page.getByRole("radio", { name: "Un garçon" }).click();
    await page.getByRole("radio", { name: "On se parle" }).click();
    await page.getByRole("radio", { name: "Savoir si c’est réciproque" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
  });

  await test.step("l’email, le code, puis la lecture des 64 messages mène au verdict", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "On t’envoie ton rapport où\u00a0?" })).toBeVisible();
    await saisirLeCodeRecu(page, email, await demanderCode(page, email));
    await attendreLecture(page);
    await expect(page.getByRole("heading", { level: 1, name: /BLUSH analyse tes\s*64\s*messages/ })).toBeVisible();
    await page.getByRole("link", { name: "Voir mon rapport" }).click();
    /* « Voir mon rapport » recharge toute la page : la scène répond une fois vivante */
    await attendreLaScene(page, 64);
    await page.getByRole("button", { name: "Suivant" }).click();
    await expect(carteDuVerdict(page, 2, 4, "Vous êtes à deux doigts.")).toBeVisible();
  });

  await test.step("côté serveur : une histoire Instagram de 64 messages, lue (le verdict seul : compte gratuit)", async () => {
    expect(await compteDe(email)).toMatchObject({ plan: "gratuit" });
    expect(await histoiresDe(email)).toEqual([expect.objectContaining({ messages: 64 })]);
    expect((await tachesDe(email)).map((t) => [t.genre, t.statut])).toEqual([["verdict", "fini"]]);
  });
});

test("Instagram : l’export HTML (message_1.html) se lit comme le JSON, ses heures ramenées à Paris", async ({ page }, testInfo) => {
  /* La même conv, en HTML : ses premiers messages tombent le 5 septembre juste après minuit, à Paris */
  const conv = exportInstagramHtml(testInfo);

  await test.step("sur l’écran d’export, l’onglet Instagram remplace les étapes WhatsApp", async () => {
    await page.goto("/importer/export?app=whatsapp");
    await expect(page.getByRole("radio", { name: "WhatsApp" })).toBeChecked();
    await expect(page.getByText("Exporter la discussion, sans médias")).toBeVisible();
    await page.getByRole("radio", { name: "Instagram" }).click();
    await expect(page).toHaveURL(/\/importer\/export\?app=instagram$/);
    await expect(page.getByRole("radio", { name: "Instagram" })).toBeChecked();
    await expect(page.getByText("Choisis seulement Messages, au format JSON")).toBeVisible();
    await expect(page.getByText("Exporter la discussion, sans médias")).toHaveCount(0);
  });

  await test.step("le message_1.html est lu : 64 messages, 2 vocaux, du 5 au 8 septembre (heure de Paris)", async () => {
    await choisirFichier(page, conv.chemin);
    await expect(page.getByRole("heading", { level: 1, name: "C’est bon, on a votre conv." })).toBeVisible();
    await expect(page.getByText(conv.nom)).toBeVisible();
    await expect(page.getByText(String(conv.messages), { exact: true })).toBeVisible();
    await expect(page.getByText(`messages · ${conv.vocaux} vocaux`)).toBeVisible();
    await expect(page.getByText(conv.periode)).toBeVisible();
    await page.getByRole("link", { name: "Continuer" }).click();
  });

  await test.step("qui es-tu : Noé et Maëlys, lus dans le HTML", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "Qui es-tu dans cette conv\u00a0?" })).toBeVisible();
    const personnes = page.getByRole("radiogroup", { name: "Qui es-tu dans cette conv\u00a0?" }).getByRole("radio");
    await expect(personnes).toHaveCount(2);
    await expect(personnes.nth(0)).toHaveAccessibleName(/Noé$/);
    await expect(personnes.nth(1)).toHaveAccessibleName(/Maëlys$/);
  });
});

test("Instagram : l’export complet fait choisir la conv, cherche sans accents, se ferme sans erreur, et n’envoie que la conv choisie", async ({ page }, testInfo) => {
  /* 14 convs : Maëlys (64 messages, en deux fichiers), douze autres plus courtes, et un groupe à trois */
  const conv = exportInstagramComplet(testInfo);
  const feuille = page.getByRole("dialog", { name: "Quelle conv ?" });
  const convs = feuille.getByRole("button");
  const recherche = feuille.getByRole("textbox", { name: "Chercher une conv" });
  const envoisVers = await suivreLesEnvois(page);

  await test.step("« Quelle conv ? » : les 12 convs à deux les plus longues, Maëlys en tête", async () => {
    await page.goto("/importer/export?app=instagram");
    await choisirFichier(page, conv.chemin);
    await expect(feuille).toBeVisible();
    await expect(feuille.getByText(`Ton export contient ${conv.convs.length} convs.`)).toBeVisible();
    await expect(convs).toHaveCount(12);
    await expect(convs.nth(0)).toHaveAccessibleName(/Maëlys\s*64\smessages · jusqu’au 7\ssept\.$/);
    await expect(convs.nth(1)).toHaveAccessibleName(/Sacha\s*44\smessages/);
    await expect(convs.nth(11)).toHaveAccessibleName(/Margaux\s*12\smessages/);
    await expect(feuille.getByText("Les 12 plus longues. Cherche un prénom pour voir les autres.")).toBeVisible();
  });

  await test.step("la recherche ignore les accents ; le groupe se voit, sans pouvoir le choisir", async () => {
    await recherche.fill("elise");
    await expect(convs).toHaveCount(1);
    await expect(convs.first()).toHaveAccessibleName(/Élise\s*9\smessages · jusqu’au 6\ssept\.$/);
    await expect(feuille.getByText("Les 12 plus longues", { exact: false })).toHaveCount(0);
    await recherche.fill("colocs");
    await expect(feuille.getByText("Les colocs du 5e")).toBeVisible();
    await expect(feuille.getByText("Groupe · BLUSH lit les convs à deux")).toBeVisible();
    await expect(convs).toHaveCount(0);
    await recherche.fill("xavier");
    await expect(feuille.getByText("Aucune conv à ce nom.")).toBeVisible();
    await recherche.fill("");
    await expect(convs).toHaveCount(12);
  });

  await test.step("fermer la feuille sans choisir : on reste sur l’export, sans erreur, prêt à recommencer", async () => {
    /* Au clavier : Échap ; au doigt : toucher le voile au-dessus de la feuille */
    await fermerLaFeuille(page);
    await expect(feuille).toBeHidden();
    await expect(page).toHaveURL(/\/importer\/export\?app=instagram$/);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Choisir le fichier enregistré" })).toBeEnabled();
  });

  await test.step("Maëlys choisie : sa conv arrive, 64 messages", async () => {
    await choisirFichier(page, conv.chemin);
    await expect(feuille).toBeVisible();
    await convs.filter({ hasText: "Maëlys" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "C’est bon, on a votre conv." })).toBeVisible();
    await expect(page.getByText(conv.nom)).toBeVisible();
    await expect(page.getByText(String(conv.messages), { exact: true })).toBeVisible();
    await expect(page.getByText(`messages · ${conv.vocaux} vocaux`)).toBeVisible();

    /* Ce qui est parti : les deux fichiers de la conv avec Maëlys (65 lignes, son « a aimé » compris), rien des treize autres ni des infos du compte */
    const envois = await envoisVers("/api/import");
    expect(envois).toHaveLength(1);
    const paquet = paquetDe(envois[0]);
    expect(paquet.parties.map((p) => p.nom)).toEqual([
      "your_instagram_activity/messages/inbox/maelys_1234567890/message_1.json",
      "your_instagram_activity/messages/inbox/maelys_1234567890/message_2.json",
    ]);
    expect(paquet.parties.map((p) => lireConvJson(p.contenu))).toEqual([
      { titre: "Maëlys", auteurs: ["Maëlys", "Noé"], lignes: 40 },
      { titre: "Maëlys", auteurs: ["Maëlys", "Noé"], lignes: 25 },
    ]);
  });
});

test("Instagram : une conv trop courte choisie dans l’export complet, l’écran d’erreur propose les captures", async ({ page }, testInfo) => {
  const conv = exportInstagramComplet(testInfo);
  await page.goto("/importer/export?app=instagram");
  await choisirFichier(page, conv.chemin);
  const feuille = page.getByRole("dialog", { name: "Quelle conv ?" });
  /* Zoé : 30 messages, il en faut 50 pour un export */
  await feuille.getByRole("button", { name: /Zoé\s*30\smessages/ }).click();

  const erreur = page.getByRole("alertdialog", { name: "Votre conv est encore trop courte." });
  await expect(erreur).toBeVisible();
  await expect(erreur.getByText("Un export doit avoir au moins 50 messages pour un verdict juste. En captures, 20 suffisent : envoie celles de votre conv, ou reviens dans quelques jours.")).toBeVisible();
  await expect(page).toHaveURL(/\/importer\/export\?app=instagram&erreur=courte$/);
  await erreur.getByRole("link", { name: "Envoyer des captures" }).click();
  await expect(page).toHaveURL(/\/importer\/captures\?app=instagram$/);
  await expect(page.getByRole("heading", { level: 1, name: "Choisis tes captures." })).toBeVisible();
});

/*
 * Un bug de texte : Instagram s’importe par son export (la tuile, l’écran d’erreur « trop courte » qui envoie vers les
 * captures en disant « Un export doit avoir au moins 50 messages »). Puis l’écran des captures affirme « Instagram et
 * Hinge ne permettent pas d’exporter », juste après un export Instagram.
 * src/app/importer/captures/CapturesScreen.tsx:200 (le texte d’avant le back-end, quand Instagram passait par les captures).
 */
test.fixme("Instagram : l’écran des captures ne dit pas qu’Instagram ne s’exporte pas", async ({ page }) => {
  await page.goto("/importer/captures?app=instagram");
  await expect(page.getByRole("heading", { level: 1, name: "Choisis tes captures." })).toBeVisible();
  await expect(page.getByRole("main").getByText(/Instagram[^.]*ne permett?(?:ent)? pas d’exporter/)).toHaveCount(0);
});
