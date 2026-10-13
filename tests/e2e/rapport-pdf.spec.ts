import { readFile } from "node:fs/promises";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { lirePdf } from "../aide/pdf";
import { ALERTE_FACTICE, CHAPITRES_FERMES, emailLibre, expect, lectureComplete, lectureFaite, noterLaFeuilleDuSysteme, ouvrirLeRapport, test } from "./aide";

/*
 * « Télécharger en PDF » : le rapport tel qu’on le lit, en PDF. Sur ordinateur (Chromium), il s’enregistre ; sur un
 * téléphone qui sait partager un fichier (WebKit en iPhone), il part par la feuille de partage du système, que
 * Playwright ne pilote pas (une feuille qui note ce qu’on lui donne la remplace) ; ailleurs, il s’enregistre aussi. Ce
 * qu’il contient se relit dans le fichier : un aperçu gratuit n’a rien des chapitres fermés, le rapport ouvert les a tous.
 */

/** Le PDF que le serveur dessine pour ce compte (la même route que le bouton) : son texte, ses blancs ramenés à une espace, et ses pages. */
async function pdfDuCompte(page: Page): Promise<{ texte: string; pages: number }> {
  const r = await page.request.get("/api/rapport/pdf", { timeout: 60_000 });
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toBe("application/pdf");
  expect(r.headers()["cache-control"]).toBe("private, no-store");
  const lu = lirePdf(await r.body());
  return { texte: lu.texte.replace(/\s+/g, " "), pages: lu.pages.length };
}

/**
 * Touche `bouton` et vérifie le geste : la feuille du système reçoit rapport-blush.pdf (un écran tactile qui sait la
 * donner), sinon il s’enregistre sous ce nom, un vrai PDF. Dit lequel dans le rapport du test.
 */
async function telechargerDepuis(page: Page, testInfo: TestInfo, bouton: Locator, partages: () => Promise<{ nom: string; type: string; octets: number }[]>) {
  const parLaFeuille = await page.evaluate(
    () => matchMedia("(pointer: coarse)").matches && !!navigator.canShare?.({ files: [new File(["x"], "x.pdf", { type: "application/pdf" })] }),
  );
  testInfo.annotations.push({ type: "geste", description: parLaFeuille ? "la feuille de partage du système" : "le téléchargement" });
  if (parLaFeuille) {
    await bouton.click();
    await expect.poll(partages, { timeout: 60_000 }).toEqual([{ nom: "rapport-blush.pdf", type: "application/pdf", octets: expect.any(Number) }]);
    expect((await partages())[0]!.octets).toBeGreaterThan(10_000);
    return;
  }
  const [telechargement] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), bouton.click()]);
  expect(telechargement.suggestedFilename()).toBe("rapport-blush.pdf");
  const lu = lirePdf(await readFile(await telechargement.path()));
  expect(lu.meta.Title).toBe("Ton rapport BLUSH");
  expect(lu.pages.length).toBeGreaterThan(0);
  await expect(page.getByText("PDF enregistré.").first()).toBeVisible();
}

test("compte gratuit : « Télécharger en PDF » à la fin du rapport, le verdict, le chapitre 1 et les titres des chapitres fermés", async ({ page }, testInfo) => {
  const partages = await noterLaFeuilleDuSysteme(page);
  const email = emailLibre(testInfo, "rapport-pdf");
  await lectureFaite(page, testInfo, email);
  const rapport = await ouvrirLeRapport(page);

  await test.step("à la fin du rapport, sous la suite fermée", async () => {
    const bouton = rapport.getByRole("button", { name: /^Télécharger en PDF/ }).last();
    await bouton.scrollIntoViewIfNeeded();
    await expect(bouton).toContainText("Ton rapport, à garder ou à imprimer");
    await telechargerDepuis(page, testInfo, bouton, partages);
  });

  await test.step("le PDF : la page de garde, le verdict, le chapitre 1, les titres des autres, rien de leur contenu", async () => {
    const { texte } = await pdfDuCompte(page);
    for (const morceau of ["Le rapport de votre histoire", "Noé & Maëlys", "Aperçu gratuit", "Vous êtes à deux doigts.", "La suite t’attend sur askblush.com", ...CHAPITRES_FERMES])
      expect(texte).toContain(morceau);
    expect(texte).not.toContain("Le soir où tout a basculé.");
  });
});

test("compte de l’équipe : le rapport complet en PDF, depuis le sommaire", async ({ page }, testInfo) => {
  test.slow();
  const partages = await noterLaFeuilleDuSysteme(page);
  await lectureComplete(page, testInfo);
  await ouvrirLeRapport(page);

  await test.step("le sommaire (à gauche sur ordinateur, sa feuille sur téléphone) le propose", async () => {
    const aGauche = page.getByRole("navigation", { name: "Sommaire" });
    let bouton: Locator;
    if (await aGauche.isVisible()) bouton = aGauche.getByRole("button", { name: /^Télécharger en PDF/ });
    else {
      await page.getByRole("button", { name: "Sommaire du rapport" }).click();
      bouton = page.getByRole("dialog", { name: "Sommaire" }).getByRole("button", { name: /^Télécharger en PDF/ });
    }
    await telechargerDepuis(page, testInfo, bouton, partages);
  });

  await test.step("le PDF : les huit chapitres, écrits", async () => {
    const { texte, pages } = await pdfDuCompte(page);
    expect(pages).toBeGreaterThan(2);
    expect(texte).toContain("Complet");
    for (const titre of CHAPITRES_FERMES) expect(texte).toContain(titre);
    expect(texte.split("Le soir où tout a basculé.").length - 1).toBe(8);
    expect(texte).not.toContain("La suite t’attend");
  });
});

test("une alerte : le rapport doux, en PDF, tel quel", async ({ page }, testInfo) => {
  const partages = await noterLaFeuilleDuSysteme(page);
  const email = emailLibre(testInfo, "rapport-pdf-sobre");
  await lectureFaite(page, testInfo, email, { ajout: { de: "autre", texte: ALERTE_FACTICE } });
  await page.goto("/rapport");
  const ecran = page.getByRole("main");
  await ecran.getByRole("button", { name: "Et maintenant ?" }).click();
  await telechargerDepuis(page, testInfo, ecran.getByRole("button", { name: /^Télécharger en PDF/ }), partages);
  const { texte } = await pdfDuCompte(page);
  for (const morceau of ["Ce que tu vis n’est pas normal.", "Passe à autre chose, proprement.", "Fil Santé Jeunes"]) expect(texte).toContain(morceau);
  expect(texte).not.toContain("Vous êtes à deux doigts.");
});
