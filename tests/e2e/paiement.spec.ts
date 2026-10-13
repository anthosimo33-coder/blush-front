import {
  achatEnBase,
  commencerPaiement,
  compteDe,
  dernierAchat,
  emailLibre,
  expect,
  lectureFaite,
  ouvrirLeRapport,
  PAIEMENT,
  payer,
  rejouerWebhook,
  rembourser,
  RENONCIATION,
  test,
  URL_APPLI,
} from "./aide";

/*
 * Le paiement par le faux Whop (BLUSH_PAIEMENT_FACTICE), de bout en bout : sa page de paiement locale, et de vrais
 * webhooks signés d’un secret de test, que le serveur vérifie et livre comme ceux de Whop. Un pack de bulles (le retour les
 * dit, puis l’accueil) ; refusé, puis annulé chez le faux Whop (la page du retour le dit, « Réessayer ») ; l’offre ③ payée
 * en un geste ; un webhook rejoué qui ne crédite qu’une fois, une signature fausse refusée ; un remboursement qui
 * re-verrouille ; et rien qui ne part sans la renonciation (sa version d’aujourd’hui, que le geste de payer envoie). Le rapport et Premium payés à l’écran :
 * rapport-debloque.spec.ts.
 */

test("un pack de bulles : payé chez le faux Whop, crédité, puis l’accueil", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "pack");
  await lectureFaite(page, testInfo, email);
  const { url } = await commencerPaiement(page, "pack30");
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1, name: "30 bulles" })).toBeVisible();
  await expect(page.getByText("4,90\u00a0€", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Payer", exact: true }).click();
  /* Le retour dit les bulles reçues, puis revient là où le paiement a commencé (sans écran pour le dire : l’accueil) */
  await expect(page.getByRole("heading", { level: 1, name: "+30 bulles" })).toBeVisible();
  await expect(page.getByText("Elles n’expirent jamais.")).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
  expect(await compteDe(email)).toMatchObject({ bulles: 30, debloquees: 0 });
});

test("refusé chez le faux Whop : la page du retour le dit, rien n’est crédité", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "refuse");
  await lectureFaite(page, testInfo, email);
  const { url } = await commencerPaiement(page, "pack80");
  await page.goto(url);
  await page.getByRole("button", { name: "Refuser" }).click();
  await expect(page).toHaveURL(/\/paiement\/retour\?achat=.*status=failed/);
  await expect(page.getByRole("heading", { level: 1, name: "Le paiement n’est pas passé." })).toBeVisible();
  await expect(page.getByText("Rien n’a été payé. Tu peux réessayer, avec Apple Pay ou une autre carte.")).toBeVisible();
  /* Des bulles : « Réessayer » ramène là où le paiement a commencé, l’accueil sans écran pour le dire */
  await expect(page.getByRole("link", { name: "Réessayer" })).toHaveAttribute("href", "/app");
  expect(await compteDe(email)).toMatchObject({ bulles: 0 });
});

test("annulé chez le faux Whop (« Retour » sur sa page) : rien n’est payé, le retour le dit, « Réessayer » rouvre « Ta formule »", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "annule");
  await lectureFaite(page, testInfo, email);
  const rapport = await ouvrirLeRapport(page);
  await rapport.getByRole("button", { name: "Lire la suite · 9,90\u00a0€" }).click();
  const feuille = page.getByRole("dialog", { name: PAIEMENT });
  await feuille.getByRole("button", { name: "Débloquer · 14,90\u00a0€" }).click();
  await expect(page).toHaveURL(/\/paiement\/factice\?achat=/);
  await page.getByRole("button", { name: "Annuler" }).click();

  await expect(page).toHaveURL(/\/paiement\/retour\?achat=.*status=canceled/);
  await expect(page.getByRole("heading", { level: 1, name: "Paiement annulé." })).toBeVisible();
  await expect(page.getByText("Rien n’a été payé.", { exact: true })).toBeVisible();
  expect(await achatEnBase(await dernierAchat(email))).toMatchObject({ offre: "premium", statut: "en_attente" });
  await expect(page.getByRole("link", { name: "Revenir au rapport" })).toBeVisible();
  await page.getByRole("link", { name: "Réessayer" }).click();
  await expect(page).toHaveURL(/\/rapport\?paiement=1$/);
  await expect(page.getByRole("dialog", { name: PAIEMENT })).toBeVisible();
  expect(await compteDe(email)).toMatchObject({ bulles: 0, debloquees: 0 });
});

test("l’offre ③ après le rapport seul : payée en un geste avec la carte gardée, 80 bulles de plus, puis « C’est débloqué »", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "ajout");
  await lectureFaite(page, testInfo, email);
  await payer(page, "rapport");
  const ecran = page.getByRole("main");
  const offre = ecran.getByRole("region", { name: "Passe en Premium pour 5\u00a0€ de plus" });
  await expect(offre.getByText("Ta carte est enregistrée\u00a0: un geste et c’est fait.")).toBeVisible();

  await test.step("pas de case : la renonciation dite juste sous le bouton, qui paie au premier toucher", async () => {
    await expect(offre.getByRole("checkbox")).toHaveCount(0);
    await expect(offre.getByText("En payant, tu as tes bulles tout de suite et tu renonces au délai de rétractation.")).toBeVisible();
    await expect(offre.getByRole("link", { name: "délai de rétractation" })).toHaveAttribute("href", "/conditions#livraison");
  });

  await test.step("un geste, sans page de paiement, et l’on revient sur « C’est débloqué » avec 90 bulles", async () => {
    await offre.getByRole("button", { name: "Ajouter 80 bulles · 5\u00a0€" }).click();
    /* Le retour les dit, puis ramène sur « C’est débloqué » */
    await expect(page.getByRole("heading", { level: 1, name: "+80 bulles" })).toBeVisible();
    await expect(ecran.getByText("Les 8 chapitres sont à toi. Et 90 bulles pour en parler avec BLUSH.")).toBeVisible();
    await expect(ecran.getByText("90 bulles pour parler à BLUSH", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/rapport\/debloque\?achat=/);
    await expect(ecran.getByRole("region", { name: /Passe en Premium/ })).toHaveCount(0);
    expect(await compteDe(email)).toMatchObject({ bulles: 90, debloquees: 1 });
  });
});

test("un webhook rejoué ne crédite qu’une fois ; une signature fausse est refusée", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "rejoue");
  await lectureFaite(page, testInfo, email);
  const { webhook } = await payer(page, "pack80");
  expect(await compteDe(email)).toMatchObject({ bulles: 80 });

  await test.step("le même webhook, rejoué deux fois (Whop réessaie) : reçu, et ignoré", async () => {
    const [une, deux] = [await rejouerWebhook(page, webhook), await rejouerWebhook(page, webhook)];
    expect([une.status(), await une.json(), deux.status()]).toEqual([200, { ok: true }, 200]);
    expect(await compteDe(email)).toMatchObject({ bulles: 80 });
  });

  await test.step("le même webhook, son corps touché (un autre montant) ou sa signature changée : 401 « interdit », rien de plus", async () => {
    const touche = await rejouerWebhook(page, webhook, (corps) => corps.replace(/"amount":"[\d.]+"/, '"amount":"0.01"'));
    expect([touche.status(), await touche.json()]).toEqual([401, { erreur: "interdit" }]);
    const sansSignature = await page.request.post("/api/paiement/whop", { headers: { "content-type": "application/json" }, data: webhook.postData() ?? "" });
    expect(sansSignature.status()).toBe(401);
    expect(await compteDe(email)).toMatchObject({ bulles: 80 });
  });
});

test("un remboursement re-verrouille le rapport et reprend ses bulles", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "rembourse");
  await lectureFaite(page, testInfo, email);
  const { achat } = await payer(page, "rapport");
  expect(await compteDe(email)).toMatchObject({ debloquees: 1, bulles: 10 });

  await rembourser(page, achat);
  expect(await compteDe(email)).toMatchObject({ debloquees: 0, bulles: 0 });
  const rapport = await ouvrirLeRapport(page);
  await expect(rapport.getByText("Aperçu gratuit", { exact: true })).toBeVisible();
  await expect(rapport.getByRole("button", { name: /\(verrouillé\)$/ })).toHaveCount(7);
  /* « C’est débloqué » d’un achat remboursé n’existe plus : le rapport */
  await page.goto(`/rapport/debloque?achat=${achat}`);
  await expect(page).toHaveURL(/\/rapport$/);
});

test("sans la renonciation, le serveur ne commence aucun paiement (422) ; sans compte, non plus (401)", async ({ page, request }, testInfo) => {
  const email = emailLibre(testInfo, "renonce");
  await lectureFaite(page, testInfo, email);
  /* Sans elle, l’ancien `true` ou `false` d’un onglet ouvert avant sa version, ou une version qui n’est plus la bonne (dont celle de l’ancienne case) */
  for (const data of [
    { offre: "rapport" },
    { offre: "rapport", renonciation: false },
    { offre: "pack30" },
    { offre: "pack30", renonciation: true },
    { offre: "pack30", renonciation: "2020-01-01" },
    { offre: "pack30", renonciation: "2026-10-12" },
  ]) {
    const r = await page.request.post("/api/paiement", { headers: { origin: URL_APPLI }, data });
    expect([r.status(), await r.json()], JSON.stringify(data)).toEqual([422, { erreur: "renonciation" }]);
  }
  const sansCompte = await request.post("/api/paiement", { headers: { origin: URL_APPLI }, data: { offre: "rapport", renonciation: RENONCIATION } });
  expect(sansCompte.status()).toBe(401);
  expect(await compteDe(email)).toMatchObject({ bulles: 0, debloquees: 0 });
});
