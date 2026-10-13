import { ADMIN, compteDe, emailLibre, expect, INVITES, lectureFaite, seConnecter, seConnecterAdmin, sql, test } from "./aide";

/*
 * Le tableau de bord (/admin, le pilotage ; /admin/direct ; l’écran d’avant à ?version=actuelle) : réservé aux emails de
 * BLUSH_ADMINS. Pour tous les autres, il n’existe pas (une 404, pas un 403 : rien ne dit qu’il y a quelque chose à cette
 * adresse). Ses chiffres dépendent de toute la base (d’autres tests tournent en même temps) : on vérifie ses cartes et ce
 * qu’elles font, pas leurs valeurs.
 */

test("/admin n’existe pas pour qui n’est pas de l’équipe : ni sans compte, ni avec un compte ordinaire, ni son direct", async ({ page }, testInfo) => {
  await test.step("sans compte : la page introuvable, le direct aussi", async () => {
    const reponse = await page.goto("/admin");
    expect(reponse?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Cette page n’existe pas." })).toBeVisible();
    expect((await page.goto("/admin/direct"))?.status()).toBe(404);
    expect((await page.request.get("/api/admin/direct")).status()).not.toBe(200);
  });

  await test.step("connecté avec un email ordinaire : la page introuvable aussi, et la route du direct n’existe pas", async () => {
    await seConnecter(page, emailLibre(testInfo, "pas-admin"));
    const reponse = await page.goto("/admin");
    expect(reponse?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Cette page n’existe pas." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pilotage" })).toHaveCount(0);
    expect((await page.goto("/admin/direct"))?.status()).toBe(404);
    expect((await page.goto("/admin?version=actuelle"))?.status()).toBe(404);
    const direct = await page.request.get("/api/admin/direct");
    expect(direct.status()).toBe(404);
    expect(await direct.json()).toEqual({ erreur: "introuvable" });
  });
});

/** Le sous-titre du pilotage : « Mardi 13 octobre, 16:05 · sur 7 jours, vs les 7 jours d’avant », pour une durée (en regex). */
const sousTitre = (duree: string) => new RegExp(`^\\S+ \\d{1,2} \\S+, \\d{2}:\\d{2} · sur ${duree}, vs les ${duree} d’avant$`);

test("connecté avec l’email de l’équipe, le pilotage s’ouvre : ses cartes, leurs « ? », ses trois périodes, et l’écran d’avant", async ({ page }) => {
  await seConnecterAdmin(page);

  await test.step("les 7 derniers jours, d’office", async () => {
    const reponse = await page.goto("/admin");
    expect(reponse?.status()).toBe(200);
    await expect(page).toHaveTitle("Admin · BLUSH");
    await expect(page.getByRole("heading", { level: 1, name: "Pilotage" })).toBeVisible();
    await expect(page.getByText(sousTitre("7\\s+jours"))).toBeVisible();
    for (const titre of ["À regarder", "Chiffre d’affaires", "En direct", "Le tunnel", "D’où ils viennent", "Ce qui se vend", "Ce que coûte l’IA", "Santé", "Outils"]) {
      await expect(page.getByRole("heading", { level: 2, name: titre, exact: true })).toBeVisible();
    }
    for (const titre of ["Visiteurs", "Taux d’achat", "Revenu par acheteur", "Marge après IA", "Les coups de pouce", "Bêta", "Les derniers gestes"]) {
      await expect(page.getByRole("heading", { level: 3, name: titre, exact: true })).toBeVisible();
    }
    /* « À regarder » : une carte au moins, trois au plus */
    const aRegarder = page.getByRole("region", { name: "À regarder", exact: true }).getByRole("article");
    await expect(aRegarder.first()).toBeVisible();
    expect(await aRegarder.count()).toBeLessThanOrEqual(3);
    /* Le graphique du chiffre d’affaires se décrit, et ses cases se lisent en tableau */
    await expect(page.getByRole("img", { name: /^Le payé par jour, sur 7\s+jours/ })).toBeAttached();
    await expect(page.getByRole("table", { name: "Le payé par jour" }).getByRole("row")).toHaveCount(8);
    /* Les quatre coups de pouce, les trois gestes de l’équipe */
    for (const offre of ["La suite à 6,90\u00a0€, 5 minutes", "Le mail «\u00a0Ta suite t’attend\u00a0»", "Premium pour 5\u00a0€ de plus", "+40 bulles, première recharge"])
      await expect(page.getByText(offre, { exact: true })).toBeVisible();
    for (const geste of ["Donner des bulles", "Débloquer une conv", "Inviter la liste d’attente"]) await expect(page.getByRole("form", { name: geste })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Période" }).getByRole("link", { name: "7 jours" })).toHaveAttribute("aria-current", "page");
    /* Les rubriques : le pilotage ici, le direct (avec le nombre en ligne), les outils plus bas */
    const rubriques = page.getByRole("navigation", { name: "Rubriques" });
    await expect(rubriques.getByRole("link", { name: "Pilotage" })).toHaveAttribute("aria-current", "page");
    const direct = rubriques.getByRole("link", { name: /^En direct/ });
    await expect(direct).toHaveAttribute("href", "/admin/direct");
    await expect(direct).toContainText(/^En direct\s*\d+\s*en ligne$/);
    await expect(rubriques.getByRole("link", { name: "Outils" })).toHaveAttribute("href", "#outils");
    /* Les invités de BLUSH_ACCES_LIBRE : ceux des tests */
    await expect(page.getByText(new RegExp(`^Invités\\s*BLUSH_ACCES_LIBRE\\s*${INVITES.length}$`))).toBeVisible();
    await expect(page.getByText("Que des nombres\u00a0: aucune conv, aucun message, aucun email ne sort d’ici.")).toBeVisible();
    /* Jamais un nombre illisible */
    await expect(page.getByRole("main")).not.toContainText(/NaN|Infinity|undefined/);
  });

  await test.step("un « ? » sur chaque carte et chaque chiffre clé", async () => {
    for (const de of [
      "le chiffre d’affaires",
      "le direct",
      "les visiteurs",
      "le taux d’achat",
      "le revenu par acheteur",
      "la marge après IA",
      "le tunnel",
      "les sources",
      "ce qui se vend",
      "les coups de pouce",
      "les coûts de l’IA",
      "la santé",
    ])
      await expect(page.getByRole("button", { name: `Comment lire ${de}`, exact: true })).toBeVisible();
  });

  await test.step("le « ? » du tunnel : le panneau, son focus, Échap le ferme et rend le focus", async () => {
    const bouton = page.getByRole("button", { name: "Comment lire le tunnel", exact: true });
    await bouton.click();
    const panneau = page.getByRole("dialog", { name: "Le tunnel" });
    await expect(panneau).toBeVisible();
    for (const bloc of ["C’est quoi", "Le calcul", "Le bon repère", "Si ça bouge"]) await expect(panneau.getByRole("heading", { level: 3, name: bloc })).toBeVisible();
    await expect(panneau.getByText("La colonne orange est la plus grosse fuite", { exact: false })).toBeVisible();
    /* Le focus est dans le panneau ; le reste de la page ne se touche plus */
    expect(await panneau.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(panneau).toBeHidden();
    await expect(bouton).toBeFocused();
  });

  await test.step("le « ? » de la santé : « Fermer », puis le voile, le ferment aussi", async () => {
    const bouton = page.getByRole("button", { name: "Comment lire la santé", exact: true });
    await bouton.click();
    const panneau = page.getByRole("dialog", { name: "Santé" });
    await panneau.getByRole("button", { name: "Fermer" }).click();
    await expect(panneau).toBeHidden();
    await expect(bouton).toBeFocused();
    await bouton.click();
    await expect(panneau).toBeVisible();
    /* Le voile : la bande laissée à gauche du panneau */
    await page.mouse.click(4, 300);
    await expect(panneau).toBeHidden();
    await expect(bouton).toBeFocused();
  });

  await test.step("« 30 jours » change la période", async () => {
    const periodes = page.getByRole("navigation", { name: "Période" });
    await periodes.getByRole("link", { name: "30 jours" }).click();
    await expect(page).toHaveURL(/\/admin\?p=30$/);
    await expect(periodes.getByRole("link", { name: "30 jours" })).toHaveAttribute("aria-current", "page");
    await expect(periodes.getByRole("link", { name: "7 jours" })).not.toHaveAttribute("aria-current", "page");
    await expect(page.getByText(sousTitre("30\\s+jours"))).toBeVisible();
    await expect(page.getByRole("table", { name: "Le payé par jour" }).getByRole("row")).toHaveCount(31);
  });

  await test.step("« 24 h » aussi : des heures", async () => {
    const periodes = page.getByRole("navigation", { name: "Période" });
    await periodes.getByRole("link", { name: "24 h" }).click();
    await expect(page).toHaveURL(/\/admin\?p=1$/);
    await expect(periodes.getByRole("link", { name: "24 h" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(sousTitre("24\\s+h"))).toBeVisible();
    await expect(page.getByRole("table", { name: "Le payé par heure" }).getByRole("row")).toHaveCount(25);
  });

  await test.step("l’écran d’avant reste à ?version=actuelle, tel quel", async () => {
    const reponse = await page.goto("/admin?version=actuelle");
    expect(reponse?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
    /* Ce serveur est en bêta ouverte */
    await expect(page.getByText(/^Mis à jour à \d{2}:\d{2} · ouvert à tous · que des nombres, aucune conv$/)).toBeVisible();
    for (const titre of ["Ventes", "Bulles", "L’entonnoir des achats", "Les offres uniques", "Le parcours d’une conv", "Jour par jour", "Gestes de l’équipe"]) {
      await expect(page.getByRole("heading", { level: 2, name: titre, exact: true })).toBeVisible();
    }
    const ventes = page.getByRole("table", { name: "Les ventes, en euros TTC" });
    await expect(ventes.getByRole("columnheader")).toHaveText(["Aujourd’hui", "7 jours"]);
    await expect(ventes.getByRole("rowheader")).toHaveText(["Payé", "Remboursé", "Contesté", "Reste"]);
    await expect(page.getByText(/^Les 14\s+derniers jours, heure de Paris$/)).toBeVisible();
  });
});

test("le direct de l’équipe : qui est là, où, d’où, et le fil ; il se relit seul", async ({ page }) => {
  await seConnecterAdmin(page);
  await page.goto("/admin");

  await test.step("l’onglet « En direct » y mène", async () => {
    await page
      .getByRole("navigation", { name: "Rubriques" })
      .getByRole("link", { name: /^En direct/ })
      .click();
    await expect(page).toHaveURL(/\/admin\/direct$/);
    await expect(page).toHaveTitle("En direct · Admin · BLUSH");
    await expect(page.getByRole("heading", { level: 1, name: "En ligne maintenant" })).toBeVisible();
    for (const titre of ["Où ils sont", "Où ils en sont", "D’où ils arrivent", "Ce qui se passe"]) {
      await expect(page.getByRole("heading", { level: 2, name: titre, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("img", { name: /^Personnes en ligne minute par minute|^Pas encore de minutes comptées$/ })).toBeAttached();
    /* Le nom accessible a ses espaces normalisés (l’insécable devient une espace) */
    await expect(page.getByRole("img", { name: /^Carte des personnes en ligne\s: / })).toBeAttached();
    await expect(page.getByRole("navigation", { name: "Rubriques" }).getByRole("link", { name: /^En direct/ })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "Rubriques" }).getByRole("link", { name: "Outils" })).toHaveAttribute("href", "/admin#outils");
    await expect(page.getByRole("main")).not.toContainText(/NaN|Infinity|undefined/);
  });

  await test.step("le fil se filtre", async () => {
    const filtres = page.getByRole("group", { name: "Filtrer le fil" });
    await expect(filtres.getByRole("button")).toHaveText(["Tout", "Achats", "Imports", "Arrivées"]);
    await expect(filtres.getByRole("button", { name: "Tout" })).toHaveAttribute("aria-pressed", "true");
    await filtres.getByRole("button", { name: "Achats" }).click();
    await expect(filtres.getByRole("button", { name: "Achats" })).toHaveAttribute("aria-pressed", "true");
    await expect(filtres.getByRole("button", { name: "Tout" })).toHaveAttribute("aria-pressed", "false");
  });

  await test.step("toutes les 5 secondes, il relit GET /api/admin/direct", async () => {
    const relu = await page.waitForResponse((r) => r.url().endsWith("/api/admin/direct") && r.request().method() === "GET", { timeout: 15_000 });
    expect(relu.status()).toBe(200);
    expect(await relu.json()).toMatchObject({ enLigne: expect.any(Number), etapes: expect.any(Array), fil: expect.any(Array) });
    await expect(page.getByText(/^Mis à jour (à l’instant|il y a \d+\s+s) · toutes les 5\s+s$/)).toBeVisible();
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
    /* Un autre test peut faire les mêmes gestes en même temps (un autre navigateur) : au moins les nôtres */
    const journal = admin.getByRole("list", { name: "Les derniers gestes", exact: true });
    await expect(journal.getByText("1 conv débloquée", { exact: true }).first()).toBeVisible();
    await expect(journal.getByText("+25 bulles données", { exact: true }).first()).toBeVisible();
    /* Au journal de l’équipe, en base : qui (le compte de l’équipe), pour qui, combien */
    const notees = await sql()<{ action: string; nombre: number; parEquipe: boolean }[]>`
      select a.action, a.nombre, p.email = ${ADMIN} as "parEquipe" from actions_equipe a join users u on u.id = a.compte_id left join users p on p.id = a.par_id
      where u.email = ${email} order by a.id`;
    expect(notees).toEqual([
      { action: "bulles", nombre: 25, parEquipe: true },
      { action: "debloquer", nombre: 1, parEquipe: true },
    ]);
    await expect(journal).not.toContainText(email);
    await expect(admin.getByText(email)).toHaveCount(0);
  });
});
