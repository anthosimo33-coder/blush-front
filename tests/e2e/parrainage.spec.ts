import { randomBytes } from "node:crypto";
import { connecterParApi, emailLibre, expect, sql, test } from "./aide";

/*
 * Le parrainage de bout en bout (src/server/parrainage.ts) : le lien d’une amie (/p/<code>) garde son code dans un
 * cookie et mène à la landing ; le compte créé ensuite dans ce navigateur garde sa marraine. Puis la page de son propre
 * lien, à copier.
 */

/** Un code de parrainage neuf, de la forme de CODE (sans 0, O, 1, l ni i). */
const codeNeuf = () => [...randomBytes(7)].map((o) => "abcdefghjkmnpqrstuvwxyz23456789"[o % 31]).join("");

test("le lien d’une amie : la landing, puis le compte créé garde sa marraine ; sa page de parrainage, son lien à copier", async ({ page }, testInfo) => {
  const code = codeNeuf();
  const [marraine] = await sql()<{ id: string }[]>`insert into users (email, code_parrainage) values (${emailLibre(testInfo, "marraine")}, ${code}) returning id`;
  const email = emailLibre(testInfo, "filleule");

  await test.step("le lien mène à la landing, sans rien dire de la marraine", async () => {
    await page.goto(`/p/${code}`);
    await expect(page).toHaveURL(/\/$/);
  });

  await test.step("le compte créé ensuite dans ce navigateur garde sa marraine", async () => {
    await connecterParApi(page, testInfo, email);
    const [u] = await sql()<{ parrain: string | null }[]>`select parrain_id as parrain from users where email = ${email}`;
    expect(u?.parrain).toBe(marraine!.id);
  });

  await test.step("sa page de parrainage : son propre lien, à copier", async () => {
    await page.goto("/parrainage");
    await expect(page.getByRole("heading", { level: 1, name: "Ton lien de parrainage" })).toBeVisible();
    await expect(page.getByText(/\/p\/[a-z2-9]{7}$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Copier mon lien" })).toBeVisible();
  });
});

test("la page de parrainage sans compte connecté : la connexion d’abord", async ({ page }) => {
  await page.goto("/parrainage");
  await expect(page).toHaveURL(`/connexion?suite=${encodeURIComponent("/parrainage")}`);
});
