import { compteDe, emailLibre, expect, INVITES, lectureFaite, seConnecter, seConnecterAdmin, test } from "./aide";

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

test("connecté avec l’email de l’équipe, le tableau de bord s’ouvre : ses blocs (l’argent compris), ses trois périodes", async ({ page }) => {
  await seConnecterAdmin(page);

  await test.step("les 7 derniers jours, d’office", async () => {
    const reponse = await page.goto("/admin");
    expect(reponse?.status()).toBe(200);
    await expect(page).toHaveTitle("Admin · BLUSH");
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
    /* Ce serveur est en bêta ouverte */
    await expect(page.getByText(/^Mis à jour à \d{2}:\d{2} · ouvert à tous · que des nombres, aucune conv$/)).toBeVisible();
    for (const titre of [
      "Ventes",
      "Bulles",
      "L’entonnoir des achats",
      "Les offres uniques",
      "Le parcours d’une conv",
      "Jour par jour",
      "Le partage",
      "Coûts de l’IA",
      "Santé",
      "Bêta",
      "Les derniers gestes",
      "Gestes de l’équipe",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name: titre, exact: true })).toBeVisible();
    }
    /* Les ventes en euros TTC, aujourd’hui et sur 7 jours ; les quatre offres uniques ; les trois gestes */
    const ventes = page.getByRole("table", { name: "Les ventes, en euros TTC" });
    await expect(ventes.getByRole("columnheader")).toHaveText(["Aujourd’hui", "7 jours"]);
    await expect(ventes.getByRole("rowheader")).toHaveText(["Payé", "Remboursé", "Contesté", "Reste"]);
    for (const offre of ["La suite à 6,90\u00a0€, 5 minutes", "Le mail «\u00a0Ta suite t’attend\u00a0»", "Premium pour 5\u00a0€ de plus", "+40 bulles, première recharge"])
      await expect(page.getByText(offre, { exact: true })).toBeVisible();
    for (const geste of ["Donner des bulles", "Débloquer une conv", "Inviter la liste d’attente"]) await expect(page.getByRole("form", { name: geste })).toBeVisible();
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

test("les gestes de l’équipe : des bulles à un compte, puis le rapport de sa dernière conv offert ; notés dans « Les derniers gestes »", async ({
  page,
  autreAppareil,
}, testInfo) => {
  const email = emailLibre(testInfo, "recoit");
  await lectureFaite(page, testInfo, email);
  expect(await compteDe(email)).toMatchObject({ bulles: 0, debloquees: 0 });
  const admin = await autreAppareil();
  await seConnecterAdmin(admin);
  await admin.goto("/admin");

  await test.step("un email sans compte : rien ne change, et l’écran le dit", async () => {
    const bulles = admin.getByRole("form", { name: "Donner des bulles" });
    await bulles.getByLabel("Email du compte").fill(emailLibre(testInfo, "jamais-connecte"));
    await bulles.getByRole("button", { name: "Donner" }).click();
    await expect(bulles.getByRole("status")).toHaveText("Aucun compte pour cet email (la personne doit s’être connectée une fois).");
  });

  await test.step("« Donner des bulles », au clavier : 25 bulles, le solde dit", async () => {
    const bulles = admin.getByRole("form", { name: "Donner des bulles" });
    await bulles.getByLabel("Email du compte").fill(email);
    await bulles.getByLabel("Bulles (1 à 1 000)").fill("25");
    await bulles.getByLabel("Bulles (1 à 1 000)").press("Enter");
    await expect(bulles.getByRole("status")).toHaveText("C’est fait. Son solde\u00a0: 25 bulles.");
    expect(await compteDe(email)).toMatchObject({ bulles: 25, debloquees: 0 });
  });

  await test.step("« Débloquer une conv » : sa dernière conv, le rapport offert", async () => {
    const debloquer = admin.getByRole("form", { name: "Débloquer une conv" });
    await debloquer.getByLabel("Email du compte").fill(email);
    await expect(debloquer.getByLabel("Quelle conv")).toHaveValue("derniere");
    await debloquer.getByRole("button", { name: "Débloquer" }).click();
    await expect(debloquer.getByRole("status")).toHaveText("C’est fait\u00a0: 1 conv débloquée. Le rapport s’écrit à sa prochaine ouverture.");
    expect(await compteDe(email)).toMatchObject({ bulles: 25, debloquees: 1 });
    /* Rien de plus à débloquer : il le dit */
    await debloquer.getByRole("button", { name: "Débloquer" }).click();
    await expect(debloquer.getByRole("status")).toHaveText("Rien à débloquer\u00a0: pas de conv, ou déjà ouverte.");
  });

  await test.step("le tableau de bord se relit : les deux gestes en tête des derniers, sans dire pour qui", async () => {
    const journal = admin.getByRole("list", { name: "Les derniers gestes" });
    await expect(journal.getByText("1 conv débloquée", { exact: true })).toBeVisible();
    await expect(journal.getByText("+25 bulles données", { exact: true })).toBeVisible();
    await expect(journal).not.toContainText(email);
    await expect(admin.getByText(email)).toHaveCount(0);
  });
});
