import { attendreEnHaut, CHAPITRES_FERMES, emailLibre, expect, lectureFaite, ouvrirLeRapport, PAIEMENT, surOrdinateur, test } from "./aide";

/*
 * Le sommaire du rapport gratuit : une colonne à gauche sur ordinateur, une feuille sur téléphone (le bouton en haut à
 * droite). Le chapitre 1 s’y ouvre, les sept chapitres fermés y mènent au paiement.
 */

test("sommaire sur ordinateur : il suit la lecture, et les chapitres fermés ouvrent le paiement", async ({ page }, testInfo) => {
  test.skip(!surOrdinateur(page), "sur téléphone, le sommaire est une feuille (test suivant)");
  await lectureFaite(page, testInfo, emailLibre(testInfo, "sommaire-ordi"));
  const rapport = await ouvrirLeRapport(page);
  const sommaire = page.getByRole("navigation", { name: "Sommaire" });

  await test.step("le sommaire est à côté du rapport : le chapitre 1 ouvert, les sept autres fermés", async () => {
    await expect(sommaire).toBeVisible();
    await expect(sommaire.getByRole("progressbar", { name: "Progression de la lecture" })).toBeVisible();
    await expect(sommaire.getByRole("link")).toHaveCount(1);
    await expect(sommaire.getByRole("link", { name: "Le verdict", exact: true })).toBeVisible();
    await expect(sommaire.getByRole("button", { name: /\(verrouillé\)$/ })).toHaveText(CHAPITRES_FERMES.map((titre, k) => new RegExp(`^${k + 2}${titre}`)));
    await expect(sommaire.getByText("askblush.com")).toBeVisible();
    /* Sans le rapport complet, pas de question à BLUSH */
    await expect(sommaire.getByRole("link", { name: "Ta question" })).toHaveCount(0);
  });

  await test.step("« Le verdict » mène au chapitre 1, que le sommaire marque comme en cours", async () => {
    await expect(sommaire.getByRole("link", { name: "Le verdict", exact: true })).not.toHaveAttribute("aria-current");
    await sommaire.getByRole("link", { name: "Le verdict", exact: true }).click();
    /* Le chapitre 1 est déjà à l’écran en arrivant : il monte en haut */
    await attendreEnHaut(page, rapport.getByRole("heading", { level: 2, name: "Chapitre 1 : Le verdict" }));
    await expect(sommaire.getByRole("link", { name: "Le verdict", exact: true })).toHaveAttribute("aria-current", "location");
  });

  await test.step("un chapitre fermé ouvre le paiement", async () => {
    await sommaire.getByRole("button", { name: "Votre duo (verrouillé)" }).click();
    await expect(page.getByRole("dialog", { name: PAIEMENT })).toBeVisible();
  });
});

test("sommaire sur téléphone : la feuille suit la lecture, et les chapitres fermés ouvrent le paiement", async ({ page }, testInfo) => {
  test.skip(surOrdinateur(page), "sur ordinateur, le sommaire est une colonne (test précédent)");
  await lectureFaite(page, testInfo, emailLibre(testInfo, "sommaire-tel"));
  const rapport = await ouvrirLeRapport(page);
  const feuille = page.getByRole("dialog", { name: "Sommaire" });
  /* La barre du haut : l’adresse du site, puis le chapitre à l’écran (« Ton rapport » avant le chapitre 1) */
  const barre = page.getByRole("banner");

  await test.step("le bouton en haut à droite ouvre la feuille : les huit chapitres, le premier seul ouvert", async () => {
    await expect(barre.getByRole("button", { name: /Ton rapport$/ })).toBeVisible();
    await page.getByRole("button", { name: "Sommaire du rapport" }).click();
    await expect(feuille).toBeVisible();
    await expect(feuille.getByText("8 chapitres", { exact: true })).toBeVisible();
    await expect(feuille.getByRole("button", { name: "Le verdict", exact: true })).toBeVisible();
    /* Les chapitres fermés : leur titre seul (le cadenas n’est pas dit, voir le test.fixme plus bas) */
    for (const titre of CHAPITRES_FERMES) await expect(feuille.getByRole("button", { name: new RegExp(`^${titre}`) })).toBeVisible();
    await expect(feuille.getByRole("link", { name: "Poser ma question à BLUSH" })).toHaveCount(0);
    await feuille.getByRole("button", { name: "Fermer" }).click();
    await expect(feuille).toBeHidden();
  });

  await test.step("« Le verdict » ferme la feuille et mène au chapitre 1, que la barre du haut affiche", async () => {
    await page.getByRole("button", { name: "Sommaire du rapport" }).click();
    await feuille.getByRole("button", { name: "Le verdict", exact: true }).click();
    await expect(feuille).toBeHidden();
    await attendreEnHaut(page, rapport.getByRole("heading", { level: 2, name: "Chapitre 1 : Le verdict" }));
    await expect(barre.getByRole("button", { name: /1\/8 · Le verdict$/ })).toBeVisible();
  });

  await test.step("rouverte, la feuille dit où tu en es ; un chapitre fermé la ferme et ouvre le paiement", async () => {
    await page.getByRole("button", { name: "Sommaire du rapport" }).click();
    await expect(feuille.getByText("Chapitre 1 sur 8", { exact: true })).toBeVisible();
    await expect(feuille.getByRole("button", { name: "Le verdict En cours" })).toBeVisible();
    await feuille.getByRole("button", { name: /^Ton prochain pas/ }).click();
    await expect(feuille).toBeHidden();
    await expect(page.getByRole("dialog", { name: PAIEMENT })).toBeVisible();
  });
});

/*
 * Bug : dans la feuille du sommaire, un chapitre fermé n’est dit que par son titre ; le cadenas est une icône muette.
 * La colonne (ordinateur) et la liste du rapport disent « (verrouillé) » (LockRow, src/components/ui/progress.tsx:154).
 * src/app/rapport/ReportScreen.tsx:616-625 : l’InsetRow des chapitres fermés n’a pas ce texte pour les lecteurs d’écran.
 */
test.fixme("sommaire sur téléphone : les chapitres fermés se disent fermés aux lecteurs d’écran", async ({ page }, testInfo) => {
  test.skip(surOrdinateur(page), "la feuille du sommaire est celle du téléphone");
  await lectureFaite(page, testInfo, emailLibre(testInfo, "sommaire-a11y"));
  await ouvrirLeRapport(page);
  await page.getByRole("button", { name: "Sommaire du rapport" }).click();
  const feuille = page.getByRole("dialog", { name: "Sommaire" });
  for (const titre of CHAPITRES_FERMES) await expect(feuille.getByRole("button", { name: new RegExp(`^${titre}.*\\(verrouillé\\)$`) })).toBeVisible();
});
