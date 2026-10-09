import { attendreLecture, autreCode, champDuCode, compteDe, dernierCode, emailLibre, expect, expirerCode, exportWhatsApp, jusquAuCode, mailsPour, saisirCode, test } from "./aide";

/*
 * Le code reçu par email, pour un nouveau venu qui vient d’importer sa conv : un mauvais code, un code expiré, un code
 * déjà utilisé, trop d’essais. Le compte ne naît qu’au bon code, et un nouveau code repart toujours de zéro.
 */

const CODE_FAUX = "Ce code ne marche pas. Vérifie-le, ou demande-en un nouveau.";

test("un mauvais code est refusé sans créer de compte, le bon lance la lecture, puis il ne sert plus", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "code-faux");
  const depuis = await jusquAuCode(page, exportWhatsApp(testInfo), email);
  const code = await dernierCode(email, { depuis });
  const champ = champDuCode(page);

  await test.step("un mauvais code : le message, le champ vidé, pas de compte", async () => {
    expect(await saisirCode(page, autreCode(code))).toBe(false);
    await expect(page.getByText(CODE_FAUX)).toBeVisible();
    await expect(champ).toHaveValue("");
    await expect(champ).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/\/email\/code$/);
    expect(await compteDe(email)).toBeNull();
  });

  await test.step("le bon code : le compte naît, la lecture se fait", async () => {
    expect(await saisirCode(page, code)).toBe(true);
    await attendreLecture(page);
    expect(await compteDe(email)).toMatchObject({ plan: "gratuit" });
  });

  await test.step("revenu sur l’écran du code, le même code ne marche plus", async () => {
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "Entre ton code." })).toBeVisible();
    expect(await saisirCode(page, code)).toBe(false);
    await expect(page.getByText(CODE_FAUX)).toBeVisible();
    await expect(page).toHaveURL(/\/email\/code$/);
  });
});

test("un code expiré est refusé : « Changer d’email » en redemande un, qui marche", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "code-expire");
  const depuis = await jusquAuCode(page, exportWhatsApp(testInfo), email);
  const code = await dernierCode(email, { depuis });

  await test.step("dix minutes plus tard, le code est refusé", async () => {
    await expirerCode(email);
    expect(await saisirCode(page, code)).toBe(false);
    await expect(page.getByText(CODE_FAUX)).toBeVisible();
    expect(await compteDe(email)).toBeNull();
  });

  await test.step("« Changer d’email » garde l’email, et un nouveau code part", async () => {
    await page.getByRole("link", { name: "Changer d’email" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "On t’envoie ton rapport où ?" })).toBeVisible();
    await expect(page.getByLabel("Ton email")).toHaveValue(email);
    const encore = Date.now();
    await page.getByRole("button", { name: "Recevoir mon code" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Entre ton code." })).toBeVisible();
    expect(await saisirCode(page, await dernierCode(email, { depuis: encore }))).toBe(true);
    await expect(page).toHaveURL(/\/lecture$/);
    expect(await compteDe(email)).toMatchObject({ plan: "gratuit" });
    expect(mailsPour(email)).toHaveLength(2);
  });
});

test("cinq mauvais codes : même le bon est refusé ensuite, un nouveau code repart de zéro", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "code-essais");
  const depuis = await jusquAuCode(page, exportWhatsApp(testInfo), email);
  const code = await dernierCode(email, { depuis });

  await test.step("cinq essais faux, puis le bon : refusé aussi", async () => {
    for (let k = 0; k < 5; k++) expect(await saisirCode(page, autreCode(code))).toBe(false);
    expect(await saisirCode(page, code)).toBe(false);
    await expect(page.getByText(CODE_FAUX)).toBeVisible();
    expect(await compteDe(email)).toBeNull();
  });

  await test.step("un nouveau code, et la lecture part", async () => {
    await page.getByRole("link", { name: "Changer d’email" }).click();
    const encore = Date.now();
    await page.getByRole("button", { name: "Recevoir mon code" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Entre ton code." })).toBeVisible();
    expect(await saisirCode(page, await dernierCode(email, { depuis: encore }))).toBe(true);
    await expect(page).toHaveURL(/\/lecture$/);
    expect(await compteDe(email)).toMatchObject({ plan: "gratuit" });
  });
});
