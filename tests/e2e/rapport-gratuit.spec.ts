import { CHAPITRES_FERMES, compteDe, emailLibre, expect, fermerLaFeuille, histoiresDe, lectureFaite, ouvrirLeRapport, PAIEMENT, reponseAuGeste, tachesDe, test } from "./aide";

/*
 * Le rapport d’un compte gratuit (un email hors de BLUSH_ACCES_LIBRE). Décision produit : seul le chapitre 1 (le
 * verdict) est offert, les sept autres se débloquent. C’est ce que la production montre aujourd’hui ; ces tests le figent.
 */

test("compte gratuit : le chapitre 1 se lit en entier, les sept autres sont fermés", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "rapport-gratuit");
  await lectureFaite(page, testInfo, email);
  const rapport = await ouvrirLeRapport(page);

  await test.step("l’en-tête dit que c’est un aperçu gratuit", async () => {
    await expect(rapport.getByText("Le rapport de votre histoire")).toBeVisible();
    await expect(rapport.getByText("Aperçu gratuit", { exact: true })).toBeVisible();
    await expect(rapport.getByText("Complet", { exact: true })).toHaveCount(0);
  });

  await test.step("le chapitre 1 : le verdict, ce que ça veut dire, et la confiance", async () => {
    const chapitre1 = rapport.getByRole("region", { name: "Chapitre 1 : Le verdict" });
    await expect(chapitre1).toBeVisible();
    await expect(chapitre1.getByText("Vous êtes à deux doigts.", { exact: true })).toBeVisible();
    await expect(chapitre1.getByText("Elle a posé la question, t’as esquivé.")).toBeVisible();
    await expect(chapitre1.getByText("Ce que ça veut dire")).toBeVisible();
    await expect(chapitre1.getByText("C’est flou parce que t’as esquivé.")).toBeVisible();
    await expect(chapitre1.getByText("Probable", { exact: true })).toBeVisible();
    await expect(chapitre1.getByText("7 preuves dans votre conv")).toBeVisible();
  });

  await test.step("les chapitres 2 à 8 ne se lisent pas : ils sont listés, fermés, sous leur titre", async () => {
    await expect(rapport.getByRole("region", { name: /^Chapitre [2-8] / })).toHaveCount(0);
    await expect(rapport.getByText("La suite de ton rapport · 7 chapitres")).toBeVisible();
    const fermes = rapport.getByRole("button", { name: /\(verrouillé\)$/ });
    await expect(fermes).toHaveText(CHAPITRES_FERMES.map((titre, k) => new RegExp(`^${k + 2}${titre}`)));
  });

  await test.step("ni chat ni question : un seul bouton, « Lire la suite »", async () => {
    await expect(rapport.getByRole("button", { name: "Lire la suite" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Parler à BLUSH" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Poser ma question à BLUSH|Ta question/ })).toHaveCount(0);
  });

  await test.step("ouvrir le rapport ne lance rien de payant : rien de débloqué, le verdict seul est écrit", async () => {
    expect(await compteDe(email)).toMatchObject({ bulles: 0, debloquees: 0 });
    expect((await tachesDe(email)).map((t) => [t.genre, t.statut])).toEqual([["verdict", "fini"]]);
    /* La conv reste gardée (chiffrée) tant que la suite n’est pas débloquée : c’est d’elle que la suite s’écrira */
    expect(await histoiresDe(email)).toEqual([expect.objectContaining({ convGardee: true })]);
  });
});

test("compte gratuit : le paiement, ses deux formules, et « Débloquer » qui répond que BLUSH est sur invitation", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "rapport-paiement");
  await lectureFaite(page, testInfo, email);
  const rapport = await ouvrirLeRapport(page);
  const paiement = page.getByRole("dialog", { name: PAIEMENT });

  await test.step("« Lire la suite » ouvre le paiement : la suite comptée, le rapport seul ou Premium, choisie d’office", async () => {
    await rapport.getByRole("button", { name: "Lire la suite" }).click();
    await expect(paiement).toBeVisible();
    await expect(paiement.getByText("7 chapitres, ton plan et les phrases pour lui parler.")).toBeVisible();
    const offres = paiement.getByRole("radiogroup", { name: "Ta formule" }).getByRole("radio");
    await expect(offres).toHaveCount(2);
    const seul = offres.filter({ hasText: /^Le rapport/ });
    const premium = offres.filter({ hasText: /^Rapport \+ 60 bulles/ });
    await expect(premium).toBeChecked();
    await expect(premium).toContainText("Conseillé");
    await expect(premium).toContainText("Soit 90 bulles en tout");
    await expect(premium).toContainText("14,90\u00a0€");
    await expect(premium).toContainText("19,80\u00a0€");
    await expect(seul).not.toBeChecked();
    await expect(seul).toContainText("+ 10 bulles offertes");
    await expect(seul).toContainText("9,90\u00a0€");
    await expect(paiement.getByText("Paiement unique, pas d’abonnement · Apple Pay ou carte")).toBeVisible();
    await expect(paiement.getByText(/BLUSH\+|semaine/)).toHaveCount(0);

    await seul.click();
    await expect(seul).toBeChecked();
    await expect(premium).not.toBeChecked();
  });

  await test.step("« Débloquer » : pas de paiement branché, BLUSH le dit, et rien n’est débloqué", async () => {
    const reponse = await reponseAuGeste(page, { chemin: "/api/debloquer" }, () => paiement.getByRole("button", { name: "Débloquer" }).click());
    expect(reponse.status()).toBe(402);
    await expect(paiement.getByRole("status")).toHaveText("Le paiement arrive très vite. Pour l’instant, BLUSH est ouvert sur invitation.");
    await expect(page).toHaveURL(/\/rapport$/);
    await expect(paiement.getByRole("button", { name: "Débloquer" })).toBeEnabled();
    expect(await compteDe(email)).toMatchObject({ bulles: 0, debloquees: 0 });
  });

  await test.step("le paiement se ferme, et chaque chapitre fermé le rouvre", async () => {
    await fermerLaFeuille(page);
    await expect(paiement).toBeHidden();
    await rapport.getByRole("button", { name: /Ce qui coince/ }).click();
    await expect(paiement).toBeVisible();
    await fermerLaFeuille(page);
    await expect(paiement).toBeHidden();
  });

  await test.step("« Lire la suite » de Mon compte ouvre le rapport avec le paiement déjà ouvert", async () => {
    await page.goto("/compte");
    await page.getByRole("link", { name: "Lire la suite" }).click();
    await expect(page).toHaveURL(/\/rapport\?paiement=1$/);
    await expect(paiement).toBeVisible();
  });

  await test.step("« Ta question » vient avec le rapport : le paiement s’ouvre par-dessus, le fermer ramène au rapport", async () => {
    await page.goto("/rapport/question");
    const question = page.getByRole("dialog", { name: PAIEMENT });
    await expect(question).toBeVisible();
    await expect(question.getByText("La suite de ton rapport, ton plan et les phrases pour lui parler.")).toBeVisible();
    await fermerLaFeuille(page);
    await expect(page).toHaveURL(/\/rapport$/);
    await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "Noé & Maëlys" })).toBeVisible();
  });
});
