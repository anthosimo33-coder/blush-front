import type { Page } from "@playwright/test";
import { capturesPng, choisirFichier, enregistrerLaFiche, expect, filDuChat, lectureBlushPlus, ouvrir, test } from "./aide";

/*
 * Sa fiche (/app/fiche), à la manière d’une fiche Contacts, et le va-et-vient avec le chat : les détails du contact
 * (BLUSH en haut du chat), sa fiche lue par rubrique, « Modifier » (retirer, ajouter), « Complète sa fiche » et
 * « Annuler ». Après la lecture d’un compte BLUSH+, la mémoire du modèle factice range « Le libanais » dans « Elle aime »
 * (src/server/ia/factice.ts) ; une capture y ajoute « Étudiante en droit à Lyon » et « Adore les soirées improvisées ».
 */

/** Ce que sa fiche affiche : ses rubriques, dans l’ordre (les titres de niveau 2 de la page). */
const rubriques = (page: Page) => page.getByRole("main").getByRole("heading", { level: 2 });

test("les détails du contact, et le va-et-vient entre le chat et sa fiche", async ({ page }, testInfo) => {
  const contact = page.getByRole("dialog", { name: "Maëlys et toi" });
  const ouvrirContact = () => page.getByRole("button", { name: "BLUSH, ce qu’il voit de vous deux" }).click();
  const retour = page.getByRole("link", { name: "Retour" });
  const fiche = page.getByRole("heading", { level: 1, name: "Maëlys" });

  await test.step("un compte BLUSH+ dont la lecture et la mémoire sont faites", async () => {
    await lectureBlushPlus(page, testInfo);
    await ouvrir(page, "/app");
    await expect(filDuChat(page)).toBeVisible();
  });

  await test.step("BLUSH, en haut du chat, ouvre ce qu’il voit de vous deux : le verdict, où vous en êtes, le rapport, sa fiche", async () => {
    await ouvrirContact();
    await expect(contact.getByText("Ce que BLUSH voit")).toBeVisible();
    await expect(contact.getByText("🤏 À deux doigts")).toBeVisible();
    await expect(contact.getByRole("listitem")).toHaveText(["On se parle : réussi", "On se voit : réussi", "On se le dit : niveau en cours", "On est ensemble : à venir"]);
    await expect(contact.getByRole("link", { name: /Le rapport de votre histoire/ })).toContainText("4 sept. → 7 sept.");
    await expect(contact.getByRole("link", { name: /^Sa fiche/ })).toContainText("Son exam jeudi");
    await contact.getByRole("button", { name: "Fermer" }).click();
    await expect(contact).toBeHidden();
  });

  await test.step("« Sa fiche » l’ouvre ; « Retour » revient au chat en arrière dans l’historique", async () => {
    await ouvrirContact();
    await contact.getByRole("link", { name: /^Sa fiche/ }).click();
    await expect(page).toHaveURL(/\/app\/fiche$/);
    await expect(fiche).toBeVisible();
    await retour.click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(filDuChat(page)).toBeVisible();
    /* Un retour en arrière, pas une nouvelle page : la fiche est devant dans l’historique */
    await page.goForward();
    await expect(fiche).toBeVisible();
    await page.goBack();
    await expect(filDuChat(page)).toBeVisible();
  });

  await test.step("son prénom, en haut à droite du chat, ouvre aussi sa fiche", async () => {
    await page.getByRole("link", { name: "Maëlys, voir sa fiche (À deux doigts, niveau 3 sur 4)" }).click();
    await expect(page).toHaveURL(/\/app\/fiche$/);
    await expect(fiche).toBeVisible();
    await retour.click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(filDuChat(page)).toBeVisible();
  });

  await test.step("ouverte directement, sa fiche mène au chat, et l’historique la garde derrière lui", async () => {
    await ouvrir(page, "/app/fiche");
    await expect(fiche).toBeVisible();
    await retour.click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(filDuChat(page)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/app\/fiche$/);
    await expect(fiche).toBeVisible();
  });

  await test.step("« Le rapport de votre histoire » mène au rapport", async () => {
    await ouvrir(page, "/app");
    await ouvrirContact();
    await contact.getByRole("link", { name: /Le rapport de votre histoire/ }).click();
    await expect(page).toHaveURL(/\/rapport$/);
    await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "Noé & Maëlys" })).toBeVisible();
  });
});

test("sa fiche : lue par rubrique, une info corrigée (retirée puis réécrite), une autre ajoutée, et tout reste après un rechargement", async ({ page }, testInfo) => {
  const elleAime = page.getByRole("region", { name: "Elle aime" });
  const gens = page.getByRole("region", { name: "Les gens de sa vie" });
  const correction = "Le libanais, surtout les falafels";
  const ajout = "Sa sœur Jeanne, en Erasmus à Porto";

  await test.step("un compte BLUSH+ dont la lecture et la mémoire sont faites", () => lectureBlushPlus(page, testInfo));

  await test.step("sa fiche : son prénom, son portrait, ce que BLUSH sait d’elle, chaque info avec sa source", async () => {
    await ouvrir(page, "/app/fiche");
    await expect(page.getByRole("heading", { level: 1, name: "Maëlys" })).toBeVisible();
    await expect(page.getByText("La Taquine · mise à jour aujourd’hui")).toBeVisible();
    /* Les rubriques vides ne s’affichent pas */
    await expect(rubriques(page)).toHaveText(["Elle aime"]);
    await expect(elleAime.getByRole("listitem")).toHaveText([/^Le libanais\s*votre conv · 4 sept\.$/]);
    await expect(page.getByText("Rien n’est cherché sur Internet")).toBeVisible();
  });

  await test.step("« Modifier » : chaque rubrique s’ouvre pour ajouter, « Complète sa fiche » attend", async () => {
    await page.getByRole("button", { name: "Modifier" }).click();
    await expect(page.getByRole("button", { name: "OK", exact: true, pressed: true })).toBeVisible();
    await expect(rubriques(page)).toHaveText(["À savoir", "Elle aime", "Les gens de sa vie", "Dates à retenir", "Tes notes"]);
    await expect(page.getByRole("button", { name: /^Complète sa fiche/ })).toBeDisabled();
  });

  await test.step("corriger une info : la retirer, puis la réécrire dans sa rubrique", async () => {
    await elleAime.getByRole("button", { name: "Retirer « Le libanais »" }).click();
    await expect(elleAime.getByText("Le libanais", { exact: true })).toHaveCount(0);
    const champ = elleAime.getByRole("textbox", { name: "Ajouter dans « Elle aime »" });
    await champ.fill(correction);
    await champ.press("Enter");
    await expect(champ).toHaveValue("");
    await expect(elleAime.getByText(correction)).toBeVisible();
  });

  await test.step("ajouter une info dans une rubrique vide", async () => {
    /* Les enregistrements partent l’un après l’autre : celui qui contient l’ajout est le dernier */
    const champ = gens.getByRole("textbox", { name: "Ajouter dans « Les gens de sa vie »" });
    await champ.fill(ajout);
    const enregistre = await enregistrerLaFiche(page, () => champ.press("Enter"), ajout);
    await expect(gens.getByText(ajout)).toBeVisible();
    expect(enregistre.ok()).toBe(true);
  });

  await test.step("« OK » : la fiche se relit, les rubriques vides se referment", async () => {
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await expect(page.getByRole("button", { name: "Modifier" })).toBeVisible();
    await expect(rubriques(page)).toHaveText(["Elle aime", "Les gens de sa vie"]);
  });

  await test.step("rechargée, la fiche garde tes retouches, ce que tu as écrit « d’après toi »", async () => {
    await ouvrir(page);
    await expect(rubriques(page)).toHaveText(["Elle aime", "Les gens de sa vie"]);
    await expect(elleAime.getByRole("listitem")).toHaveText([new RegExp(`^${correction}\\s*d’après toi$`)]);
    await expect(gens.getByRole("listitem")).toHaveText([new RegExp(`^${ajout}\\s*d’après toi$`)]);
  });
});

test("« Complète sa fiche » : une capture, les infos rangées dans leur rubrique, puis « Annuler » les retire", async ({ page }, testInfo) => {
  const resume = page.getByRole("region", { name: "2 nouvelles infos rangées" });
  const aSavoir = page.getByRole("region", { name: "À savoir" });
  const notes = page.getByRole("region", { name: "Tes notes" });

  await test.step("un compte BLUSH+ dont la lecture et la mémoire sont faites", async () => {
    await lectureBlushPlus(page, testInfo);
    await ouvrir(page, "/app/fiche");
    await expect(rubriques(page)).toHaveText(["Elle aime"]);
  });

  await test.step("une capture : BLUSH l’analyse (« Modifier » attend), puis dit ce qu’il a rangé, et où", async () => {
    /* La réponse est retenue le temps de voir BLUSH lire (le modèle factice répond presque tout de suite) */
    let relacher!: () => void;
    const retenue = new Promise<void>((r) => (relacher = r));
    await page.route("**/api/fiche", async (route) => {
      if (route.request().method() === "POST") await retenue;
      await route.continue();
    });
    await choisirFichier(page, capturesPng(testInfo, 1), page.getByRole("button", { name: /^Complète sa fiche/ }));
    const lecture = page.getByRole("status").filter({ hasText: "BLUSH analyse ta capture" });
    await expect(lecture).toContainText("Il range ce qu’il trouve.");
    await expect(page.getByRole("button", { name: "Modifier" })).toBeDisabled();
    relacher();
    await expect(resume).toBeVisible();
    await expect(lecture).toHaveCount(0);
    await page.unroute("**/api/fiche");
    await expect(resume.getByText("Trouvées dans ta capture.")).toBeVisible();
    await expect(resume.getByRole("listitem")).toHaveCount(2);
    await expect(resume.getByRole("listitem").filter({ hasText: "Étudiante en droit à Lyon" })).toContainText("À savoir");
    await expect(resume.getByRole("listitem").filter({ hasText: "Adore les soirées improvisées" })).toContainText("Tes notes");
  });

  await test.step("dans sa fiche, les infos arrivées sont marquées « Nouveau », avec leur source", async () => {
    await expect(rubriques(page).filter({ hasNotText: "nouvelles infos" })).toHaveText(["À savoir", "Elle aime", "Tes notes"]);
    const profil = aSavoir.getByRole("listitem").filter({ hasText: "Étudiante en droit à Lyon" });
    await expect(profil).toContainText("Nouveau");
    await expect(profil).toContainText(/son profil · \d+ \S+/);
    await expect(notes.getByRole("listitem").filter({ hasText: "Adore les soirées improvisées" })).toContainText("Nouveau");
    await expect(page.getByRole("region", { name: "Elle aime" }).getByRole("listitem")).not.toContainText("Nouveau");
  });

  await test.step("« Annuler » : la fiche revient comme avant, et le reste après un rechargement", async () => {
    const enregistre = await enregistrerLaFiche(page, () => resume.getByRole("button", { name: "Annuler" }).click());
    await expect(resume).toBeHidden();
    await expect(rubriques(page)).toHaveText(["Elle aime"]);
    expect(enregistre.ok()).toBe(true);
    await ouvrir(page);
    await expect(rubriques(page)).toHaveText(["Elle aime"]);
    await expect(page.getByRole("region", { name: "Elle aime" }).getByText("Le libanais", { exact: true })).toBeVisible();
  });
});

/*
 * Les infos de sa fiche ont pour identifiant leur place dans la liste (f0, f1… : faitsAffiches, src/server/ecrans/fiche.ts),
 * qu’un retrait décale. La fiche retient donc les infos arrivées par leur texte (`fresh`, src/app/app/fiche/FicheScreen.tsx) :
 * le point « Nouveau » reste sur les bonnes infos.
 */
test("après un retrait, les infos arrivées gardent leur point « Nouveau »", async ({ page }, testInfo) => {
  await lectureBlushPlus(page, testInfo);
  await ouvrir(page, "/app/fiche");
  await choisirFichier(page, capturesPng(testInfo, 1), page.getByRole("button", { name: /^Complète sa fiche/ }));
  await expect(page.getByRole("region", { name: "2 nouvelles infos rangées" })).toBeVisible();
  await page.getByRole("button", { name: "Modifier" }).click();
  await page.getByRole("button", { name: "Retirer « Le libanais »" }).click();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(rubriques(page)).toHaveText(["À savoir", "Tes notes"]);
  await expect(page.getByRole("region", { name: "À savoir" }).getByRole("listitem").filter({ hasText: "Étudiante en droit à Lyon" })).toContainText("Nouveau");
  await expect(page.getByRole("region", { name: "Tes notes" }).getByRole("listitem").filter({ hasText: "Adore les soirées improvisées" })).toContainText("Nouveau");
});

/*
 * Quand une fille utilise BLUSH, la rubrique s’appelle « Il aime », et sa ligne d’ajout aussi : le titre suit son pronom
 * (titreDeRubrique, src/contenu/fiche.ts), et la fiche le lit tel quel.
 */
test("quand elle parle de lui, la ligne d’ajout de « Il aime » porte ce nom", async ({ page }, testInfo) => {
  await lectureBlushPlus(page, testInfo, { personnes: { toi: "Inès", autre: "Malo" }, jeSuis: "Une fille" });
  await ouvrir(page, "/app/fiche");
  await page.getByRole("button", { name: "Modifier" }).click();
  const ilAime = page.getByRole("region", { name: "Il aime" });
  await expect(ilAime.getByRole("textbox", { name: "Ajouter dans « Il aime »" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ajouter dans « Elle aime »" })).toHaveCount(0);
});
