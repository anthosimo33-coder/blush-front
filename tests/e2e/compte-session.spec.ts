import {
  attendreTaches,
  compteDe,
  connecterParApi,
  deconnecterParApi,
  demanderCode,
  emailLibre,
  expect,
  lireUneConvParApi,
  nouvelInvite,
  ouvrir,
  saisirLeCodeRecu,
  sessionsDe,
  test,
  URL_APPLI,
} from "./aide";

/*
 * La session : les pages d’un compte sans session renvoient à la connexion, qui ramène ensuite à la page demandée ; la
 * landing reconnaît qui revient ; se déconnecter ferme la session. Les comptes sont préparés par les routes /api
 * (aide/compte.ts), la connexion qu’on vérifie se fait à l’écran.
 */

/* Chaque page, et la page où la connexion ramène ensuite (encodée dans ?suite=) */
const PROTEGEES: [string, string][] = [
  ["/compte", "/compte"],
  ["/app", "/app"],
  ["/app/fiche", "/app/fiche"],
  ["/rapport", "/rapport"],
  /* Le verdict se relit depuis le rapport */
  ["/rapport/verdict", "/rapport"],
  ["/rapport/question", "/rapport/question"],
  ["/lecture", "/lecture"],
  /* Sans compte, pas de liste : /app/convs renvoie à l’accueil, qui demande la connexion */
  ["/app/convs", "/app"],
];

const urlDeConnexion = (suite: string) => new RegExp(`/connexion\\?suite=${encodeURIComponent(suite)}$`);

test("sans session, Mon compte et les pages d’une conv mènent à la connexion, qui ramène ensuite à la page demandée", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "suite");

  await test.step("chaque page protégée renvoie à la connexion, avec la page où revenir", async () => {
    /* Les redirections que suit le navigateur, sans afficher chaque page (elles sont huit) : où elles mènent au bout */
    for (const [adresse, suite] of PROTEGEES) {
      const r = await page.request.get(adresse);
      expect(r.status(), `${adresse} sans session`).toBe(200);
      expect(r.url(), `${adresse} sans session`).toMatch(urlDeConnexion(suite));
    }
  });

  await test.step("le code reçu ramène à Mon compte, connecté", async () => {
    await page.goto("/compte");
    await expect(page).toHaveURL(urlDeConnexion("/compte"));
    await expect(page.getByRole("heading", { level: 1, name: "Retrouve tes convs." })).toBeVisible();
    const depuis = await demanderCode(page, email);
    await expect(page).toHaveURL(/\/connexion\/code\?suite=%2Fcompte$/);
    await saisirLeCodeRecu(page, email, depuis);
    await expect(page).toHaveURL(/\/compte$/);
    await expect(page.getByRole("main").getByText(email)).toBeVisible();
    /* Le compte est né au premier bon code */
    expect(await compteDe(email)).toMatchObject({ plan: "gratuit" });
  });
});

test("qui revient connecté : la landing propose « Ouvrir BLUSH » et « Retrouver ma conv », qui mènent à son accueil", async ({ page }, testInfo) => {
  /* BLUSH+ (un invité) : l’accueil s’ouvre sans le paiement */
  const email = await nouvelInvite(testInfo);
  await connecterParApi(page, testInfo, email);
  const entete = page.getByRole("banner");

  await test.step("connecté sans conv lue : la landing de tous, qui fait commencer", async () => {
    await page.goto("/");
    await expect(entete.getByRole("link", { name: "Commencer" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Analyser ma conv" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Retrouver ma conv" })).toHaveCount(0);
  });

  await lireUneConvParApi(page, testInfo);
  await attendreTaches(email);

  await test.step("avec sa conv : « Ouvrir BLUSH », « Retrouver ma conv », Maëlys qui attend, et Mon compte en bas", async () => {
    await page.goto("/");
    await expect(entete.getByRole("link", { name: "Ouvrir BLUSH" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Retrouver ma conv" }).first()).toBeVisible();
    await expect(page.getByText("Ta conv avec Maëlys t’attend").first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Pied de page" }).getByRole("link", { name: "Mon compte" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Se connecter" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Commencer" })).toHaveCount(0);
  });

  await test.step("« Retrouver ma conv » ouvre son accueil, sur Maëlys", async () => {
    await page.getByRole("link", { name: "Retrouver ma conv" }).first().click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("link", { name: /^Maëlys, voir sa fiche/ })).toBeVisible();
  });

  await test.step("« Ouvrir BLUSH », en haut, aussi", async () => {
    await page.goto("/");
    await entete.getByRole("link", { name: "Ouvrir BLUSH" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("link", { name: /^Maëlys, voir sa fiche/ })).toBeVisible();
  });
});

test("se déconnecter ferme la session : Mon compte redemande la connexion, et la conv se retrouve après le code", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "deconnexion");
  await connecterParApi(page, testInfo, email);
  await lireUneConvParApi(page, testInfo);
  await attendreTaches(email);

  await test.step("une déconnexion venue d’un autre site est refusée : la session reste", async () => {
    expect(await deconnecterParApi(page, testInfo, { autreSite: true })).toBe(403);
    expect(await sessionsDe(email)).toBe(1);
    await page.goto("/compte");
    await expect(page.getByRole("main").getByText(email)).toBeVisible();
  });

  await test.step("déconnecté : la session est fermée, Mon compte redemande la connexion, la landing est celle de tous", async () => {
    expect(await deconnecterParApi(page, testInfo)).toBe(200);
    expect(await sessionsDe(email)).toBe(0);
    await page.goto("/compte");
    await expect(page).toHaveURL(urlDeConnexion("/compte"));
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link", { name: "Se connecter" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Retrouver ma conv" })).toHaveCount(0);
  });

  await test.step("le rapport redemande la connexion, puis s’ouvre sur la conv du compte", async () => {
    await page.goto("/rapport");
    await expect(page).toHaveURL(urlDeConnexion("/rapport"));
    await saisirLeCodeRecu(page, email, await demanderCode(page, email));
    await expect(page).toHaveURL(/\/rapport$/);
    await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "Noé & Maëlys" })).toBeVisible();
  });
});

test("après la connexion, « suite » ne mène jamais vers un autre site : seulement vers une page de l’appli", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "suite-sure");
  const appli = new URL(URL_APPLI).origin;
  /* Sans conv encore, l’accueil du compte mène au début du parcours */
  const surLAccueil = async () => {
    await expect(page).toHaveURL((url) => url.origin === appli && url.pathname === "/commencer");
    await expect(page.getByRole("heading", { level: 1, name: "Vous vous parlez où ?" })).toBeVisible();
  };

  await test.step("sans session : une adresse d’un autre site dans « suite », puis le code : on arrive sur l’appli", async () => {
    await page.goto(`/connexion?suite=${encodeURIComponent("https://exemple.test/piege")}`);
    await saisirLeCodeRecu(page, email, await demanderCode(page, email));
    await surLAccueil();
  });

  await test.step("connecté : « //exemple.test » et « /\\exemple.test » (un autre site, déguisé) restent sur l’appli", async () => {
    for (const suite of ["//exemple.test/piege", "/\\exemple.test/piege"]) {
      await page.goto(`/connexion?suite=${encodeURIComponent(suite)}`);
      await surLAccueil();
    }
  });

  await test.step("une page de l’appli, elle, est bien suivie", async () => {
    await page.goto(`/connexion?suite=${encodeURIComponent("/compte")}`);
    await expect(page).toHaveURL(/\/compte$/);
    await expect(page.getByRole("main").getByText(email)).toBeVisible();
  });
});

/*
 * Bug : aucun écran ne permet de se déconnecter. La route existe (src/app/api/auth/deconnexion/route.ts:9), mais rien ne
 * l’appelle : ni l’appli (src/services/api.ts, à côté de verifyLoginCode ligne 183), ni Mon compte
 * (src/app/compte/CompteScreen.tsx:189, « Tes données »). Sur un appareil partagé, la personne suivante retrouve la conv.
 * Ce test décrit le bon comportement : un « Se déconnecter » dans Mon compte, qui ferme la session.
 */
test.fixme("Mon compte propose de se déconnecter : la session se ferme, et Mon compte redemande ensuite la connexion", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "bouton-deconnexion");
  await connecterParApi(page, testInfo, email);
  await ouvrir(page, "/compte");
  await page.getByRole("main").getByRole("button", { name: /^Se déconnecter/ }).click();
  await expect(page).not.toHaveURL(/\/compte$/);
  await expect.poll(() => sessionsDe(email)).toBe(0);
  await page.goto("/compte");
  await expect(page).toHaveURL(urlDeConnexion("/compte"));
});
