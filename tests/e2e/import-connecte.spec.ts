import {
  attendreLaScene,
  attendreLecture,
  choisirFichier,
  emailLibre,
  expect,
  exportWhatsApp,
  histoiresDe,
  importerWhatsApp,
  mailsPour,
  quiEnregistre,
  repondreQui,
  REPONSES_NOE,
  seConnecter,
  tachesDe,
  test,
} from "./aide";

/*
 * Déjà connecté, on importe une conv sans repasser par l’email : « Qui es-tu ? » lance la lecture lui-même. La première
 * conv d’un compte tout neuf, puis une deuxième, avec d’autres personnes, commencée depuis « Mon compte » (avec une seule
 * conv, « Tes convs » mène droit à l’accueil).
 */

test("déjà connecté : chaque conv se lit depuis « Qui es-tu ? » (« Lancer la lecture »), sans écran d’email", async ({ page }, testInfo) => {
  /* Deux imports et deux lectures dans le même test : le double d’un parcours */
  test.slow();
  const email = emailLibre(testInfo, "connecte");
  const premiere = exportWhatsApp(testInfo);
  /* Une autre histoire : Timéo (qui importe) et Inaya, 58 messages */
  const deuxieme = exportWhatsApp(testInfo, { personnes: { toi: "Timéo", autre: "Inaya" }, n: 58, format: "txt" });

  await test.step("connecté, sans conv encore : la connexion mène au début du parcours", async () => {
    await seConnecter(page, email);
    await expect(page).toHaveURL(/\/commencer$/);
  });

  await test.step("la première conv : « Lancer la lecture » à la place de « Continuer », et la lecture part", async () => {
    await importerWhatsApp(page, premiere);
    await page.getByRole("link", { name: "Continuer" }).click();
    await repondreQui(page, REPONSES_NOE);
    await expect(page.getByRole("button", { name: "Continuer" })).toHaveCount(0);
    await page.getByRole("button", { name: "Lancer la lecture" }).click();
    await attendreLecture(page);
  });

  await test.step("la deuxième conv, depuis « Mon compte » : importée, puis lue de la même façon", async () => {
    await page.goto("/compte");
    await page.getByRole("link", { name: /Nouvelle histoire/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Vous vous parlez où ?" })).toBeVisible();
    await page.getByRole("link", { name: /WhatsApp/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Exporte votre conv." })).toBeVisible();
    await choisirFichier(page, deuxieme.chemin);
    await expect(page.getByRole("heading", { level: 1, name: "C’est bon, on a votre conv." })).toBeVisible();
    await expect(page.getByText(String(deuxieme.messages), { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Continuer" }).click();
    await expect(page.getByRole("radiogroup", { name: "Qui es-tu dans cette conv\u00a0?" }).getByRole("radio")).toHaveText([/Timéo/, /Inaya/]);
    await repondreQui(page, { moi: "Timéo", tuEs: "Un garçon", ou: "On se parle", veux: "Juste comprendre" });
    await page.getByRole("button", { name: "Lancer la lecture" }).click();
    await attendreLecture(page);
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(`BLUSH analyse tes\\s*${deuxieme.messages}\\s*messages`) })).toBeVisible();
  });

  await test.step("son verdict, puis son rapport : celui de Timéo et Inaya", async () => {
    await page.getByRole("link", { name: "Voir mon rapport" }).click();
    await attendreLaScene(page, deuxieme.messages);
    await page.getByRole("link", { name: "Passer" }).click();
    await expect(page).toHaveURL(/\/rapport$/);
    await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "Timéo & Inaya" })).toBeVisible();
  });

  await test.step("côté serveur : deux convs lues sur le compte, et un seul mail (le code de la connexion)", async () => {
    expect((await histoiresDe(email)).map((h) => h.messages)).toEqual([premiere.messages, deuxieme.messages]);
    expect((await tachesDe(email)).map((t) => [t.genre, t.statut])).toEqual([
      ["verdict", "fini"],
      ["verdict", "fini"],
    ]);
    expect(await quiEnregistre(email)).toEqual({ moi: "Timéo", pronom: "il", devinette: "parle", objectif: "comprendre" });
    expect(mailsPour(email)).toHaveLength(1);
  });
});
