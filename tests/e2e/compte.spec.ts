import type { Page } from "@playwright/test";
import {
  attendreTaches,
  compteDe,
  connecterParApi,
  definirPlan,
  emailLibre,
  enPause,
  expect,
  histoireExiste,
  histoiresDe,
  lireUneConvParApi,
  mesurerCompteurs,
  nouvelInvite,
  ouvrir,
  PAIEMENT,
  partagerParApi,
  test,
} from "./aide";

/*
 * Mon compte (/compte), à la manière des Réglages : toi en haut, ton abonnement, les sons, puis tes données et les gestes
 * qui effacent. Le compte et sa conv sont préparés par les routes /api (aide/compte.ts) ; tout le reste se fait à l’écran,
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

test("le plan affiché suit le compte : l’aperçu gratuit et sa suite à lire, puis le rapport complet", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "compte");
  await connecterParApi(page, testInfo, email);
  await lireUneConvParApi(page, testInfo);
  await attendreTaches(email);
  const main = page.getByRole("main");
  const abonnement = main.getByRole("region", { name: "Ton abonnement" });

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

  await test.step("gratuit : l’aperçu, sans pause ni arrêt, et « Lire la suite » ouvre le paiement sur le rapport", async () => {
    await expect(abonnement.getByText("Ton rapport", { exact: true })).toBeVisible();
    await expect(abonnement.getByText("Aperçu gratuit", { exact: true })).toBeVisible();
    await expect(abonnement.getByRole("switch")).toHaveCount(0);
    await expect(abonnement.getByRole("button")).toHaveCount(0);
    await abonnement.getByRole("link", { name: "Lire la suite" }).click();
    await expect(page).toHaveURL(/\/rapport\?paiement=1$/);
    await expect(page.getByRole("dialog", { name: PAIEMENT })).toBeVisible();
  });

  await test.step("le rapport complet, payé une fois : son prix, et plus rien à lire en plus", async () => {
    await definirPlan(email, "rapport");
    await ouvrir(page, "/compte");
    await expect(abonnement.getByText("Le rapport complet", { exact: true })).toBeVisible();
    await expect(abonnement.getByText("Une fois · à toi pour toujours", { exact: true })).toBeVisible();
    await expect(abonnement.getByText("8,99 €", { exact: true })).toBeVisible();
    await expect(abonnement.getByRole("link", { name: "Lire la suite" })).toHaveCount(0);
    await expect(abonnement.getByRole("switch")).toHaveCount(0);
  });

  await test.step("« Nouvelle histoire » repart du choix de l’appli", async () => {
    await main.getByRole("region", { name: "Tes histoires" }).getByRole("link", { name: /^Nouvelle histoire/ }).click();
    await expect(page).toHaveURL(/\/commencer$/);
    await expect(page.getByRole("heading", { level: 1, name: "Vous vous parlez où ?" })).toBeVisible();
  });
});

test("BLUSH+ : actif à 7,99 € la semaine, et la pause qui tient après un rechargement", async ({ page }, testInfo) => {
  /* Un invité : BLUSH+ dès la création du compte (BLUSH_ACCES_LIBRE) */
  const email = await nouvelInvite(testInfo);
  await connecterParApi(page, testInfo, email);
  await ouvrir(page, "/compte");
  const abonnement = page.getByRole("main").getByRole("region", { name: "Ton abonnement" });
  const pause = abonnement.getByRole("switch", { name: "Mettre en pause" });

  await test.step("BLUSH+, actif, son prix et son renouvellement", async () => {
    /* Le nom du plan, et son état en étiquette juste à côté */
    await expect(abonnement).toContainText(/BLUSH\+\s*actif/);
    await expect(abonnement.getByText("Renouvelé lundi · sans engagement")).toBeVisible();
    await expect(abonnement.getByText("7,99 €", { exact: true })).toBeVisible();
    await expect(abonnement.getByText("/ semaine", { exact: true })).toBeVisible();
    await expect(pause).not.toBeChecked();
  });

  await test.step("en pause d’un toucher : l’écran le dit, le compte le garde, même après un rechargement", async () => {
    await pause.click();
    await expect(pause).toBeChecked();
    await expect(abonnement).toContainText(/BLUSH\+\s*en pause/);
    await expect.poll(() => enPause(email)).toBe(true);
    await ouvrir(page);
    await expect(pause).toBeChecked();
    await expect(abonnement).toContainText(/BLUSH\+\s*en pause/);
  });

  await test.step("reprendre : actif de nouveau", async () => {
    await pause.click();
    await expect(pause).not.toBeChecked();
    await expect(abonnement).toContainText(/BLUSH\+\s*actif/);
    await expect.poll(() => enPause(email)).toBe(false);
  });
});

/*
 * « Arrêter BLUSH+ » revient avec le paiement (Stripe) : sans lui, il n’y a rien à résilier côté serveur. D’ici là, ni
 * la ligne ni sa feuille : l’abonnement ne propose que la pause.
 */
test("BLUSH+ : la pause seulement, sans « Arrêter BLUSH+ » tant que le paiement n’existe pas", async ({ page }, testInfo) => {
  const email = await nouvelInvite(testInfo);
  await connecterParApi(page, testInfo, email);
  await ouvrir(page, "/compte");
  const abonnement = page.getByRole("main").getByRole("region", { name: "Ton abonnement" });

  await expect(abonnement).toContainText(/BLUSH\+\s*actif/);
  await expect(abonnement.getByRole("switch", { name: "Mettre en pause" })).toBeVisible();
  /* Ni bouton ni lien dans l’abonnement, et rien de l’arrêt nulle part sur la page */
  await expect(abonnement.getByRole("button")).toHaveCount(0);
  await expect(abonnement.getByRole("link")).toHaveCount(0);
  await expect(page.getByText(/Arrêter BLUSH\+|effectif lundi/)).toHaveCount(0);
});

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
  const confirmation = page.getByRole("dialog", { name: "Supprimer l’histoire avec Maëlys ?" });

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
    expect(await compteDe(email)).toMatchObject({ plan: "gratuit" });
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
  const confirmation = page.getByRole("dialog", { name: "Tout effacer ?" });

  await test.step("confirmé : le compte et son histoire sont effacés", async () => {
    await page.getByRole("main").getByRole("region", { name: "Tes données" }).getByRole("button", { name: /^Tout effacer/ }).click();
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
