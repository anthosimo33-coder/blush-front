import {
  connecterParApi,
  demanderCode,
  emailLibre,
  expect,
  exportWhatsApp,
  fermerLesSessions,
  importerWhatsApp,
  lectureFaite,
  REFUS_FACTICE,
  remplirLaLimite,
  repondreQui,
  REPONSES_NOE,
  saisirLeCodeRecu,
  tachesDe,
  test,
} from "./aide";

/*
 * Quand la lecture (/lecture) ne se fait pas : le serveur en panne, le modèle qui refuse la conv, la session perdue en
 * route, trop de lectures en un jour. L’écran le dit toujours, et propose la suite qui a du sens : relancer, essayer une
 * autre conv, se reconnecter, revenir demain. Le refus vient du modèle factice, sur une conv qui porte son déclencheur
 * (REFUS_FACTICE, une conv inventée).
 */

const COINCE = /^Ça a coincé de notre côté\.\s*Ta conv est bien là\./;

test("la lecture n’a pas pu partir (le serveur en panne) : BLUSH le dit, et « Relancer la lecture » la reprend", async ({ page }, testInfo) => {
  await lectureFaite(page, testInfo, emailLibre(testInfo, "lecture-panne"));
  /* Le serveur répond une fois en erreur, comme pendant une panne passagère */
  let pannes = 1;
  await page.route("**/api/analyse", (r) =>
    r.request().method() === "POST" && pannes-- > 0 ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ erreur: "panne" }) }) : r.fallback(),
  );
  const echec = page.getByRole("main").getByRole("alert");

  await page.goto("/lecture");
  await expect(echec).toHaveText(COINCE);
  await expect(page.getByRole("link", { name: "Voir mon rapport" })).toHaveCount(0);
  await page.getByRole("button", { name: "Relancer la lecture" }).click();
  await expect(page.getByRole("link", { name: "Voir mon rapport" })).toBeVisible();
  await expect(echec).toHaveCount(0);
});

test("le modèle refuse la conv : « BLUSH ne peut pas lire cette conv. », une autre conv à essayer, et pas de rapport", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "lecture-refus");
  /* Le refus revient à chaque essai : la lecture finit en échec, sans nouvel essai */
  await lectureFaite(page, testInfo, email, { ajout: { de: "toi", texte: REFUS_FACTICE } }, { echecPermis: true });
  const ecran = page.getByRole("main");

  await test.step("l’écran dit que BLUSH ne peut pas lire cette conv, sans proposer de relancer", async () => {
    await page.goto("/lecture");
    await expect(ecran.getByRole("alert")).toContainText("BLUSH ne peut pas lire cette conv.");
    await expect(ecran.getByRole("alert")).toContainText("Rien n’est perdu : tu peux en essayer une autre.");
    await expect(page.getByRole("button", { name: "Relancer la lecture" })).toHaveCount(0);
    expect((await tachesDe(email)).every((t) => t.genre === "verdict" && t.statut === "echec" && t.erreur?.startsWith("refus"))).toBe(true);
  });

  await test.step("sans verdict, le rapport renvoie à la lecture", async () => {
    await page.goto("/rapport");
    await expect(page).toHaveURL(/\/lecture$/);
    await expect(ecran.getByRole("alert")).toContainText("BLUSH ne peut pas lire cette conv.");
  });

  await test.step("« Essayer une autre conv » mène au début du parcours", async () => {
    await page.getByRole("link", { name: "Essayer une autre conv" }).click();
    await expect(page).toHaveURL(/\/commencer$/);
    await expect(page.getByRole("heading", { level: 1, name: "Vous vous parlez où ?" })).toBeVisible();
  });

  await test.step("après trois relances dans la journée, l’écran dit de revenir demain", async () => {
    /* LIMITES.relanceParCompte (src/server/limites.ts, server-only : pas importable ici) */
    await remplirLaLimite(email, "relance:verdict", 20);
    await page.goto("/lecture");
    await expect(ecran.getByRole("alert")).toContainText(COINCE);
    await expect(ecran.getByRole("alert")).toContainText("Tu as déjà relancé plusieurs fois aujourd’hui. Réessaie demain : ta conv t’attend.");
  });
});

test("la session expire pendant la lecture : la connexion, puis la lecture reprend", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "lecture-session");
  await lectureFaite(page, testInfo, email);
  /* La lecture repart à l’arrivée sur l’écran : on la retient le temps que la session expire côté serveur */
  let relacher!: () => void;
  const retenue = new Promise<void>((r) => (relacher = r));
  await page.route("**/api/analyse", async (r) => {
    if (r.request().method() === "POST") await retenue;
    await r.fallback();
  });

  await page.goto("/lecture");
  /* En attendant le serveur, l’écran dit sa première étape */
  await expect(page.getByText("Votre histoire, du premier au dernier message")).toBeVisible();
  await fermerLesSessions(email);
  relacher();
  await expect(page).toHaveURL((url) => url.pathname === "/connexion" && url.searchParams.get("suite") === "/lecture");
  await saisirLeCodeRecu(page, email, await demanderCode(page, email));
  await expect(page).toHaveURL(/\/lecture$/);
  await expect(page.getByRole("link", { name: "Voir mon rapport" })).toBeVisible();
});

test("trop de lectures en un jour : « Qui es-tu ? » le dit, et la lecture ne part pas", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "lecture-limite");
  await connecterParApi(page, testInfo, email);
  /* Cinq convs lues aujourd’hui (src/server/limites.ts, analyseParCompte) */
  await remplirLaLimite(email, "analyse", 5);
  await importerWhatsApp(page, exportWhatsApp(testInfo));
  await page.getByRole("link", { name: "Continuer" }).click();
  await repondreQui(page, REPONSES_NOE);
  await page.getByRole("button", { name: "Lancer la lecture" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Tu as lancé beaucoup de lectures aujourd’hui. Réessaie demain.");
  await expect(page).toHaveURL(/\/qui$/);
  await expect(page.getByRole("button", { name: "Lancer la lecture" })).toBeEnabled();
  expect(await tachesDe(email)).toEqual([]);
});
