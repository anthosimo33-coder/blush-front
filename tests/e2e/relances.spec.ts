import { attendreMail, commencerPaiement, CRON_SECRET, emailLibre, expect, lectureFaite, mailsDepuis, sql, test } from "./aide";

/*
 * La relance par mail (« Ton rapport t’attend », l’offre unique ②) de bout en bout : une commande du rapport restée en
 * attente deux heures (son heure reculée en base), la route que la veille de GitHub appelle, le mail dans la boîte des
 * tests (rien de la conv, le lien de la conv sur la feuille de paiement, le lien de désinscription), puis la
 * désinscription à l’écran, au clavier, qui coupe les relances du compte.
 */

test("la relance : le mail « Ton rapport t’attend », son lien vers la feuille de paiement, puis la désinscription", async ({ page, request, autreAppareil }, testInfo) => {
  const email = emailLibre(testInfo, "relance");
  const conv = await lectureFaite(page, testInfo, email);
  const { achat } = await commencerPaiement(page, "rapport");
  /* Deux heures (et plus) ont passé depuis la commande : le paiement n’a jamais abouti */
  await sql()`update achats set cree_le = now() - interval '3 hours' where id = ${achat}`;

  const mail = await test.step("la route des relances (le secret de la veille) l’envoie, et ne répond que des nombres", async () => {
    const depuis = Date.now();
    const r = await request.get("/api/cron/relances", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    expect(r.status()).toBe(200);
    const corps = (await r.json()) as Record<string, unknown>;
    expect(Object.keys(corps).sort()).toEqual([
      "achats",
      "chaines",
      "couts",
      "dues",
      "ecartees",
      "echecs",
      "ecrans",
      "envoyees",
      "lecturesEffacees",
      "lotsAnnules",
      "lotsEnvoyes",
      "lotsLus",
      "prises",
      "retenues",
      "sequences",
    ]);
    expect(JSON.stringify(corps)).not.toContain(email);
    return attendreMail(email, { depuis, filtre: (m) => m.sujet === "Ton rapport t’attend" });
  });

  await test.step("le mail : rien de la conv, le lien de cette conv sur la feuille de paiement, et de quoi se désinscrire", async () => {
    for (const prenom of ["Maëlys", "Noé"]) expect(`${mail.sujet}${mail.texte}${mail.html}`).not.toContain(prenom);
    expect(mail.texte).toContain(`/ouvrir/${conv}?paiement=1`);
    expect(mail.texte).toMatch(/\/desinscription\?id=[0-9a-f-]+&cle=[\w-]+/);
    /* Rejouée, la route ne relance pas une seconde fois ce compte */
    const depuis = Date.now();
    await request.get("/api/cron/relances", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    await new Promise((r) => setTimeout(r, 500));
    expect(mailsDepuis(email, depuis)).toEqual([]);
  });

  await test.step("le lien du mail rouvre la conv sur la feuille de paiement", async () => {
    const lien = /(https?:\/\/\S+\/ouvrir\/\S+)/.exec(mail.texte)![1]!;
    await page.goto(new URL(lien).pathname + new URL(lien).search);
    await expect(page).toHaveURL(/\/rapport\?paiement=1$/);
  });

  await test.step("la désinscription, ouverte ailleurs (le mail lu sur un autre appareil) et au clavier : les relances sont coupées", async () => {
    const lien = /(https?:\/\/\S+\/desinscription\?\S+)/.exec(mail.texte)![1]!;
    const ailleurs = await autreAppareil();
    await ailleurs.goto(new URL(lien).pathname + new URL(lien).search);
    await expect(ailleurs.getByRole("heading", { level: 1, name: "Plus d’offres\u00a0?" })).toBeVisible();
    const bouton = ailleurs.getByRole("button", { name: "Me désinscrire" });
    await bouton.focus();
    await ailleurs.keyboard.press("Enter");
    await expect(ailleurs.getByRole("heading", { level: 1, name: "C’est fait." })).toBeVisible();
    await expect(ailleurs.getByText("Ton code de connexion et «\u00a0ton rapport est prêt\u00a0» arrivent toujours.", { exact: false })).toBeVisible();
    const [u] = await sql()<{ coupees: boolean }[]>`select relances_coupees_le is not null as coupees from users where email = ${email}`;
    expect(u?.coupees).toBe(true);
  });
});

test("la désinscription sans un lien entier, ou avec un lien faux : « Ce lien ne marche pas. », rien n’est coupé ; elle tient en 375 × 667 sans défiler", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  for (const adresse of ["/desinscription?id=00000000-0000-4000-8000-000000000000&cle=exemple", "/desinscription"]) {
    await page.goto(adresse);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const { haut, ecran, large, ecranLarge } = await page.evaluate(() => ({
      haut: document.documentElement.scrollHeight,
      ecran: window.innerHeight,
      large: document.documentElement.scrollWidth,
      ecranLarge: window.innerWidth,
    }));
    expect(haut, `${adresse} : la hauteur de la page`).toBeLessThanOrEqual(ecran);
    expect(large, `${adresse} : la largeur de la page`).toBeLessThanOrEqual(ecranLarge);
    await expect(page.getByRole("button", { name: "Me désinscrire" }).or(page.getByRole("link", { name: "Revenir à l’accueil" }))).toBeInViewport();
  }
  await page.goto("/desinscription");
  await expect(page.getByRole("heading", { level: 1, name: "Ce lien ne marche pas." })).toBeVisible();
  await page.goto("/desinscription?id=00000000-0000-4000-8000-000000000000&cle=pas-la-bonne");
  await page.getByRole("button", { name: "Me désinscrire" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ce lien ne marche pas." })).toBeVisible();
});
