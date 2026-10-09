import { emailLibre, expect, INVITES, seConnecter, seConnecterAdmin, test } from "./aide";

/*
 * Le tableau de bord (/admin) : réservé aux emails de BLUSH_ADMINS. Pour tous les autres, il n’existe pas (une 404,
 * pas un 403 : rien ne dit qu’il y a quelque chose à cette adresse).
 */

test("/admin n’existe pas pour qui n’est pas de l’équipe : ni sans compte, ni avec un compte ordinaire", async ({ page }, testInfo) => {
  await test.step("sans compte : la page introuvable", async () => {
    const reponse = await page.goto("/admin");
    expect(reponse?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Cette page n’existe pas." })).toBeVisible();
  });

  await test.step("connecté avec un email ordinaire : la page introuvable aussi", async () => {
    await seConnecter(page, emailLibre(testInfo, "pas-admin"));
    const reponse = await page.goto("/admin");
    expect(reponse?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Cette page n’existe pas." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toHaveCount(0);
  });
});

test("connecté avec l’email de l’équipe, le tableau de bord s’ouvre : ses six blocs, ses trois périodes", async ({ page }) => {
  await seConnecterAdmin(page);

  await test.step("les 7 derniers jours, d’office", async () => {
    const reponse = await page.goto("/admin");
    expect(reponse?.status()).toBe(200);
    await expect(page).toHaveTitle("Admin · BLUSH");
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
    /* Ce serveur est en bêta ouverte */
    await expect(page.getByText(/^Mis à jour à \d{2}:\d{2} · ouvert à tous · que des nombres, aucune conv$/)).toBeVisible();
    for (const titre of ["Le parcours d’une conv", "Jour par jour", "Le partage", "Coûts de l’IA", "Santé", "Bêta"]) {
      await expect(page.getByRole("heading", { level: 2, name: titre, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("navigation", { name: "Période" }).getByRole("link", { name: "7 jours" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(/^Les 14\s+derniers jours, heure de Paris$/)).toBeVisible();
    /* Les invités de BLUSH_ACCES_LIBRE : ceux des tests */
    await expect(page.getByText(new RegExp(`^Invités\\s*BLUSH_ACCES_LIBRE\\s*${INVITES.length}$`))).toBeVisible();
  });

  await test.step("« 30 jours » change la période", async () => {
    const periodes = page.getByRole("navigation", { name: "Période" });
    await periodes.getByRole("link", { name: "30 jours" }).click();
    await expect(page).toHaveURL(/\/admin\?p=30$/);
    await expect(periodes.getByRole("link", { name: "30 jours" })).toHaveAttribute("aria-current", "page");
    await expect(periodes.getByRole("link", { name: "7 jours" })).not.toHaveAttribute("aria-current", "page");
    await expect(page.getByText(/^Les 30\s+derniers jours, heure de Paris$/)).toBeVisible();
  });

  await test.step("« 24 h » aussi", async () => {
    const periodes = page.getByRole("navigation", { name: "Période" });
    await periodes.getByRole("link", { name: "24 h" }).click();
    await expect(page).toHaveURL(/\/admin\?p=1$/);
    await expect(periodes.getByRole("link", { name: "24 h" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(/^Les 14\s+derniers jours, heure de Paris$/)).toBeVisible();
  });
});
