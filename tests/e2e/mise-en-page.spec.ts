import type { Locator, Page } from "@playwright/test";
import { champDuChat, expect, lectureBlushPlus, mesurerCompteurs, ouvrir, partagerParApi, test } from "./aide";

/*
 * La mise en page des écrans, sur ordinateur et sur iPhone : rien ne déborde sur le côté (la page ne glisse pas de
 * gauche à droite), et le geste principal de chaque écran se laisse amener entièrement à l’écran. De quoi voir une
 * régression du design system sans comparer des captures (les polices diffèrent d’une machine à l’autre).
 */

/** Rien ne déborde sur le côté : la page fait la largeur de l’écran. */
async function sansDebordement(page: Page, ecran: string): Promise<void> {
  const { large, ecranLarge } = await page.evaluate(() => ({ large: document.documentElement.scrollWidth, ecranLarge: window.innerWidth }));
  expect.soft(large, `${ecran} : la largeur de la page (l’écran fait ${ecranLarge} px)`).toBeLessThanOrEqual(ecranLarge);
}

/** Le geste principal de l’écran, amené à l’écran (en défilant si besoin), y est en entier (au pixel près : les écrans fins arrondissent). */
async function gestePrincipal(geste: Locator, ecran: string): Promise<void> {
  await geste.scrollIntoViewIfNeeded();
  await expect.soft(geste, `${ecran} : son geste principal`).toBeInViewport({ ratio: 0.98 });
}

test("les pages publiques et le parcours d’import : pas de débordement, le geste principal à portée", async ({ page }) => {
  const ecrans: [string, (p: Page) => Locator][] = [
    ["/", (p) => p.getByRole("main").getByRole("link", { name: "Analyser ma conv" }).first()],
    ["/commencer", (p) => p.getByRole("navigation", { name: "Ton appli" }).getByRole("link", { name: /WhatsApp/ })],
    ["/importer/export?app=whatsapp", (p) => p.getByRole("button", { name: "Choisir le fichier enregistré" })],
    ["/importer/captures?app=autre", (p) => p.getByRole("button", { name: "Choisir mes captures" })],
    ["/confidentialite", (p) => p.getByRole("main").getByRole("link", { name: /Écris-nous/ })],
  ];
  for (const [adresse, geste] of ecrans)
    await test.step(adresse, async () => {
      await page.goto(adresse);
      await sansDebordement(page, adresse);
      await gestePrincipal(geste(page), adresse);
    });
});

test("les écrans d’un compte BLUSH+ : pas de débordement, le geste principal à portée", async ({ page }, testInfo) => {
  await lectureBlushPlus(page, testInfo);
  const ecrans: [string, (p: Page) => Locator][] = [
    ["/lecture", (p) => p.getByRole("link", { name: "Voir mon rapport" })],
    ["/rapport", (p) => p.getByRole("main").getByRole("button", { name: "Partager mon verdict" })],
    ["/app", (p) => champDuChat(p)],
    ["/app/fiche", (p) => p.getByRole("button", { name: "Modifier" })],
    ["/compte", (p) => p.getByRole("main").getByRole("button", { name: /^Tout effacer/ })],
  ];
  for (const [adresse, geste] of ecrans)
    await test.step(adresse, async () => {
      /* Les pages du compte le lisent une fois vivantes : on attend cette lecture avant de mesurer */
      if (adresse.startsWith("/app") || adresse === "/compte") await ouvrir(page, adresse);
      else await page.goto(adresse);
      await sansDebordement(page, adresse);
      await gestePrincipal(geste(page), adresse);
    });

  await test.step("/v/<id>, le verdict partagé", async () => {
    const id = await mesurerCompteurs(() => partagerParApi(page, testInfo), { partage_ouvert: 1, lien_cree: 1 });
    await mesurerCompteurs(() => page.goto(`/v/${id}`), { lien_vu: 1 });
    await sansDebordement(page, "/v/<id>");
    await gestePrincipal(page.getByRole("link", { name: "Analyser ma conv" }), "/v/<id>");
  });
});
