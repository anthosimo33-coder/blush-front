import { attendreLecture, choisirFichier, compteDe, dernierCode, emailLibre, expect, exportWhatsApp, mailsPour, pagePrete, tachesDe, test } from "./aide";

/*
 * Le parcours témoin : quelqu’un découvre BLUSH, importe sa conv WhatsApp et lit son rapport, sans payer. Il fige le
 * comportement d’aujourd’hui (le back-end, la bêta ouverte, le modèle factice) : le verdict est offert, le chapitre 1 se
 * lit, les sept autres sont fermés, et rien de payant ne s’écrit.
 */
test("de la landing au rapport gratuit : import WhatsApp, qui es-tu, code par email, lecture, verdict, chapitre 1 ouvert", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "temoin");
  /* 64 messages entre Noé (qui importe) et Maëlys, inventés */
  const conv = exportWhatsApp(testInfo);

  await test.step("la landing mène au parcours", async () => {
    await page.goto("/");
    await page.getByRole("link", { name: "Commencer", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Vous vous parlez où ?" })).toBeVisible();
  });

  await test.step("l’export WhatsApp est importé", async () => {
    await page.getByRole("link", { name: /WhatsApp/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Exporte votre conv." })).toBeVisible();
    await choisirFichier(page, conv.chemin);
    await expect(page.getByRole("heading", { level: 1, name: "C’est bon, on a votre conv." })).toBeVisible();
    await expect(page.getByText(conv.nom)).toBeVisible();
    await expect(page.getByText(String(conv.messages), { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Continuer" }).click();
  });

  await test.step("qui es-tu : Noé, un garçon, on s’est vus, qu’on soit ensemble", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "Qui es-tu dans cette conv ?" })).toBeVisible();
    const continuer = page.getByRole("button", { name: "Continuer" });
    await expect(continuer).toBeDisabled();
    await page.getByRole("radio", { name: "Noé" }).click();
    await page.getByRole("radio", { name: "Un garçon" }).click();
    await page.getByRole("radio", { name: "On s’est vus" }).click();
    await page.getByRole("radio", { name: "Qu’on soit ensemble" }).click();
    await continuer.click();
  });

  await test.step("l’email reçoit un code, le bon code lance la lecture", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "On t’envoie ton rapport où ?" })).toBeVisible();
    await page.getByLabel("Ton email").fill(email);
    const depuis = Date.now();
    await page.getByRole("button", { name: "Recevoir mon code" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Entre ton code." })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    /* Le code complet se valide tout seul */
    await page.getByLabel("Code à 6 chiffres reçu par email").fill(await dernierCode(email, { depuis }));
  });

  await test.step("la lecture se fait, puis mène au verdict", async () => {
    await attendreLecture(page);
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(`BLUSH analyse tes\\s*${conv.messages}\\s*messages`) })).toBeVisible();
    await page.getByRole("link", { name: "Voir mon rapport" }).click();
  });

  await test.step("le verdict se révèle en quatre cartes, puis mène au rapport", async () => {
    /* « Voir mon rapport » recharge toute la page : la scène répond une fois vivante */
    await expect(page).toHaveURL(/\/rapport\/verdict$/);
    await pagePrete(page);
    await expect(page.getByRole("heading", { name: `Étape 1 sur 4 : ${conv.messages} messages, du premier au dernier.` })).toBeVisible();
    await page.getByRole("button", { name: "Suivant" }).click();
    await expect(page.getByRole("heading", { name: "Étape 2 sur 4 : Vous êtes à deux doigts." })).toBeVisible();
    await expect(page.getByText("Elle a posé la question, t’as esquivé.")).toBeVisible();
    await page.getByRole("button", { name: "Suivant" }).click();
    await expect(page.getByRole("heading", { name: "Étape 3 sur 4 : Entre vous deux" })).toBeVisible();
    await page.getByRole("button", { name: "Suivant" }).click();
    await expect(page.getByRole("heading", { name: "Étape 4 sur 4 : Ton rapport est prêt." })).toBeVisible();
    await page.getByRole("link", { name: "Voir mon rapport" }).click();
  });

  await test.step("le rapport gratuit : le chapitre 1 se lit, les sept autres sont fermés", async () => {
    await expect(page).toHaveURL(/\/rapport$/);
    const rapport = page.getByRole("main");
    await expect(rapport.getByRole("heading", { level: 1, name: "Noé & Maëlys" })).toBeVisible();
    const chapitre1 = rapport.getByRole("region", { name: "Chapitre 1 : Le verdict" });
    await expect(chapitre1).toBeVisible();
    await expect(chapitre1.getByText("Vous êtes à deux doigts.", { exact: true })).toBeVisible();
    await expect(rapport.getByRole("region", { name: /^Chapitre [2-8] / })).toHaveCount(0);
    await expect(rapport.getByText("La suite de ton rapport · 7 chapitres")).toBeVisible();
    await expect(rapport.getByRole("button", { name: /\(verrouillé\)$/ })).toHaveCount(7);
    await expect(rapport.getByRole("button", { name: "Lire la suite" })).toBeVisible();
  });

  await test.step("côté serveur : un compte gratuit, le verdict seul (rien de payant ne s’écrit), un seul mail", async () => {
    expect(await compteDe(email)).toMatchObject({ plan: "gratuit" });
    expect((await tachesDe(email)).map((t) => [t.genre, t.statut])).toEqual([["verdict", "fini"]]);
    expect(mailsPour(email).map((m) => m.sujet)).toEqual([expect.stringMatching(/^\d{6} : ton code BLUSH$/)]);
  });
});
