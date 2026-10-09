import { attendreTaches, compteDe, connecterParApi, definirPlan, expect, lireUneConvParApi, nouvelInvite, ouvrirLeRapport, PAIEMENT, tachesDe, test } from "./aide";

/*
 * Débloquer, en bêta (sans paiement) : seuls les emails de BLUSH_ACCES_LIBRE le peuvent. Un invité dont le compte est
 * encore gratuit (ajouté à la liste après coup, sa session déjà ouverte : src/server/auth.ts) débloque depuis son rapport,
 * passe par « Bienvenue dans BLUSH+. », puis retrouve la suite qui s’écrit.
 */

test("un invité encore gratuit débloque : « Bienvenue dans BLUSH+. », puis la suite de son rapport", async ({ page }, testInfo) => {
  const email = await nouvelInvite(testInfo);
  await connecterParApi(page, testInfo, email);
  await definirPlan(email, "gratuit");
  await lireUneConvParApi(page, testInfo);
  await attendreTaches(email);
  const rapport = await ouvrirLeRapport(page);

  await test.step("le rapport est celui d’un compte gratuit : le verdict seul", async () => {
    await expect(rapport.getByText("Aperçu gratuit", { exact: true })).toBeVisible();
    expect((await tachesDe(email)).map((t) => [t.genre, t.statut])).toEqual([["verdict", "fini"]]);
  });

  await test.step("« Lire la suite », BLUSH+ (choisi d’office), « Débloquer » : le moment « C’est débloqué »", async () => {
    await rapport.getByRole("button", { name: "Lire la suite" }).click();
    const paiement = page.getByRole("dialog", { name: PAIEMENT });
    await expect(paiement.getByRole("radio", { name: /^BLUSH\+ · / })).toBeChecked();
    await paiement.getByRole("button", { name: "Débloquer" }).click();
    await expect(page).toHaveURL(/\/rapport\/debloque\?offre=blushplus$/);
  });

  await test.step("« Bienvenue dans BLUSH+. » dit ce qui vient de s’ouvrir, et son prix", async () => {
    const ecran = page.getByRole("main");
    await expect(ecran.getByRole("heading", { level: 1, name: "Bienvenue dans BLUSH+." })).toBeVisible();
    await expect(ecran.getByText("Ton rapport complet, et BLUSH à tes côtés à chaque message.")).toBeVisible();
    await expect(ecran.getByText("Le rapport complet", { exact: true })).toBeVisible();
    await expect(ecran.getByText("Les 7 chapitres qui restent")).toBeVisible();
    await expect(ecran.getByText("Le chat avec BLUSH", { exact: true })).toBeVisible();
    await expect(ecran.getByText("Envoie sa réponse : BLUSH t’aide à répondre")).toBeVisible();
    await expect(ecran.getByText("Sa fiche", { exact: true })).toBeVisible();
    await expect(ecran.getByText("Ce qu’elle t’a dit, toujours sous la main")).toBeVisible();
    await expect(ecran.getByText("7,99 € / semaine · Sans engagement")).toBeVisible();
    expect(await compteDe(email)).toMatchObject({ plan: "blushplus" });
  });

  await test.step("« Lire la suite » ramène au rapport, complet : les huit chapitres arrivent", async () => {
    await page.getByRole("link", { name: "Lire la suite" }).click();
    await expect(page).toHaveURL(/\/rapport#chapitre-2$/);
    await expect(rapport.getByText("Complet", { exact: true })).toBeVisible();
    await attendreTaches(email);
    await expect(rapport.getByRole("region", { name: "Chapitre 2 : Chapitre 2" })).toBeVisible();
    await expect(rapport.getByRole("region", { name: /^Chapitre \d : / })).toHaveCount(8);
    expect((await tachesDe(email)).every((t) => t.statut === "fini")).toBe(true);
  });
});
