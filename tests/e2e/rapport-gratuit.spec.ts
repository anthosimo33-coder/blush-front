import {
  CHAPITRES_D_ATTENTE,
  CHAPITRES_FERMES,
  compteDe,
  emailLibre,
  expect,
  feuilleSurOrdinateur,
  fermerLaFeuille,
  histoiresDe,
  lectureFaite,
  NUNITO,
  OFFRE_SUITE,
  ouvrirLeRapport,
  PAIEMENT,
  tachesDe,
  telQuel,
  test,
  titreDuChapitre,
  verdictDAvantLesTitres,
} from "./aide";

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

  await test.step("les chapitres 2 à 8 ne se lisent pas : ils sont listés, fermés, sous les titres que le verdict a écrits pour leur histoire", async () => {
    await expect(rapport.getByRole("region", { name: /^Chapitre [2-8] / })).toHaveCount(0);
    await expect(rapport.getByText("La suite de ton rapport · 7 chapitres")).toBeVisible();
    const fermes = rapport.getByRole("button", { name: /\(verrouillé\)$/ });
    await expect(fermes).toHaveText(CHAPITRES_FERMES.map((titre, k) => new RegExp(`^${k + 2}${telQuel(titre)}`)));
    /* Le chapitre de Maëlys porte son prénom */
    await expect(fermes.nth(3)).toContainText(/^5Maëlys, /);
  });

  await test.step("ni chat ni question : « Lire la suite · 13,90 € », et les 10 bulles offertes avec le rapport", async () => {
    await expect(rapport.getByRole("button", { name: "Lire la suite · 13,90\u00a0€" })).toBeVisible();
    await expect(rapport.getByRole("button", { name: /^10 bulles offertes avec ton rapport/ })).toContainText("1 bulle = 1 réponse de BLUSH, sur tout ce que tu veux");
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

test("compte gratuit, une conv lue avant les titres des chapitres : les chapitres fermés gardent leurs titres d’attente", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "rapport-sans-titres");
  await lectureFaite(page, testInfo, email);
  await verdictDAvantLesTitres(email);
  const rapport = await ouvrirLeRapport(page);
  const fermes = rapport.getByRole("button", { name: /\(verrouillé\)$/ });
  await expect(fermes).toHaveText(CHAPITRES_D_ATTENTE.map((titre, k) => new RegExp(`^${k + 2}${telQuel(titre)}`)));
  /* Le reste de l’aperçu ne change pas : le verdict, et « Lire la suite » */
  await expect(rapport.getByRole("region", { name: "Chapitre 1 : Le verdict" }).getByText("Vous êtes à deux doigts.", { exact: true })).toBeVisible();
  await expect(rapport.getByRole("button", { name: "Lire la suite · 13,90\u00a0€" })).toBeVisible();
});

test("compte gratuit : le paiement, ses deux formules, la renonciation sous le bouton, et l’offre unique ① en le fermant", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "rapport-paiement");
  await lectureFaite(page, testInfo, email);
  const rapport = await ouvrirLeRapport(page);
  const paiement = page.getByRole("dialog", { name: PAIEMENT });

  await test.step("les bulles offertes, expliquées d’un toucher : « C’est quoi une bulle ? », que « Compris » ferme", async () => {
    await rapport.getByRole("button", { name: /^10 bulles offertes avec ton rapport/ }).click();
    const bulle = page.getByRole("dialog", { name: "C’est quoi une bulle\u00a0?" });
    await expect(bulle.getByText("Sur tout ce que tu veux. Elles n’expirent jamais.")).toBeVisible();
    await feuilleSurOrdinateur(page, bulle, { titre: 26 });
    /* Ses bulles d’exemple, dans la police de l’appli (comme le prototype), pas dans celle des messages */
    await expect(bulle.getByText("elle a liké ma story")).toHaveCSS("font-family", NUNITO);
    await bulle.getByRole("button", { name: "Compris" }).click();
    await expect(bulle).toBeHidden();
  });

  await test.step("« Lire la suite » ouvre « Ta formule » : le rapport seul, ou Premium, choisie d’avance et ouverte", async () => {
    await rapport.getByRole("button", { name: "Lire la suite · 13,90\u00a0€" }).click();
    await expect(paiement).toBeVisible();
    /* Sur ordinateur, le titre à 26 px du prototype (pas 32), et pas de bande blanche au-dessus */
    await feuilleSurOrdinateur(page, paiement, { titre: 26 });
    const offres = paiement.getByRole("radiogroup", { name: "Ta formule" }).getByRole("radio");
    await expect(offres).toHaveCount(2);
    const seul = offres.filter({ hasText: /^Le rapport/ });
    const premium = offres.filter({ hasText: /^Rapport \+ 60 bulles/ });
    await expect(premium).toBeChecked();
    for (const texte of [
      "+30 offertes",
      "Soit 90 bulles en tout",
      "18,90\u00a0€",
      "27,80\u00a0€",
      "Le rapport · 7 chapitres",
      "60 bulles",
      "+ 30 bulles offertes",
      "8,90\u00a0€",
      "Économise 8,90\u00a0€ · la bulle à 0,06\u00a0€",
      "Premium",
    ])
      await expect(premium).toContainText(texte);
    await expect(seul).not.toBeChecked();
    await expect(seul).toContainText("+ 10 bulles offertes");
    await expect(seul).toContainText("13,90\u00a0€");
    await expect(paiement.getByRole("button", { name: "Débloquer · 18,90\u00a0€" })).toBeVisible();
    await expect(paiement.getByText("Paiement unique, pas d’abonnement · Apple Pay ou carte")).toBeVisible();
    await expect(paiement.getByText(/BLUSH\+|semaine/)).toHaveCount(0);

    await seul.click();
    await expect(seul).toBeChecked();
    await expect(seul).toContainText("7 chapitres, ton plan, ton vocal");
    await expect(premium).not.toBeChecked();
    await expect(premium).not.toContainText("Le rapport · 7 chapitres");
    await expect(paiement.getByRole("button", { name: "Débloquer · 13,90\u00a0€" })).toBeVisible();
  });

  await test.step("« C’est quoi une bulle ? » s’ouvre par-dessus la feuille, et y revient", async () => {
    await paiement.getByRole("button", { name: "1 bulle = 1 réponse de BLUSH. C’est quoi une bulle\u00a0?" }).click();
    const bulle = page.getByRole("dialog", { name: "C’est quoi une bulle\u00a0?" });
    await expect(bulle).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bulle).toBeHidden();
    await expect(paiement).toBeVisible();
  });

  await test.step("pas de case : la renonciation dite juste sous « Débloquer », son lien vers les conditions", async () => {
    await expect(paiement.getByRole("checkbox")).toHaveCount(0);
    const debloquer = paiement.getByRole("button", { name: /^Débloquer/ });
    const ligne = paiement.getByText("En payant, tu as ton rapport tout de suite et tu renonces au délai de rétractation.");
    await expect(ligne).toBeVisible();
    await expect(ligne.getByRole("link", { name: "délai de rétractation" })).toHaveAttribute("href", "/conditions#livraison");
    const [b, l] = [(await debloquer.boundingBox())!, (await ligne.boundingBox())!];
    expect(l.y - (b.y + b.height), "juste sous le bouton").toBeGreaterThanOrEqual(0);
    expect(l.y - (b.y + b.height), "juste sous le bouton").toBeLessThan(24);
    await expect(paiement.getByRole("alert")).toHaveCount(0);
  });

  await test.step("fermé sans payer : l’offre unique ① (la suite à 10,90 €, 5 minutes, l’heure de fin donnée par le serveur), une fois", async () => {
    await fermerLaFeuille(page);
    await expect(paiement).toBeHidden();
    const offre = page.getByRole("dialog", { name: OFFRE_SUITE });
    await expect(offre).toBeVisible();
    await feuilleSurOrdinateur(page, offre);
    await expect(offre.getByText("attends…")).toBeVisible();
    await expect(offre.getByText("attends…")).toHaveCSS("font-family", NUNITO);
    await expect(offre.getByText("Rien que pour toi, et une seule fois.")).toBeVisible();
    await expect(offre.getByRole("timer", { name: "L’offre se termine dans" })).toHaveText(/^0[45]:\d\d$/);
    await expect(offre.getByText("10,90\u00a0€", { exact: true })).toBeVisible();
    await expect(offre.getByText("au lieu de 13,90\u00a0€", { exact: true })).toBeAttached();
    await expect(offre.getByText("−3\u00a0€", { exact: true })).toBeVisible();
    await expect(offre.getByRole("listitem")).toHaveText(["7 chapitres", "Ton vocal", "10 bulles offertes"]);
    await expect(offre.getByRole("button", { name: "Je la prends · 10,90\u00a0€" })).toBeVisible();
    await offre.getByRole("button", { name: "Non merci" }).click();
    await expect(offre).toBeHidden();
  });

  await test.step("chaque chapitre fermé rouvre le paiement ; le refermer ne remontre pas l’offre", async () => {
    await rapport.getByRole("button", { name: new RegExp(telQuel(titreDuChapitre(4))) }).click();
    await expect(paiement).toBeVisible();
    await fermerLaFeuille(page);
    await expect(paiement).toBeHidden();
    await expect(page.getByRole("dialog", { name: OFFRE_SUITE })).toHaveCount(0);
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
    await expect(question.getByRole("radio", { name: /^Rapport \+ 60 bulles/ })).toContainText("Le rapport · 7 chapitres");
    await fermerLaFeuille(page);
    await expect(page).toHaveURL(/\/rapport$/);
    await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "Noé & Maëlys" })).toBeVisible();
  });
});
