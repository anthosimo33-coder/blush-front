import type { Page } from "@playwright/test";
import {
  attendreTaches,
  compteDe,
  connecterParApi,
  debloquerLaConv,
  dernierAchat,
  donnerDesBulles,
  emailLibre,
  expect,
  feuilleSurOrdinateur,
  histoireExiste,
  histoiresDe,
  lireUneConvParApi,
  mesurerCompteurs,
  nouvelInvite,
  ouvrir,
  PAIEMENT,
  partagerParApi,
  payerParCarte,
  rembourser,
  RESEAU,
  test,
} from "./aide";

/*
 * Mon compte (/compte), à la manière des Réglages : toi en haut, tes bulles (et la recharge), tes achats, les sons,
 * puis tes données et les gestes qui effacent. Le compte et sa conv sont préparés par les routes /api (aide/compte.ts) ; tout le reste se fait à l’écran,
 * une fois la page prête aux gestes (ouvrir).
 */

/** Le lien public d’un verdict effacé ne montre plus rien : ni la page (le prénom de qui partage y est en clair), ni l’image. */
async function lienEteint(page: Page, id: string): Promise<void> {
  await mesurerCompteurs(async () => {
    await page.goto(`/v/${id}`);
    await expect(page.getByRole("heading", { level: 1, name: "Ce lien ne montre plus rien." })).toBeVisible();
  }, {});
  await expect(page.getByText("Vous êtes à deux doigts.")).toHaveCount(0);
  expect((await page.request.get(`/v/${id}/image`)).status()).toBe(404);
}

test("tes bulles suivent le compte : 0 et la suite à lire, le rapport débloqué et des bulles reçues, puis une recharge et Tes achats", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "compte");
  await connecterParApi(page, testInfo, email);
  await lireUneConvParApi(page, testInfo);
  await attendreTaches(email);
  const main = page.getByRole("main");
  const bulles = main.getByRole("region", { name: "Tes bulles" });

  await test.step("toi en haut : ton prénom et ton email", async () => {
    await ouvrir(page, "/compte");
    await expect(main.getByRole("heading", { level: 1, name: "Mon compte" })).toBeAttached();
    await expect(main.getByText("Noé", { exact: true })).toBeVisible();
    await expect(main.getByText(email)).toBeVisible();
  });

  await test.step("Tes histoires : celle avec Maëlys (ses dates), et de quoi en commencer une autre", async () => {
    const histoires = main.getByRole("region", { name: "Tes histoires" });
    await expect(histoires.getByRole("link", { name: "Maëlys et toi 4 sept. → 7 sept." })).toBeVisible();
    await expect(histoires.getByRole("link", { name: /^Nouvelle histoire/ })).toBeVisible();
    /* Une seule conv : pas de liste à choisir */
    await expect(histoires.getByRole("button")).toHaveCount(0);
  });

  await test.step("rien de payé : 0 bulle, ni abonnement ni pause, et « Lire la suite » ouvre le paiement sur le rapport", async () => {
    await expect(bulles.getByText("Tes bulles\u00a0: 0", { exact: true })).toBeVisible();
    await expect(bulles.getByText("1 bulle = 1 réponse de BLUSH · elles n’expirent jamais")).toBeVisible();
    await expect(main.getByRole("region", { name: "Ton abonnement" })).toHaveCount(0);
    await expect(main.getByRole("switch", { name: "Mettre en pause" })).toHaveCount(0);
    await bulles.getByRole("link", { name: "Lire la suite" }).click();
    await expect(page).toHaveURL(/\/rapport\?paiement=1$/);
    await expect(page.getByRole("dialog", { name: PAIEMENT })).toBeVisible();
  });

  await test.step("le rapport débloqué et des bulles reçues : le solde, et plus rien à lire en plus", async () => {
    await debloquerLaConv(email);
    await donnerDesBulles(email, 10);
    await ouvrir(page, "/compte");
    await expect(bulles.getByText("Tes bulles\u00a0: 10", { exact: true })).toBeVisible();
    await expect(bulles.getByRole("link", { name: "Lire la suite" })).toHaveCount(0);
    await expect(bulles.getByRole("switch")).toHaveCount(0);
    /* Rien d’acheté encore : pas de « Tes achats » */
    await expect(main.getByRole("region", { name: "Tes achats" })).toHaveCount(0);
  });

  await test.step("« C’est quoi une bulle ? » : sa feuille, que « Compris » ferme", async () => {
    await bulles.getByRole("button", { name: /^C’est quoi une bulle/ }).click();
    const feuille = page.getByRole("dialog", { name: "C’est quoi une bulle\u00a0?" });
    await expect(feuille.getByText("1 bulle = 1 réponse de BLUSH")).toBeVisible();
    await feuilleSurOrdinateur(page, feuille, { titre: 26 });
    await feuille.getByRole("button", { name: "Compris" }).click();
    await expect(feuille).toBeHidden();
  });

  let achat = "";
  await test.step("« Recharger » : 10 bulles au faux Whop, et l’on revient sur Mon compte, le solde et l’achat à jour", async () => {
    await bulles.getByRole("button", { name: /^Recharger/ }).click();
    const recharge = page.getByRole("dialog", { name: "Recharge tes bulles" });
    await expect(recharge).toBeVisible();
    await feuilleSurOrdinateur(page, recharge);
    await recharge.getByRole("radio", { name: /^10 bulles/ }).click();
    await recharge.getByRole("button", { name: "Payer · 6,90\u00a0€" }).click();
    await payerParCarte(page);
    /* Payé dans la feuille, sans quitter Mon compte : le solde se relit une fois l’achat livré */
    await expect(bulles.getByText("Tes bulles\u00a0: 20", { exact: true })).toBeVisible({ timeout: 2 * RESEAU });
    await expect(page).toHaveURL(/\/compte$/);
    /* Livré, la feuille se ferme d’elle-même (UI-1) : elle ne reste pas sur « C’est payé », modale, par-dessus la page */
    await expect(recharge).toBeHidden();
    achat = await dernierAchat(email);
    const achats = main.getByRole("region", { name: "Tes achats" });
    await expect(achats.getByText("10 bulles", { exact: true })).toBeVisible();
    await expect(achats.getByText(/^\d{1,2} \S+ \d{4} · \+10 bulles$/)).toBeVisible();
    await expect(achats.getByText("6,90\u00a0€")).toBeVisible();
    await expect(achats.getByText("Payé")).toBeVisible();
    expect(await compteDe(email)).toMatchObject({ bulles: 20 });
  });

  await test.step("remboursé (depuis Whop) : l’achat le dit, ses bulles sont reprises", async () => {
    await rembourser(page, achat);
    await ouvrir(page, "/compte");
    const achats = main.getByRole("region", { name: "Tes achats" });
    await expect(achats.getByText("Remboursé")).toBeVisible();
    await expect(bulles.getByText("Tes bulles\u00a0: 10", { exact: true })).toBeVisible();
  });

  await test.step("« Nouvelle histoire » repart du choix de l’appli", async () => {
    await main
      .getByRole("region", { name: "Tes histoires" })
      .getByRole("link", { name: /^Nouvelle histoire/ })
      .click();
    await expect(page).toHaveURL(/\/commencer$/);
    await expect(page.getByRole("heading", { level: 1, name: "Vous vous parlez où ?" })).toBeVisible();
  });
});

test("un compte de l’équipe : des bulles illimitées, ni abonnement, ni pause, ni arrêt", async ({ page }, testInfo) => {
  /* Un invité (BLUSH_ACCES_LIBRE) : de l’équipe dès la création du compte */
  const email = await nouvelInvite(testInfo);
  await connecterParApi(page, testInfo, email);
  await ouvrir(page, "/compte");
  const main = page.getByRole("main");
  const bulles = main.getByRole("region", { name: "Tes bulles" });

  await expect(bulles.getByText("Tes bulles\u00a0: illimitées", { exact: true })).toBeVisible();
  await expect(bulles.getByRole("link")).toHaveCount(0);
  /* Rien à recharger, rien d’acheté : « C’est quoi une bulle ? » seulement */
  await expect(bulles.getByRole("button", { name: /^Recharger/ })).toHaveCount(0);
  await expect(bulles.getByRole("button", { name: /^C’est quoi une bulle/ })).toBeVisible();
  await expect(main.getByRole("region", { name: "Tes achats" })).toHaveCount(0);
  await expect(main.getByRole("region", { name: "Ton abonnement" })).toHaveCount(0);
  await expect(main.getByRole("switch", { name: "Mettre en pause" })).toHaveCount(0);
  await expect(page.getByText(/Arrêter|BLUSH\+|semaine/)).toHaveCount(0);
  expect(await compteDe(email)).toMatchObject({ bulles: 0, debloquees: 0 });
});

test.describe("Sons et vibrations", () => {
  /* Ce test parle du réglage lui-même : il part de celui d’un navigateur neuf, sons allumés */
  test.use({ sonsAuDepart: true });

  test("Sons et vibrations : coupés d’un toucher, et toujours coupés au retour sur la page", async ({ page }, testInfo) => {
    const email = emailLibre(testInfo, "sons");
    await connecterParApi(page, testInfo, email);
    await ouvrir(page, "/compte");
    const sons = page.getByRole("main").getByRole("region", { name: "L’app" }).getByRole("switch", { name: "Sons et vibrations" });

    await expect(sons).toBeChecked();
    await sons.click();
    await expect(sons).not.toBeChecked();
    /* Le réglage est gardé sur cet appareil : la page rechargée le relit */
    await ouvrir(page);
    await expect(sons).not.toBeChecked();
    await sons.click();
    await expect(sons).toBeChecked();
    await ouvrir(page);
    await expect(sons).toBeChecked();
  });
});

test("supprimer l’histoire ouverte : Annuler n’efface rien ; confirmé, l’histoire part avec son lien public, et le compte reste", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "supprimer");
  await connecterParApi(page, testInfo, email);
  const histoire = await lireUneConvParApi(page, testInfo);
  await attendreTaches(email);
  /* Le verdict partagé : son lien public montre le prénom de qui partage */
  const lien = await mesurerCompteurs(() => partagerParApi(page, testInfo), { partage_ouvert: 1, lien_cree: 1 });
  await ouvrir(page, "/compte");
  const main = page.getByRole("main");
  const supprimer = main.getByRole("region", { name: "Tes données" }).getByRole("button", { name: /^Supprimer l’histoire avec Maëlys/ });
  const confirmation = page.getByRole("dialog", { name: "Supprimer l’histoire avec Maëlys\u00a0?" });

  await test.step("Annuler referme la feuille sans rien effacer", async () => {
    await supprimer.click();
    await expect(confirmation.getByText("Le rapport, la fiche et les captures.")).toBeVisible();
    await confirmation.getByRole("button", { name: "Annuler" }).click();
    await expect(confirmation).toBeHidden();
    expect(await histoireExiste(histoire)).toBe(true);
  });

  await test.step("confirmé : l’histoire est effacée, et on repart du choix de l’appli", async () => {
    await supprimer.click();
    await confirmation.getByRole("button", { name: "Supprimer l’histoire", exact: true }).click();
    await expect(page).toHaveURL(/\/commencer$/);
    await expect(page.getByRole("heading", { level: 1, name: "Vous vous parlez où ?" })).toBeVisible();
    expect(await histoireExiste(histoire)).toBe(false);
    expect(await compteDe(email)).toMatchObject({ bulles: 0, debloquees: 0 });
  });

  await test.step("le compte reste, connecté, sans l’histoire", async () => {
    await ouvrir(page, "/compte");
    await expect(page).toHaveURL(/\/compte$/);
    await expect(main.getByText(email)).toBeVisible();
    const histoires = main.getByRole("region", { name: "Tes histoires" });
    await expect(histoires.getByRole("link", { name: /^Nouvelle histoire/ })).toBeVisible();
    await expect(histoires.getByRole("link", { name: /Maëlys/ })).toHaveCount(0);
    expect(await histoiresDe(email)).toEqual([]);
  });

  await test.step("le lien public du verdict ne montre plus rien", () => lienEteint(page, lien));
});

test("Tout effacer : le compte et ses histoires disparaissent, avec leur lien public et la session", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "effacer");
  await connecterParApi(page, testInfo, email);
  const histoire = await lireUneConvParApi(page, testInfo);
  await attendreTaches(email);
  const lien = await mesurerCompteurs(() => partagerParApi(page, testInfo), { partage_ouvert: 1, lien_cree: 1 });
  await ouvrir(page, "/compte");
  const confirmation = page.getByRole("dialog", { name: "Tout effacer\u00a0?" });

  await test.step("confirmé : le compte et son histoire sont effacés", async () => {
    await page
      .getByRole("main")
      .getByRole("region", { name: "Tes données" })
      .getByRole("button", { name: /^Tout effacer/ })
      .click();
    await expect(confirmation.getByText("Ton compte et toutes tes histoires.")).toBeVisible();
    await confirmation.getByRole("button", { name: "Tout effacer", exact: true }).click();
    await expect(page).toHaveURL(/\/commencer$/);
    expect(await compteDe(email)).toBeNull();
    expect(await histoireExiste(histoire)).toBe(false);
  });

  await test.step("plus de session : Mon compte redemande la connexion, la landing est celle de tous", async () => {
    await page.goto("/compte");
    await expect(page).toHaveURL(/\/connexion\?suite=%2Fcompte$/);
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link", { name: "Se connecter" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Retrouver ma conv" })).toHaveCount(0);
  });

  await test.step("le lien public du verdict ne montre plus rien", () => lienEteint(page, lien));
});
