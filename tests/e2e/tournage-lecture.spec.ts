import { convDeTournage, expect, nouvelAdminDuTournage, ouvrirLeLienDuTournage, priseDuTournage, REPONSES_NOE, repondreQui, test } from "./aide";

/*
 * La lecture d’une prise du mode tournage (src/app/lecture/suivi.ts) : recopiée de la conv de tournage, elle est finie
 * avant même l’écran, qui la déroule en deux secondes depuis son arrivée. La créatrice filme l’anneau qui se remplit,
 * puis « Voir mon rapport », sans attendre les 40 secondes d’une vraie lecture.
 */

/** Le nom de la conv de tournage (inventé, comme ceux des campagnes). */
const NOM = "B · Vu à 23 h 12";

test("une prise du mode tournage : sa lecture se déroule en deux secondes, puis « Voir mon rapport »", async ({ page }, testInfo) => {
  test.slow();
  const cle = await convDeTournage(page, testInfo, await nouvelAdminDuTournage(testInfo), NOM);
  await ouvrirLeLienDuTournage(page, cle);
  await priseDuTournage(page, testInfo);

  await page.goto("/qui");
  await repondreQui(page, REPONSES_NOE);
  await page.getByRole("button", { name: "Lancer la lecture" }).click();
  await expect(page).toHaveURL(/\/lecture$/);
  /* L’anneau d’abord : la lecture se voit, même finie côté serveur avant l’arrivée */
  await expect(page.getByRole("progressbar", { name: "Analyse de votre conv" })).toBeVisible();
  const debut = Date.now();
  /* Ses deux secondes, puis l’anneau plein et la gerbe (une seconde) */
  await expect(page.getByRole("link", { name: "Voir mon rapport" })).toBeVisible({ timeout: 6000 });
  expect(Date.now() - debut).toBeGreaterThan(1500);
});
