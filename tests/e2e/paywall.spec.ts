import {
  attendreLecture,
  compteDe,
  dernierCode,
  emailLibre,
  expect,
  exportWhatsApp,
  jusquAuCode,
  OFFRE_SUITE,
  payerParCarte,
  quitterPuisRevenir,
  RESEAU,
  saisirCode,
  sql,
  tachesDe,
  test,
  tientEnPetitEcran,
} from "./aide";

/*
 * Le paywall avant toute lecture (décidé le 16 octobre), de bout en bout, comme un nouveau venu : l’import, « Qui
 * es-tu ? », le code reçu par email, puis la lecture, que le code déroule seul (rien ne part au modèle), « Voir mon
 * rapport », le paywall sur un seul écran (les deux formules et le bouton qui paie), l’offre ① au retour sur l’onglet,
 * le paiement au faux Whop, « C’est débloqué » (le rapport entier, huit chapitres), puis la vraie lecture et le verdict.
 */

/** Les verdicts écrits pour les convs de ce compte : aucun tant que rien n’est payé (le modèle n’a rien lu). */
const verdictsEcrits = async (email: string) =>
  (
    await sql()<{ n: number }[]>`
    select count(*)::int as n from verdicts v join stories s on s.id = v.story_id join users u on u.id = s.user_id where u.email = ${email.toLowerCase()}`
  )[0]!.n;

test("un nouveau venu : la lecture du code, le paywall, payé, puis la vraie lecture et son verdict", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "paywall");
  const depuis = await jusquAuCode(page, exportWhatsApp(testInfo), email);
  expect(await saisirCode(page, await dernierCode(email, { depuis }))).toBe(true);

  await test.step("la lecture se déroule sans le modèle : « Voir mon rapport » mène au paywall, rien n’est payé ni lu", async () => {
    expect(await attendreLecture(page, { paywall: "garder" })).toBe("paywall");
    expect((await tachesDe(email)).map((t) => [t.genre, t.statut])).toEqual([["verdict", "paiement"]]);
    expect(await verdictsEcrits(email)).toBe(0);
    expect(await compteDe(email)).toMatchObject({ bulles: 0, debloquees: 0 });
  });

  await test.step("« Voir mon rapport » : le paywall sur un écran, les deux formules aux prix du 16 octobre, Premium choisie d’avance", async () => {
    await page.getByRole("button", { name: "Voir mon rapport" }).click();
    const ecran = page.getByRole("main");
    /* Le titre : la première trouvaille du code, qui nomme l’autre */
    await expect(ecran.getByRole("heading", { level: 1 })).toContainText("Maëlys");
    await expect(ecran.getByText("Ton rapport · 8 chapitres")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(ecran.getByRole("radio", { name: /^Le rapport/ })).toContainText("13,90\u00a0€");
    const premium = ecran.getByRole("radio", { name: /Rapport \+ 60 bulles/ });
    await expect(premium).toContainText("18,90\u00a0€");
    await expect(premium).toHaveAttribute("aria-checked", "true");
    await expect(ecran.getByRole("button", { name: "Débloquer · 18,90\u00a0€" })).toBeVisible();
    await tientEnPetitEcran(page, "le paywall");
    expect(await verdictsEcrits(email)).toBe(0);
  });

  await test.step("l’onglet quitté puis retrouvé : l’offre ①, « Offre unique sur ton rapport », une fois ; « Non merci »", async () => {
    await quitterPuisRevenir(page);
    const offre = page.getByRole("dialog", { name: OFFRE_SUITE });
    await expect(offre).toBeVisible();
    await expect(offre.getByRole("button", { name: "Je le prends · 10,90\u00a0€" })).toBeVisible();
    await offre.getByRole("button", { name: "Non merci" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await quitterPuisRevenir(page);
    await page.waitForTimeout(1000);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  await test.step("le rapport seul, payé sur l’écran : « C’est débloqué », les huit chapitres", async () => {
    const ecran = page.getByRole("main");
    await ecran.getByRole("radio", { name: /^Le rapport/ }).click();
    await ecran.getByRole("button", { name: "Débloquer · 13,90\u00a0€" }).click();
    await payerParCarte(page);
    await expect(page).toHaveURL(/\/rapport\/debloque\?achat=/, { timeout: RESEAU });
    const debloque = page.getByRole("main");
    await expect(debloque.getByRole("heading", { level: 1, name: "C’est débloqué." })).toBeVisible();
    await expect(debloque.getByText("Les 8 chapitres sont à toi. Et 10 bulles pour en parler avec BLUSH.")).toBeVisible();
    expect(await compteDe(email)).toMatchObject({ debloquees: 1, bulles: 10 });
  });

  await test.step("l’offre ③ passée, « Continuer » : la vraie lecture, puis son verdict", async () => {
    const ecran = page.getByRole("main");
    const continuer = ecran.getByRole("link", { name: "Continuer" });
    const nonMerci = ecran.getByRole("button", { name: /^Non merci/ });
    /* L’offre ③, puis son repli (le 2e rapport), refusés l’un après l’autre : la liste, et « Continuer » vers la lecture */
    for (let k = 0; k < 3; k++) {
      await expect(continuer.or(nonMerci).first()).toBeVisible({ timeout: RESEAU });
      if (!(await nonMerci.isVisible())) break;
      await nonMerci.click();
    }
    await continuer.click();
    expect(await attendreLecture(page, { paywall: "garder" })).toBe("verdict");
    expect(await verdictsEcrits(email)).toBe(1);
    expect((await tachesDe(email)).find((t) => t.genre === "verdict")?.statut).toBe("fini");
    await page.getByRole("link", { name: "Voir mon rapport" }).click();
    await expect(page).toHaveURL(/\/rapport\/verdict/, { timeout: RESEAU });
  });
});
