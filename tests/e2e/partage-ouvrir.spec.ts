import { attendreMail, attendreTaches, connecterParApi, emailLibre, expect, histoiresDe, lectureFaite, lireUneConvParApi, nouvelInvite, seConnecter, test } from "./aide";

/*
 * /ouvrir/<id>, le lien du mail « ton rapport est prêt » : il ouvre le rapport de cette conv-là. Sans session (le mail
 * lu dans un autre navigateur), la connexion d’abord, qui ramène au lien. Une conv d’un autre compte ne s’ouvre pas.
 */

test("le lien du mail « ton rapport est prêt », ouvert dans un autre navigateur : la connexion, puis ce rapport-là", async ({ page, autreAppareil }, testInfo) => {
  /* Un invité : BLUSH+ d’office, son rapport complet s’écrit, et le mail part quand il est prêt */
  const email = await nouvelInvite(testInfo);
  await lectureFaite(page, testInfo, email);
  const [{ id }] = await histoiresDe(email);

  const lien = await test.step("le mail porte le lien de cette conv", async () => {
    const mail = await attendreMail(email, { filtre: (m) => m.sujet === "📖 Ton rapport BLUSH est prêt" });
    const lien = mail.texte.match(/https?:\/\/\S+\/ouvrir\/\S+/)?.[0];
    expect(lien).toBe(`${testInfo.project.use.baseURL}/ouvrir/${id}`);
    return lien!;
  });

  /* Le mail ouvert sur un autre appareil : un autre navigateur, sans session */
  const ailleurs = await autreAppareil();
  await test.step("sans session : la connexion, qui garde le lien pour après", async () => {
    await ailleurs.goto(lien);
    await expect(ailleurs).toHaveURL((url) => url.pathname === "/connexion" && url.searchParams.get("suite") === `/ouvrir/${id}`);
    await expect(ailleurs.getByLabel("Ton email")).toBeVisible();
  });

  await test.step("le bon code ramène au lien, qui ouvre ce rapport, complet", async () => {
    await seConnecter(ailleurs, email, { suite: `/ouvrir/${id}` });
    await expect(ailleurs).toHaveURL(/\/rapport$/);
    const rapport = ailleurs.getByRole("main");
    await expect(rapport.getByRole("heading", { level: 1, name: "Noé & Maëlys" })).toBeVisible();
    await expect(rapport.getByRole("region", { name: /^Chapitre 8 / })).toBeVisible();
    await expect(rapport.getByRole("button", { name: /\(verrouillé\)$/ })).toHaveCount(0);
  });
});

test("connecté avec deux convs : le lien ouvre celle-là, et elle reste ouverte ; un autre compte n’y entre pas", async ({ page, autreAppareil }, testInfo) => {
  const email = emailLibre(testInfo, "deuxconvs");
  await connecterParApi(page, testInfo, email);
  /* Maëlys d’abord, puis Inès : la dernière lue est la conv ouverte */
  await lireUneConvParApi(page, testInfo);
  await attendreTaches(email);
  await lireUneConvParApi(page, testInfo, { personnes: { toi: "Noé", autre: "Inès" } });
  await attendreTaches(email);
  const [maelys, ines] = (await histoiresDe(email)).map((h) => h.id);
  const duo = page.getByRole("main").getByRole("heading", { level: 1 });

  await test.step("la dernière conv lue est ouverte", async () => {
    await page.goto("/rapport");
    await expect(duo).toHaveText("Noé & Inès");
  });

  await test.step("/ouvrir/<la première> l’ouvre, et elle reste ouverte ensuite", async () => {
    await page.goto(`/ouvrir/${maelys}`);
    await expect(page).toHaveURL(/\/rapport$/);
    await expect(duo).toHaveText("Noé & Maëlys");
    await page.goto("/rapport");
    await expect(duo).toHaveText("Noé & Maëlys");
  });

  await test.step("un lien qui ne désigne aucune conv mène au rapport, sans rien changer", async () => {
    await page.goto("/ouvrir/pas-une-conv");
    await expect(page).toHaveURL(/\/rapport$/);
    await expect(duo).toHaveText("Noé & Maëlys");
    await page.goto(`/ouvrir/${ines}`);
    await expect(duo).toHaveText("Noé & Inès");
  });

  await test.step("un autre compte, avec le lien d’une de ces convs : il ne la voit pas", async () => {
    const intrus = await autreAppareil();
    await seConnecter(intrus, emailLibre(testInfo, "intrus"));
    await intrus.goto(`/ouvrir/${maelys}`);
    /* Il n’a aucune conv : le début du parcours, pas le rapport de Noé */
    await expect(intrus).toHaveURL(/\/commencer$/);
    await expect(intrus.getByRole("heading", { level: 1, name: "Vous vous parlez où ?" })).toBeVisible();
    await expect(intrus.locator("body")).not.toContainText("Maëlys");
  });
});
