import { choisirFichier, expect, exportGroupeWhatsApp, exportWhatsApp, ouvrirExportWhatsApp, reponseAuGeste, test, texteQuiNEstPasUneConv, zipAbime } from "./aide";

/*
 * Les fichiers que l’import refuse, et ce que l’écran propose alors : une conv trop courte, une conv de groupe, un
 * fichier illisible (refusé par le navigateur, ou par le serveur). Et un envoi qui n’a pas pu partir, qu’on réessaie.
 * Chaque refus est un écran d’erreur (un alertdialog, ?erreur= dans l’adresse) avec une seule action.
 */

test("49 messages : trop courte, l’écran propose des captures ; 50 messages : acceptée", async ({ page }, testInfo) => {
  const courte = exportWhatsApp(testInfo, { n: 49, format: "txt" });
  const juste = exportWhatsApp(testInfo, { n: 50 });

  await test.step("49 messages : l’écran « trop courte », qui dit pourquoi", async () => {
    await ouvrirExportWhatsApp(page);
    await choisirFichier(page, courte.chemin);
    const erreur = page.getByRole("alertdialog", { name: "Votre conv est encore trop courte." });
    await expect(erreur).toBeVisible();
    await expect(page).toHaveURL(/\/importer\/export\?app=whatsapp&erreur=courte$/);
    await expect(erreur).toContainText(
      "Un export doit avoir au moins 50 messages pour un verdict juste. En captures, 20 suffisent : envoie celles de votre conv, ou reviens dans quelques jours.",
    );
  });

  await test.step("« Envoyer des captures » mène aux captures de WhatsApp", async () => {
    await page.getByRole("alertdialog").getByRole("link", { name: "Envoyer des captures" }).click();
    await expect(page).toHaveURL(/\/importer\/captures\?app=whatsapp$/);
    await expect(page.getByRole("heading", { level: 1, name: "Choisis tes captures." })).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  await test.step("50 messages : la conv passe", async () => {
    await ouvrirExportWhatsApp(page);
    await choisirFichier(page, juste.chemin);
    await expect(page.getByRole("heading", { level: 1, name: "C’est bon, on a votre conv." })).toBeVisible();
    await expect(page.getByText("50", { exact: true })).toBeVisible();
  });
});

test("une conv de groupe : l’écran le dit, et « Choisir une autre conv » ramène au début", async ({ page }, testInfo) => {
  /* Noé, Maëlys et Inès : trois personnes qui écrivent, ce n’est pas une conv à deux */
  const groupe = exportGroupeWhatsApp(testInfo);
  await ouvrirExportWhatsApp(page);
  await choisirFichier(page, groupe);
  const erreur = page.getByRole("alertdialog", { name: "C’est une conversation de groupe." });
  await expect(erreur).toBeVisible();
  await expect(page).toHaveURL(/\/importer\/export\?app=whatsapp&erreur=groupe$/);
  await expect(erreur).toContainText("BLUSH analyse seulement les conversations à deux. Exporte votre discussion privée.");
  await erreur.getByRole("link", { name: "Choisir une autre conv" }).click();
  await expect(page).toHaveURL(/\/commencer$/);
  await expect(page.getByRole("heading", { level: 1, name: "Vous vous parlez où ?" })).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("un .zip abîmé : refusé dans le navigateur (rien ne part), puis le bon fichier passe", async ({ page }, testInfo) => {
  const conv = exportWhatsApp(testInfo, { format: "txt" });
  /* Chaque envoi au serveur : un fichier que le navigateur n’ouvre pas ne doit pas partir */
  const envois: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/import") envois.push(r.method());
  });

  await test.step("le zip ne s’ouvre pas : l’écran « fichier illisible », sans envoi", async () => {
    await ouvrirExportWhatsApp(page);
    await choisirFichier(page, zipAbime(testInfo));
    const erreur = page.getByRole("alertdialog", { name: "On n’arrive pas à lire ce fichier." });
    await expect(erreur).toBeVisible();
    await expect(page).toHaveURL(/\/importer\/export\?app=whatsapp&erreur=fichier$/);
    await expect(erreur).toContainText("Exporte à nouveau votre discussion, sans médias, puis choisis le fichier enregistré.");
    expect(envois).toEqual([]);
  });

  await test.step("« Choisir un autre fichier » revient à l’export, où le bon fichier passe", async () => {
    await page.getByRole("alertdialog").getByRole("link", { name: "Choisir un autre fichier" }).click();
    await expect(page).toHaveURL(/\/importer\/export\?app=whatsapp$/);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await choisirFichier(page, conv.chemin);
    await expect(page.getByRole("heading", { level: 1, name: "C’est bon, on a votre conv." })).toBeVisible();
    await expect(page.getByText(String(conv.messages), { exact: true })).toBeVisible();
    expect(envois).toEqual(["POST"]);
  });
});

test("un .txt qui n’est pas une conv : le serveur le refuse, même écran « fichier illisible »", async ({ page }, testInfo) => {
  await ouvrirExportWhatsApp(page);
  const refus = await reponseAuGeste(page, { chemin: "/api/import" }, () => choisirFichier(page, texteQuiNEstPasUneConv(testInfo)));
  expect(refus.status()).toBe(422);
  const erreur = page.getByRole("alertdialog", { name: "On n’arrive pas à lire ce fichier." });
  await expect(erreur).toBeVisible();
  await expect(page).toHaveURL(/\/importer\/export\?app=whatsapp&erreur=fichier$/);
  await expect(erreur.getByRole("link", { name: "Choisir un autre fichier" })).toBeVisible();
});

test("l’envoi n’a pas pu partir (réseau coupé) : on le dit sur place, et le nouvel essai passe", async ({ page }, testInfo) => {
  const conv = exportWhatsApp(testInfo);
  await ouvrirExportWhatsApp(page);
  /* Le premier envoi seulement échoue, comme une connexion qui saute */
  await page.route("**/api/import", (r) => r.abort("internetdisconnected"), { times: 1 });
  await choisirFichier(page, conv.chemin);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Ta conv n’a pas pu partir. Vérifie ta connexion et réessaie.");
  /* Pas d’écran d’erreur : ce n’est pas la conv qui est en cause */
  await expect(page).toHaveURL(/\/importer\/export\?app=whatsapp$/);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await choisirFichier(page, conv.chemin);
  await expect(page.getByRole("heading", { level: 1, name: "C’est bon, on a votre conv." })).toBeVisible();
});
