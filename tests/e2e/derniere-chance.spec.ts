import { connecterParApi, emailLibre, expect, lireUneConvParApi, OFFRE_SUITE, sql, test } from "./aide";

/*
 * Le mail J+6 de S1 (la « dernière fois », src/server/sequences.ts) : sa one time offer ① rouverte deux jours, son lien
 * ouvre le paywall tout de suite, l’offre déjà là, son compte à rebours en jours et sa fin dite en toutes lettres.
 */
test("le lien du mail J+6 : le paywall tout de suite, la one time offer rouverte, en jours", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "derniere");
  await connecterParApi(page, testInfo, email);
  const conv = await lireUneConvParApi(page, testInfo, { verdictOffert: false });
  /* Ce que fait le mail : la ① rouverte jusqu’à dans deux jours */
  await sql()`insert into offres_uniques (user_id, offre, story_id, expire_le)
    select id, 'suite', ${conv}, now() + interval '2 days' from users where email = ${email.toLowerCase()}`;
  await page.goto("/lecture?paywall=1&offre=1");
  const offre = page.getByRole("dialog", { name: OFFRE_SUITE });
  await expect(offre).toBeVisible();
  await expect(offre.getByRole("timer", { name: "Elle disparaît dans" })).toHaveText(/^\d\u00a0j \d{1,2}\u00a0h$/);
  await expect(offre.getByText(/Jusqu’à (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) minuit/)).toBeVisible();
});
