import type { Page } from "@playwright/test";
import { connecterParApi, convDeTournage, emailLibre, expect, lancerLaPrise, nouvelAdminDuTournage, ouvrirLeLienDuTournage, priseDuTournage, test } from "./aide";

/*
 * Le repère du mode tournage (src/components/shell/RepereTournage.tsx) : un compte de BLUSH_ADMINS dont le navigateur
 * garde le lien d’une conv de tournage le voit sur les écrans de l’import ; il nomme le lien et mène à /tournage, où l’on
 * quitte le mode. Une créatrice ou un visiteur sans compte, avec le même lien, n’en voient jamais rien : elles filment
 * ces écrans.
 */

/** Le nom de la conv de tournage (inventé, comme ceux des campagnes). */
const NOM = "A · Il répond plus pareil";

/** Le repère, tel que le lit un lecteur d’écran. */
const repere = (page: Page) => page.getByRole("link", { name: /^Mode tournage/ });

/** Ouvre un écran de l’import, et rend ce que GET /api/tournage/repere a répondu à ce navigateur en route. */
async function ouvrir(page: Page, chemin: string): Promise<{ nom: string | null }> {
  const reponse = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/tournage/repere");
  await page.goto(chemin);
  return (await (await reponse).json()) as { nom: string | null };
}

test("le repère du mode tournage : l’équipe le voit sur les écrans de l’import, une créatrice ou un visiteur jamais", async ({ page, autreAppareil }, testInfo) => {
  test.slow();
  const cle = await convDeTournage(page, testInfo, await nouvelAdminDuTournage(testInfo), NOM);
  await ouvrirLeLienDuTournage(page, cle);

  await test.step("l’équipe : les captures et l’export nomment le lien", async () => {
    expect(await ouvrir(page, "/importer/captures?app=instagram")).toEqual({ nom: NOM });
    await expect(repere(page)).toHaveAccessibleName(`Mode tournage\u00a0: ${NOM}. Ouvrir la page du mode tournage`);
    await expect(repere(page)).toBeInViewport();
    await ouvrir(page, "/importer/export?app=whatsapp");
    await expect(repere(page)).toBeVisible();
  });

  await test.step("l’équipe : « Qui es-tu ? », puis la lecture rejouée", async () => {
    await priseDuTournage(page, testInfo);
    await ouvrir(page, "/qui");
    await expect(repere(page)).toBeVisible();
    await lancerLaPrise(page, testInfo);
    await ouvrir(page, "/lecture");
    await expect(repere(page)).toBeVisible();
  });

  await test.step("le repère mène à /tournage, où l’on quitte le mode", async () => {
    await repere(page).click();
    await expect(page).toHaveURL(/\/tournage$/);
    await expect(page.getByRole("button", { name: "Quitter le mode tournage" })).toBeVisible();
  });

  await test.step("le même lien, sans compte puis avec celui d’une créatrice : rien, la même réponse que sans le mode", async () => {
    const creatrice = await autreAppareil();
    await ouvrirLeLienDuTournage(creatrice, cle);
    expect(await ouvrir(creatrice, "/importer/captures?app=instagram")).toEqual({ nom: null });
    await expect(repere(creatrice)).toHaveCount(0);
    await connecterParApi(creatrice, testInfo, emailLibre(testInfo, "creatrice"));
    expect(await ouvrir(creatrice, "/importer/export?app=whatsapp")).toEqual({ nom: null });
    await expect(repere(creatrice)).toHaveCount(0);
  });
});
