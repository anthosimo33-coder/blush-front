import { devices } from "@playwright/test";
import { emailLibre, expect, lectureFaite, test } from "./aide";

/*
 * « Retour » ne sort jamais de BLUSH (useRetourSinon, src/lib/navigation.ts). Le lien du mail ouvert dans un onglet neuf :
 * « Retour » mène à l’accueil (le repli), le retour du système ramène au rapport, et un nouveau « Retour » reste dans
 * BLUSH. Avant, l’appli se fiait à la seule page d’avant qu’elle avait vue (l’accueil) et revenait en arrière : hors de
 * BLUSH (la messagerie d’où venait le lien), ou nulle part dans un onglet neuf. Seule l’API Navigation dit que l’entrée
 * d’avant n’est pas à BLUSH : Chromium l’a, pas WebKit (la limite est écrite à entreeDAvantDansBlush).
 */

test.describe("sur un téléphone", () => {
  /* La barre du haut du rapport, avec son « Retour », est celle du téléphone. Le moteur reste celui du projet */
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
  test.skip(({ browserName }) => browserName !== "chromium", "l’API Navigation est celle de Chromium : WebKit ne l’a pas encore");

  test("le lien du mail dans un onglet neuf : « Retour », le retour du système, puis « Retour » : on reste sur l’accueil", async ({ page }, testInfo) => {
    const id = await lectureFaite(page, testInfo, emailLibre(testInfo, "retour-hors"));
    /* Un onglet neuf, du même navigateur (la session) : son historique commence au lien */
    const onglet = await page.context().newPage();
    const retour = onglet.getByRole("button", { name: "Retour", exact: true });

    await test.step("le lien ouvre le rapport ; « Retour » mène à l’accueil, sans page d’avant dans BLUSH", async () => {
      await onglet.goto(`/ouvrir/${id}`);
      await expect(onglet).toHaveURL(/\/rapport$/);
      await retour.click();
      await expect(onglet).toHaveURL(/\/app$/);
    });

    await test.step("le retour du système ramène au rapport, la première entrée de l’onglet", async () => {
      await onglet.goBack();
      await expect(onglet).toHaveURL(/\/rapport$/);
      expect(await onglet.evaluate(() => (window as Window & { navigation?: { currentEntry: { index: number } | null } }).navigation?.currentEntry?.index)).toBe(0);
    });

    await test.step("un nouveau « Retour » reste dans BLUSH : l’accueil à nouveau, pas en arrière hors de l’onglet", async () => {
      await retour.click();
      await expect(onglet).toHaveURL(/\/app$/);
      expect(new URL(onglet.url()).origin).toBe(new URL(testInfo.project.use.baseURL!).origin);
    });
  });
});
