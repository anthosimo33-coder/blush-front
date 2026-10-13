import {
  attendreMail,
  attendreTaches,
  changerErreur,
  CHAPITRES_FERMES,
  debloquerLaConv,
  emailLibre,
  etapeEnEchec,
  expect,
  lectureFaite,
  ouvrirLeRapport,
  remplirLaLimite,
  telQuel,
  titreDuChapitre,
  reponseAuGeste,
  tachesDe,
  test,
} from "./aide";

/*
 * Le rapport qui s’écrit. Il se débloque après le verdict (comme un achat livré, ou `npm run acces`) : la suite part à
 * la prochaine ouverture du rapport, et l’écran montre l’écriture jusqu’à ce que les huit chapitres soient là.
 * Le modèle factice écrit en quelques secondes : le suivi de l’écran (GET /api/rapport, toutes les 2 secondes) est
 * retenu le temps de regarder l’écriture, puis relâché. Une écriture en échec, elle, se dit, et se relance.
 */

test("le rapport débloqué après le verdict : le rapport s’écrit sous tes yeux, puis s’ouvre en entier sans recharger", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "rapport-ecriture");
  await lectureFaite(page, testInfo, email);
  await debloquerLaConv(email);

  let relacher!: () => void;
  const retenu = new Promise<void>((r) => (relacher = r));
  await page.route("**/api/rapport", async (route) => {
    if (route.request().method() === "GET") await retenu;
    await route.continue();
  });
  const rapport = await ouvrirLeRapport(page);

  await test.step("la suite s’écrit : ses sept chapitres en attente, rien à payer, rien à ouvrir", async () => {
    await expect(rapport.getByText("Complet", { exact: true })).toBeVisible();
    await expect(rapport.getByRole("region", { name: "Chapitre 1 : Le verdict" })).toBeVisible();
    await expect(rapport.getByText("La suite de ton rapport s’écrit · 7 chapitres")).toBeVisible();
    /* Chaque ligne : son numéro, son titre, et son état (le texte de la ligne, d’un bout à l’autre) */
    for (const [k, titre] of CHAPITRES_FERMES.entries()) await expect(rapport.getByText(new RegExp(`^${k + 2}${telQuel(titre)}En attente$`))).toBeVisible();
    /* Les chapitres à venir ne mènent pas au paiement : ce ne sont plus des boutons */
    await expect(rapport.getByRole("button", { name: /\(verrouillé\)$/ })).toHaveCount(0);
    await expect(rapport.getByRole("button", { name: "Lire la suite" })).toHaveCount(0);
    /* Pendant l’écriture, ni chat ni question : ils ne sont pas encore prêts */
    await expect(page.getByRole("link", { name: "Parler à BLUSH" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Poser ma question à BLUSH|Ta question/ })).toHaveCount(0);
  });

  await test.step("BLUSH dit ce qu’il écrit, et le temps qu’il reste ; son vocal s’enregistre aussi", async () => {
    /* En bas de l’écran (et sur ordinateur, aussi en haut du sommaire) : le plan d’abord, et le temps qui reste */
    await expect(page.getByText("BLUSH écrit ton rapport", { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(
      page
        .getByText(/^Il prépare le plan · encore ≈\s3\smin$/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(rapport.getByText("BLUSH enregistre ton vocal")).toBeVisible();
    await expect(rapport.getByText("Prêt avant ton rapport")).toBeVisible();
  });

  await test.step("l’écriture finie, les huit chapitres apparaissent d’eux-mêmes", async () => {
    relacher();
    await attendreTaches(email);
    await expect(rapport.getByRole("region", { name: `Chapitre 8 : ${titreDuChapitre(8)}` })).toBeVisible();
    await expect(rapport.getByRole("region", { name: /^Chapitre \d : / })).toHaveCount(8);
    await expect(rapport.getByText(/^La suite de ton rapport/)).toHaveCount(0);
    await expect(page.getByText("BLUSH écrit ton rapport", { exact: true })).toHaveCount(0);
    await expect(rapport.getByRole("link", { name: "Poser ma question à BLUSH" })).toBeVisible();
  });

  await test.step("côté serveur : toute la chaîne a tourné, et le mail « ton rapport est prêt » est parti", async () => {
    const taches = await attendreTaches(email);
    expect(taches.map((t) => [t.genre, t.statut]).sort()).toEqual(
      [
        ["memoire", "fini"],
        ["rapport_chapitres", "fini"],
        ["rapport_plan", "fini"],
        ["verdict", "fini"],
        ["vocal", "fini"],
      ].sort(),
    );
    await attendreMail(email, { filtre: (m) => m.sujet === "📖 Ton rapport BLUSH est prêt" });
  });
});

test("l’écriture a échoué : BLUSH le dit, un refus ne se relance pas, une panne se relance (quelques fois par jour) et le rapport s’écrit sans recharger", async ({
  page,
}, testInfo) => {
  const email = emailLibre(testInfo, "rapport-echec");
  await lectureFaite(page, testInfo, email);
  /* Le plan a raté ses trois essais, puis l’accès est arrivé : ouvrir le rapport ne relance rien tout seul */
  const plan = await etapeEnEchec(email, "rapport_plan", "refus");
  await debloquerLaConv(email);
  const echec = page.getByRole("main").getByRole("alert");
  const relancer = page.getByRole("button", { name: "Relancer l’écriture" });

  await test.step("un refus du modèle : la suite ne s’écrira pas, rien à relancer ; le verdict reste", async () => {
    const rapport = await ouvrirLeRapport(page);
    await expect(echec).toHaveText("La suite de ton rapport n’a pas pu s’écrire.");
    await expect(rapport.getByText("BLUSH ne peut pas écrire la suite à partir de cette conv. Ton verdict, lui, reste juste.")).toBeVisible();
    await expect(relancer).toHaveCount(0);
    await expect(rapport.getByRole("region", { name: "Chapitre 1 : Le verdict" })).toBeVisible();
    await expect(page.getByText("BLUSH écrit ton rapport", { exact: true })).toHaveCount(0);
  });

  await test.step("une panne : BLUSH le dit, et propose de relancer", async () => {
    await changerErreur(plan, "sortie_illisible");
    const rapport = await ouvrirLeRapport(page);
    await expect(echec).toHaveText("La suite de ton rapport n’a pas pu s’écrire.");
    await expect(rapport.getByText("BLUSH a buté en l’écrivant. Ta conv est toujours là : relance, et tout repart de zéro.")).toBeVisible();
    await expect(relancer).toBeEnabled();
  });

  await test.step("déjà relancé trois fois aujourd’hui : la relance est refusée, et c’est dit", async () => {
    await remplirLaLimite(email, "relance", 3);
    expect((await reponseAuGeste(page, { chemin: "/api/rapport" }, () => relancer.click())).status()).toBe(429);
    await expect(page.getByText("Tu as déjà relancé plusieurs fois aujourd’hui. Réessaie demain.")).toBeVisible();
    expect((await tachesDe(email)).find((t) => t.genre === "rapport_plan")).toMatchObject({ statut: "echec" });
  });

  await test.step("le lendemain : « Relancer l’écriture » repart de zéro, et les huit chapitres arrivent sans recharger", async () => {
    await remplirLaLimite(email, "relance", 0);
    expect((await reponseAuGeste(page, { chemin: "/api/rapport" }, () => relancer.click())).status()).toBe(200);
    await expect(echec).toHaveCount(0);
    const rapport = page.getByRole("main");
    await expect(rapport.getByRole("region", { name: `Chapitre 8 : ${titreDuChapitre(8)}` })).toBeVisible();
    await expect(rapport.getByRole("region", { name: /^Chapitre \d : / })).toHaveCount(8);
    await expect(rapport.getByRole("link", { name: "Poser ma question à BLUSH" })).toBeVisible();
    expect((await attendreTaches(email)).filter((t) => t.genre === "rapport_plan").map((t) => t.statut)).toEqual(["fini"]);
  });
});
