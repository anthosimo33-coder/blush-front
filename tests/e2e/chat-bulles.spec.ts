import {
  attendreTaches,
  compteDe,
  debloquerLaConv,
  donnerDesBulles,
  ecrireABlush,
  emailLibre,
  expect,
  filDuChat,
  lectureFaite,
  messagesDuChat,
  ouvrir,
  ouvrirLeRapport,
  reponseAuGeste,
  RESEAU,
  test,
} from "./aide";

/*
 * Les bulles dans le chat (/app), au dessin du prototype validé des bulles, pour un compte qui paie (pas de l’équipe) :
 * le compteur à côté du bouton du compte (sa première apparition expliquée), « 1 bulle · il t’en reste N » sous chaque
 * réponse, la carte à 5 bulles ou moins, puis à 0 la réponse écrite mais verrouillée (floutée, rien d’elle dans la page),
 * la recharge qui s’ouvre (le message suivant refusé), le bonus de la première recharge (④), le paiement au faux Whop,
 * et la réponse lue au retour. Le modèle factice répond toujours « elle te cherche 👀 » en premier : la compter dans la
 * page dit si une réponse verrouillée y a laissé son texte.
 */

const PREMIERE_BULLE = "elle te cherche 👀";

test("un compte à 6 bulles parle jusqu’à 0 ; sa réponse prête et floutée ; la recharge (④) au faux Whop ; la réponse lue au retour", async ({ page }, testInfo) => {
  test.slow();
  const fil = filDuChat(page);
  const email = emailLibre(testInfo, "bulles");
  const compteur = (n: number | string) => page.getByRole("button", { name: `Tes bulles\u00a0: ${n}`, exact: true });

  await test.step("un compte qui paie : sa conv lue, son rapport débloqué, 6 bulles", async () => {
    await lectureFaite(page, testInfo, email);
    await debloquerLaConv(email);
    await ouvrirLeRapport(page);
    await attendreTaches(email);
    await donnerDesBulles(email, 6);
  });

  await test.step("le compteur à côté du bouton du compte, et sa première apparition expliquée", async () => {
    await ouvrir(page, "/app");
    await expect(compteur(6)).toBeVisible();
    await expect(page.getByText("Tes 6 bulles sont là")).toBeVisible();
    /* « comment ça marche » : la feuille « C’est quoi une bulle ? », d’où l’on recharge ; Échap la ferme */
    await page.getByRole("button", { name: "1 bulle = 1 réponse de BLUSH · comment ça marche" }).click();
    const feuille = page.getByRole("dialog", { name: "C’est quoi une bulle\u00a0?" });
    await expect(feuille).toBeVisible();
    await expect(feuille.getByRole("button", { name: "Recharger · il t’en reste 6" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(feuille).toBeHidden();
  });

  await test.step("chaque réponse coûte une bulle, dite sous elle ; à 5, la carte « Plus que 5 bulles »", async () => {
    expect(await ecrireABlush(page, "on s’est parlé ce matin")).toBe(200);
    await expect(fil.getByText("1 bulle · il t’en reste 5")).toBeVisible();
    await expect(compteur(5)).toBeVisible();
    /* La première réponse arrivée : la carte de la première apparition laisse sa place */
    await expect(page.getByText("Tes 6 bulles sont là")).toHaveCount(0);
    await expect(page.getByText("Plus que 5 bulles")).toBeVisible();
    expect(await compteDe(email)).toMatchObject({ bulles: 5 });
  });

  await test.step("jusqu’à 0 : le compteur suit, puis « Tes bulles sont finies »", async () => {
    for (let reste = 4; reste >= 0; reste--) {
      expect(await ecrireABlush(page, `et là, il m’en reste ${reste} ?`)).toBe(200);
      await expect(fil.getByText(`1 bulle · il t’en reste ${reste}`)).toBeVisible();
      await expect(compteur(reste)).toBeVisible();
    }
    await expect(page.getByText("Plus que 1 bulle")).toHaveCount(0);
    await expect(page.getByText("Tes bulles sont finies")).toBeVisible();
    await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(6);
    expect(await compteDe(email)).toMatchObject({ bulles: 0 });
  });

  await test.step("à 0 bulle : BLUSH écrit sa réponse, prête et floutée, sans rien d’elle dans la page", async () => {
    expect(await ecrireABlush(page, "je lui réponds quoi ?")).toBe(200);
    const prete = fil.locator("[data-verrouillee]");
    await expect(prete.getByText("Ta réponse est prête")).toBeVisible();
    await expect(prete).toHaveText("Ta réponse est prêteRecharger pour la lire");
    /* Ni son texte, ni son reçu : la réponse reste au serveur */
    await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(6);
    await expect(page.getByText("Ta réponse à Maëlys est écrite")).toBeVisible();
    expect(await messagesDuChat(email)).toHaveLength(14);
    expect(await compteDe(email)).toMatchObject({ bulles: 0 });
  });

  const recharge = page.getByRole("dialog", { name: "Recharge tes bulles" });

  await test.step("le message suivant : refusé (402 « bulles »), BLUSH le dit, et la recharge s’ouvre", async () => {
    expect(await ecrireABlush(page, "allô ?")).toBe(402);
    await expect(fil.getByText("plus de bulles pour l’instant 🫧")).toBeVisible();
    await expect(recharge).toBeVisible();
    await expect(recharge.getByText("Ta réponse à Maëlys s’affiche dès que c’est payé.")).toBeVisible();
    expect(await messagesDuChat(email)).toHaveLength(14);
    await page.keyboard.press("Escape");
    await expect(recharge).toBeHidden();
  });

  await test.step("« Recharger pour la lire » rouvre la recharge : le bonus de la première recharge (④), le pack conseillé choisi", async () => {
    await fil.getByRole("button", { name: "Recharger pour la lire" }).click();
    await expect(recharge).toBeVisible();
    await expect(recharge.getByText("Ta 1re recharge\u00a0: +40 offertes")).toBeVisible();
    const conseille = recharge.getByRole("radio", { name: /70 bulles/ });
    await expect(conseille).toHaveAttribute("aria-checked", "true");
    await expect(conseille.getByText("120 bulles · 0,08\u00a0€ la bulle")).toBeVisible();
    await expect(recharge.getByText("+ 50 bulles offertes")).toBeVisible();
  });

  await test.step("payer : la case de renonciation d’abord, puis la page du faux Whop, puis le retour sur le chat", async () => {
    const payer = recharge.getByRole("button", { name: "Payer · 9,90\u00a0€" });
    await payer.click();
    await expect(recharge.getByText("Coche la case pour payer.")).toBeVisible();
    await recharge.getByRole("checkbox", { name: "Je veux mes bulles tout de suite et je renonce à mon droit de rétractation" }).check();
    await payer.click();
    await page.waitForURL(/\/paiement\/factice\?achat=/, { timeout: RESEAU });
    await page.getByRole("button", { name: "Payer", exact: true }).click();
    /* Le retour attend la livraison, puis revient au chat, qui lit la réponse prête et retire `?recharge=` de l’adresse */
    await page.waitForURL((u) => u.pathname === "/app" && !u.search.includes("recharge"), { timeout: 2 * RESEAU });
  });

  await test.step("revenu : « +120 bulles, ta réponse est là », la réponse lue à sa place (une bulle), le compteur à 119", async () => {
    await expect(page.getByRole("status").filter({ hasText: "+120 bulles, ta réponse est là" })).toBeVisible();
    await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(7);
    await expect(fil.locator("[data-verrouillee]")).toHaveCount(0);
    await expect(fil.getByText("1 bulle · il t’en reste 119")).toBeVisible();
    await expect(compteur(119)).toBeVisible();
    await expect(page.getByText("Ta réponse à Maëlys est écrite")).toHaveCount(0);
    expect(await compteDe(email)).toMatchObject({ bulles: 119 });
    /* Payée, l’historique la rend en entier */
    await ouvrir(page);
    await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(7);
    await expect(fil.locator("[data-verrouillee]")).toHaveCount(0);
  });

  await test.step("le bonus ④ ne vaut qu’une fois : la recharge suivante, sans lui", async () => {
    await compteur(119).click();
    await page.getByRole("dialog", { name: "C’est quoi une bulle\u00a0?" }).getByRole("button", { name: "Recharger · il t’en reste 119" }).click();
    await expect(recharge.getByRole("radio", { name: /70 bulles/ })).toBeVisible();
    await expect(recharge.getByText("Ta 1re recharge\u00a0: +40 offertes")).toHaveCount(0);
    await expect(recharge.getByText("80 bulles · 0,12\u00a0€ la bulle")).toBeVisible();
  });

  await test.step("Mon compte : le solde, et l’achat dans « Tes achats »", async () => {
    await ouvrir(page, "/compte");
    const main = page.getByRole("main");
    await expect(main.getByRole("region", { name: "Tes bulles" }).getByText("Tes bulles\u00a0: 119", { exact: true })).toBeVisible();
    const achats = main.getByRole("region", { name: "Tes achats" });
    await expect(achats.getByText("80 bulles", { exact: true })).toBeVisible();
    await expect(achats.getByText(/ · \+120 bulles$/)).toBeVisible();
    await expect(achats.getByText("9,90\u00a0€")).toBeVisible();
    await expect(achats.getByText("Payé")).toBeVisible();
  });
});

test("« La lire » sur la carte : rechargé ailleurs (le solde couvre la réponse prête), elle se lit d’un toucher", async ({ page }, testInfo) => {
  const fil = filDuChat(page);
  const email = emailLibre(testInfo, "bulles-ailleurs");
  await lectureFaite(page, testInfo, email);
  await debloquerLaConv(email);
  await ouvrirLeRapport(page);
  await attendreTaches(email);

  await ouvrir(page, "/app");
  await expect(page.getByText("Tes bulles sont finies")).toBeVisible();
  expect(await ecrireABlush(page, "je lui réponds quoi ?")).toBe(200);
  await expect(fil.getByText("Ta réponse est prête")).toBeVisible();

  /* Des bulles données ailleurs (l’équipe), la page relue : « La lire » sur la réponse et sur la carte */
  await donnerDesBulles(email, 3);
  await ouvrir(page);
  await expect(fil.getByRole("button", { name: "La lire" })).toBeVisible();
  const r = await reponseAuGeste(page, { chemin: "/api/chat/debloquer" }, () => page.getByRole("button", { name: "La lire" }).last().click());
  expect(r.status()).toBe(200);
  await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(1);
  await expect(fil.getByText("1 bulle · il t’en reste 2")).toBeVisible();
  await expect(page.getByText("Plus que 2 bulles")).toBeVisible();
  expect(await compteDe(email)).toMatchObject({ bulles: 2 });
});
