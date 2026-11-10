import { readFileSync } from "node:fs";
import { CASE_IMPORT } from "../../src/contenu/consentements";
import { ADMIN, compteDe, emailLibre, expect, exportWhatsApp, INVITES, lectureFaite, origine, RESEAU, seConnecter, seConnecterAdmin, sql, test } from "./aide";

/*
 * Le tableau de bord (/admin, le pilotage rangé : le résumé et ses rubriques ; /admin/direct ; le pilotage d’avant à
 * ?version=pilotage, et l’écran d’encore avant à ?version=actuelle) : réservé aux emails de
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
    await expect(page.getByRole("heading", { name: "Résumé" })).toHaveCount(0);
    expect((await page.goto("/admin/direct"))?.status()).toBe(404);
    expect((await page.goto("/admin?vue=outils"))?.status()).toBe(404);
    expect((await page.goto("/admin?version=pilotage"))?.status()).toBe(404);
    expect((await page.goto("/admin?version=actuelle"))?.status()).toBe(404);
    const direct = await page.request.get("/api/admin/direct");
    expect(direct.status()).toBe(404);
    expect(await direct.json()).toEqual({ erreur: "introuvable" });
  });
});

test("connecté avec l’email de l’équipe, /admin ouvre le résumé : ses dates, ses chiffres, « À décider », puis chaque rubrique, la période gardée", async ({ page }) => {
  await seConnecterAdmin(page);
  const rubriques = page.getByRole("navigation", { name: "Rubriques" });
  const periodes = page.getByRole("navigation", { name: "Période" });

  await test.step("le résumé, sur les 7 derniers jours", async () => {
    const reponse = await page.goto("/admin");
    expect(reponse?.status()).toBe(200);
    await expect(page).toHaveTitle("Admin · BLUSH");
    await expect(page.getByRole("heading", { level: 1, name: "Résumé" })).toBeVisible();
    /* Les dates, en toutes lettres : la fenêtre qui glisse, celle d’avant, l’heure du calcul */
    await expect(
      page.getByText(/^Du \S+ \d{1,2}(er)? \S+ à \d{2}:\d{2} jusqu’à maintenant · comparé aux 7 jours d’avant, depuis le \S+ \d{1,2}(er)? \S+ · calculé à \d{2}:\d{2}$/),
    ).toBeVisible();
    for (const titre of ["À décider", "Le payé, jour par jour", "Le tunnel", "Où mettre l’effort"]) {
      await expect(page.getByRole("heading", { level: 2, name: titre, exact: true })).toBeVisible();
    }
    for (const titre of ["Chiffre d’affaires net", "Visiteurs", "Taux d’achat", "Revenu par acheteur", "Marge produit", "Ce qui a changé sur la période"]) {
      await expect(page.getByRole("heading", { level: 3, name: titre, exact: true })).toBeVisible();
    }
    /* « À décider » : une ligne au moins, cinq au plus */
    const lignes = page.getByRole("region", { name: "À décider", exact: true }).getByRole("listitem");
    await expect(lignes.first()).toBeVisible();
    expect(await lignes.count()).toBeLessThanOrEqual(5);
    /* Le graphique du payé se décrit, et ses cases se lisent en tableau */
    await expect(page.getByRole("img", { name: /^Le payé par jour, sur 7\s+jours/ })).toBeAttached();
    await expect(page.getByRole("table", { name: "Le payé par jour" }).getByRole("row")).toHaveCount(8);
    await expect(periodes.getByRole("link", { name: "7 jours" })).toHaveAttribute("aria-current", "page");
    /* Les rubriques : le résumé ici, chacune à son adresse, le direct avec le nombre en ligne */
    await expect(rubriques.getByRole("link", { name: "Résumé" })).toHaveAttribute("aria-current", "page");
    for (const [nom, adresse] of [
      ["Acquisition", "/admin?vue=acquisition"],
      ["Tunnel", "/admin?vue=tunnel"],
      ["Ventes", "/admin?vue=ventes"],
      ["Coûts et marge", "/admin?vue=couts"],
      ["Outils", "/admin?vue=outils"],
      ["Tournage", "/admin/tournage"],
    ] as const)
      await expect(rubriques.getByRole("link", { name: nom, exact: true })).toHaveAttribute("href", adresse);
    await expect(rubriques.getByRole("link", { name: /^Santé/ })).toHaveAttribute("href", "/admin?vue=sante");
    const direct = rubriques.getByRole("link", { name: /^En direct/ });
    await expect(direct).toHaveAttribute("href", "/admin/direct");
    await expect(direct).toContainText(/^En direct\s*\d+\s*en ligne$/);
    await expect(page.getByText("Que des nombres\u00a0: aucune conv, aucun message, aucun email ne sort d’ici.")).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(/NaN|Infinity|undefined/);
  });

  await test.step("chaque rubrique : son titre, ses cartes, ses dates", async () => {
    for (const [vue, titre, cartes] of [
      ["acquisition", "Acquisition", ["D’où ils viennent", "Pages d’arrivée", "Qui importe"]],
      ["tunnel", "Tunnel", ["Le tunnel", "L’import, écran par écran", "Le paywall, jusqu’au paiement", "Le haut du paywall"]],
      ["ventes", "Ventes", ["Ce qui se vend", "La vente dans le chat", "Les mails des séquences"]],
      ["couts", "Coûts et marge", ["Ce que coûte l’IA", "L’IA avant l’achat"]],
      ["sante", "Santé", ["Santé", "Délivrabilité"]],
      ["outils", "Outils", ["Les gestes"]],
    ] as const) {
      const reponse = await page.goto(`/admin?vue=${vue}`);
      expect(reponse?.status(), vue).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: titre, exact: true })).toBeVisible();
      for (const carte of cartes) await expect(page.getByRole("heading", { level: 2, name: carte, exact: true })).toBeVisible();
      await expect(rubriques.getByRole("link", { name: new RegExp(`^${titre}`) })).toHaveAttribute("aria-current", "page");
      await expect(page.getByText(/jusqu’à maintenant · comparé aux 7 jours d’avant/)).toBeVisible();
      await expect(page.getByRole("main")).not.toContainText(/NaN|Infinity|undefined/);
    }
    /* Les outils : les trois gestes de l’équipe */
    for (const geste of ["Donner des bulles", "Débloquer une conv", "Inviter la liste d’attente"]) await expect(page.getByRole("form", { name: geste })).toBeVisible();
  });

  await test.step("ce qui ne suit pas la période le dit, et une mesure finie se replie", async () => {
    await page.goto("/admin?vue=sante");
    await expect(page.getByText("Ne suit pas la période choisie\u00a0: toujours les 7 derniers jours")).toBeVisible();
    await page.goto("/admin?vue=couts");
    const archive = page.getByRole("group").filter({ hasText: "Archivé" });
    await expect(page.getByRole("heading", { level: 2, name: /^Longues vidéos/ })).toBeHidden();
    await archive.locator("summary").click();
    await expect(page.getByRole("heading", { level: 2, name: /^Longues vidéos/ })).toBeVisible();
  });

  await test.step("la période se garde d’une rubrique à l’autre, et la rubrique en changeant de période", async () => {
    await page.goto("/admin?vue=tunnel");
    await periodes.getByRole("link", { name: "30 jours" }).click();
    await expect(page).toHaveURL(/\/admin\?vue=tunnel&p=30$/);
    await expect(page.getByRole("heading", { level: 1, name: "Tunnel" })).toBeVisible();
    await expect(page.getByText(/jusqu’à maintenant · comparé aux 30 jours d’avant/)).toBeVisible();
    await expect(rubriques.getByRole("link", { name: "Ventes", exact: true })).toHaveAttribute("href", "/admin?vue=ventes&p=30");
    await expect(rubriques.getByRole("link", { name: "Résumé" })).toHaveAttribute("href", "/admin?p=30");
    await rubriques.getByRole("link", { name: "Résumé" }).click();
    await expect(page).toHaveURL(/\/admin\?p=30$/);
    await expect(page.getByRole("table", { name: "Le payé par jour" }).getByRole("row")).toHaveCount(31);
  });

  await test.step("des dates choisies au calendrier : des jours entiers, écrits", async () => {
    await page.goto("/admin?vue=ventes");
    await periodes.getByRole("button", { name: "Choisir des dates" }).click();
    const panneau = page.getByRole("dialog", { name: "Choisir une période" });
    await panneau.getByRole("button", { name: "Aujourd’hui", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\?vue=ventes&du=(\d{4}-\d{2}-\d{2})&au=\1$/);
    await expect(page.getByText(/^Le \S+ \d{1,2}(er)? \S+, aujourd’hui en cours · comparé à la veille, /)).toBeVisible();
  });

  await test.step("une rubrique inconnue laisse le résumé", async () => {
    await page.goto("/admin?vue=nimporte");
    await expect(page.getByRole("heading", { level: 1, name: "Résumé" })).toBeVisible();
  });
});

/** Le sous-titre du pilotage : « Mardi 13 octobre, 16:05 · sur 7 jours, vs les 7 jours d’avant », pour une durée (en regex). */
const sousTitre = (duree: string) => new RegExp(`^\\S+ \\d{1,2} \\S+, \\d{2}:\\d{2} · sur ${duree}, vs les ${duree} d’avant$`);

test("le pilotage d’avant reste à ?version=pilotage : ses cartes, leurs « ? », ses périodes, et l’écran d’encore avant", async ({ page }, testInfo) => {
  await seConnecterAdmin(page);

  await test.step("les 7 derniers jours, d’office", async () => {
    const reponse = await page.goto("/admin?version=pilotage");
    expect(reponse?.status()).toBe(200);
    await expect(page).toHaveTitle("Admin · BLUSH");
    await expect(page.getByRole("heading", { level: 1, name: "Pilotage" })).toBeVisible();
    await expect(page.getByText(sousTitre("7\\s+jours"))).toBeVisible();
    for (const titre of [
      "À regarder",
      "Chiffre d’affaires",
      "En direct",
      "Le tunnel",
      "D’où ils viennent",
      "Ce qui se vend",
      "L’IA avant l’achat",
      "Ce que coûte l’IA",
      "Santé",
      "Outils",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name: titre, exact: true })).toBeVisible();
    }
    for (const titre of ["Visiteurs", "Taux d’achat", "Revenu par acheteur", "Marge produit", "Les coups de pouce", "Bêta", "Les derniers gestes"]) {
      await expect(page.getByRole("heading", { level: 3, name: titre, exact: true })).toBeVisible();
    }
    /* « À regarder » : une carte au moins, trois au plus */
    const aRegarder = page.getByRole("region", { name: "À regarder", exact: true }).getByRole("article");
    await expect(aRegarder.first()).toBeVisible();
    expect(await aRegarder.count()).toBeLessThanOrEqual(3);
    /* Le graphique du chiffre d’affaires se décrit, et ses cases se lisent en tableau */
    await expect(page.getByRole("img", { name: /^Le payé par jour, sur 7\s+jours/ })).toBeAttached();
    await expect(page.getByRole("table", { name: "Le payé par jour" }).getByRole("row")).toHaveCount(8);
    /* Les quatre coups de pouce (③ porte aussi le nom de sa carte du chat, dans « La vente dans le chat »), les trois gestes de l’équipe */
    const coups = page.getByRole("list", { name: "Les coups de pouce" });
    for (const offre of [
      "Le rapport à 6,90\u00a0€, offre unique de 5 minutes",
      "Le mail «\u00a0Ton rapport t’attend\u00a0»",
      "Premium pour 6,90\u00a0€ de plus (80 bulles pour 5\u00a0€ avant le 23 octobre)",
      "+40 bulles, première recharge (arrêtée le 23 octobre)",
    ])
      await expect(coups.getByText(offre, { exact: true })).toBeVisible();
    for (const geste of ["Donner des bulles", "Débloquer une conv", "Inviter la liste d’attente"]) await expect(page.getByRole("form", { name: geste })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Période" }).getByRole("link", { name: "7 jours" })).toHaveAttribute("aria-current", "page");
    /* Les rubriques : le pilotage ici, le direct (avec le nombre en ligne), les outils plus bas */
    const rubriques = page.getByRole("navigation", { name: "Rubriques" });
    await expect(rubriques.getByRole("link", { name: "Pilotage" })).toHaveAttribute("aria-current", "page");
    const direct = rubriques.getByRole("link", { name: /^En direct/ });
    await expect(direct).toHaveAttribute("href", "/admin/direct");
    await expect(direct).toContainText(/^En direct\s*\d+\s*en ligne$/);
    await expect(rubriques.getByRole("link", { name: "Outils" })).toHaveAttribute("href", "#outils");
    /* La délivrabilité des mails : sans RESEND_WEBHOOK_SECRET (le serveur des tests), le bloc dit que le webhook n’est pas branché */
    await expect(page.getByRole("region", { name: "Délivrabilité", exact: true })).toContainText("Le webhook de Resend n’est pas branché");
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
      "la marge produit",
      "le tunnel",
      "qui importe",
      "les sources",
      "ce qui se vend",
      "les coups de pouce",
      "l’IA avant l’achat",
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
    /*
     * Le panneau arrive de la droite sans faire défiler le dialogue : le focus va à « Fermer », encore hors de l’écran, et
     * Safari le faisait défiler pour le montrer. Tout le panneau glissait alors décalé à gauche, sur la bande du voile.
     */
    expect(await panneau.evaluate((d) => d.scrollLeft)).toBe(0);
    /* Le voile : la bande laissée à gauche du panneau, qui répond dès l’ouverture (le panneau glisse encore) */
    await page.mouse.click(4, 300);
    await expect(panneau).toBeHidden();
    await expect(bouton).toBeFocused();
  });

  await test.step("« 30 jours » change la période", async () => {
    const periodes = page.getByRole("navigation", { name: "Période" });
    await periodes.getByRole("link", { name: "30 jours" }).click();
    await expect(page).toHaveURL(/\/admin\?version=pilotage&p=30$/);
    await expect(periodes.getByRole("link", { name: "30 jours" })).toHaveAttribute("aria-current", "page");
    await expect(periodes.getByRole("link", { name: "7 jours" })).not.toHaveAttribute("aria-current", "page");
    await expect(page.getByText(sousTitre("30\\s+jours"))).toBeVisible();
    await expect(page.getByRole("table", { name: "Le payé par jour" }).getByRole("row")).toHaveCount(31);
  });

  await test.step("« 24 h » aussi : des heures", async () => {
    const periodes = page.getByRole("navigation", { name: "Période" });
    await periodes.getByRole("link", { name: "24 h" }).click();
    await expect(page).toHaveURL(/\/admin\?version=pilotage&p=1$/);
    await expect(periodes.getByRole("link", { name: "24 h" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(sousTitre("24\\s+h"))).toBeVisible();
    await expect(page.getByRole("table", { name: "Le payé par heure" }).getByRole("row")).toHaveCount(25);
  });

  await test.step("des dates choisies au calendrier : hier et aujourd’hui, deux jours de Paris", async () => {
    const periodes = page.getByRole("navigation", { name: "Période" });
    await periodes.getByRole("button", { name: "Choisir des dates" }).click();
    const panneau = page.getByRole("dialog", { name: "Choisir une période" });
    /* Le calendrier d’un grand écran (deux mois) ou d’un téléphone (un seul) : celui qui se voit */
    const aujourdhui = panneau.locator('[data-jour][aria-label$=", aujourd’hui"]:visible');
    const jour = (await aujourdhui.getAttribute("data-jour"))!;
    const d = (n: number) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
    /* Demain n’a pas de chiffres : s’il est dans le mois affiché, il ne se choisit pas */
    const demain = panneau.locator(`[data-jour="${d(1)}"]:visible`);
    if (await demain.count()) await expect(demain).toBeDisabled();
    await aujourdhui.click();
    /* Un seul bout posé : rien à appliquer encore */
    await expect(panneau.getByRole("button", { name: "Appliquer" })).toBeDisabled();
    /* La veille, dans le mois d’avant le premier du mois (un téléphone n’en montre qu’un) */
    const hier = panneau.locator(`[data-jour="${d(-1)}"]:visible`);
    if (!(await hier.count())) await panneau.getByRole("button", { name: "Mois précédent" }).click();
    await hier.click();
    await panneau.getByRole("button", { name: "Appliquer" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin\\?version=pilotage&du=${d(-1)}&au=${jour}$`));
    await expect(panneau).toBeHidden();
    /* Plus aucune des trois périodes d’office n’est celle de la page ; le graphique a ses deux jours */
    await expect(periodes.locator('a[aria-current="page"]')).toHaveCount(0);
    await expect(periodes.getByRole("button", { name: /^Changer les dates/ })).toBeVisible();
    await expect(page.getByText(/vs les 2\s+jours d’avant/).first()).toBeVisible();
    await expect(page.getByRole("table", { name: "Le payé par jour" }).getByRole("row")).toHaveCount(3);
    /* Une période mal écrite laisse les 7 jours */
    await page.goto("/admin?version=pilotage&du=2026-02-30&au=hier");
    await expect(periodes.getByRole("link", { name: "7 jours" })).toHaveAttribute("aria-current", "page");
  });

  await test.step("l’import appli par appli : des jalons notés sous Hinge se lisent sous « Choisissent leur fichier »", async () => {
    for (const jalon of ["appli", "fichier"]) {
      const r = await page.request.post("/api/jalon", { headers: origine(testInfo), data: { jalon, appli: "hinge" } });
      expect(await r.json()).toEqual({ ok: true });
    }
    await page.reload();
    const applis = page.getByRole("list", { name: "De l’appli au fichier, appli par appli" });
    await expect(applis.getByRole("listitem").filter({ hasText: /^Hinge/ })).toHaveText(/^Hinge\s*\d+ → \d+\s*(—|\d+\s%)$/);
  });

  await test.step("l’IA avant l’achat : un export importé se compte sous « Export », sans IA avant l’achat", async () => {
    const conv = exportWhatsApp(testInfo);
    const envoi = await page.request.post("/api/import", {
      headers: origine(testInfo),
      multipart: { fichier: { name: conv.nom, mimeType: "application/zip", buffer: readFileSync(conv.chemin) }, consentement: CASE_IMPORT.version },
      timeout: RESEAU,
    });
    expect(envoi.status()).toBe(200);
    await page.goto("/admin?version=pilotage&p=1");
    const bloc = page.getByRole("region", { name: "L’IA avant l’achat", exact: true });
    /* Ses imports, puis l’IA par import : rien (le modèle factice ne coûte rien, et rien n’est lu avant l’achat d’un export) */
    const cellules = bloc
      .getByRole("row")
      .filter({ has: page.getByRole("rowheader", { name: /^Export/ }) })
      .getByRole("cell");
    await expect(cellules.first()).toHaveText(/^[1-9]\d*$/);
    await expect(cellules.nth(1)).toHaveText("0,00\u00a0$");
    await expect(bloc).not.toContainText(/NaN|Infinity|undefined/);
  });

  await test.step("ce que coûte l’IA : le produit et les tests à part, chaque population, et la marge produit qui dit les tests et le non classé", async () => {
    /* Le modèle factice ne note rien : des appels déjà rangés par la règle « qui est qui », sous une étiquette à ce test (l’autre navigateur a la sienne) */
    const tache = `e2e-population-${testInfo.project.name}-${Date.now()}`;
    await sql()`insert into ai_usage (task, model, cost_micros, population) values (${tache}, 'test', 5000000, 'equipe'), (${tache}, 'test', 3000000, 'client'), (${tache}, 'test', 1000000, 'inconnu')`;
    try {
      await page.goto("/admin?version=pilotage&p=1");
      const bloc = page.getByRole("region", { name: "Ce que coûte l’IA", exact: true });
      for (const nom of ["IA du produit", "IA des tests", "Les clients et les prospects", "L’équipe et le tournage"])
        await expect(bloc.getByText(nom, { exact: true })).toBeVisible();
      const populations = bloc.getByRole("list", { name: "L’IA par population" }).getByRole("listitem");
      await expect(populations).toHaveCount(6);
      for (const [k, nom] of ["Clients", "Prospects", "Invités (offert)", "L’équipe", "Le tournage", "Non classé"].entries()) await expect(populations.nth(k)).toContainText(nom);
      /* Nos 5 $ de l’équipe et 3 $ d’un client au moins (l’autre navigateur peut avoir ajouté les siens) */
      await expect(populations.filter({ hasText: /^L’équipe/ })).toHaveText(/^L’équipe\s*([5-9]|\d{2,}),\d{2}\s\$\s*\d+\s%$/);
      await expect(populations.filter({ hasText: /^Clients/ })).toHaveText(/^Clients\s*([3-9]|\d{2,}),\d{2}\s\$\s*\d+\s%$/);
      await expect(bloc.getByRole("heading", { level: 3, name: "Les postes du produit" })).toBeVisible();
      await expect(bloc.getByRole("list", { name: "Les ratios du produit" }).getByRole("listitem")).toHaveCount(3);
      /* Les tests à part, puis le non classé (notre 1 $ au moins) et la marge au pire s’il y a des ventes ; sous 3 ventes, où la lire à la place de la cible */
      await expect(
        page.getByText(
          /^(cible 80\s%|(une seule vente|\d+\sventes) · lis-la sur 7\sjours) · tests\s: ([5-9]|\d{2,}),\d{2}\s\$ à part · non classé\s: ([1-9]|\d{2,}),\d{2}\s\$( \(au pire -?\d+\s%\))?$/,
        ),
      ).toBeVisible();
      await expect(bloc).not.toContainText(/NaN|Infinity|undefined/);
    } finally {
      await sql()`delete from ai_usage where task = ${tache}`;
    }
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
    await expect(page.getByRole("navigation", { name: "Rubriques" }).getByRole("link", { name: "Outils" })).toHaveAttribute("href", "/admin?vue=outils");
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
  await admin.goto("/admin?vue=outils");

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
