import type { Page } from "@playwright/test";
import { CLE_PARCOURS, CLE_REPRISE } from "../../src/state/cles";
import {
  attendreTaches,
  compteDe,
  connecterParApi,
  deconnecterParApi,
  demanderCode,
  dernierCode,
  emailLibre,
  expect,
  lireUneConvParApi,
  nouvelInvite,
  origine,
  ouvrir,
  saisirLeCodeRecu,
  sessionsDe,
  test,
  URL_APPLI,
} from "./aide";

/*
 * La session : les pages d’un compte sans session renvoient à la connexion, qui ramène ensuite à la page demandée ; la
 * landing reconnaît qui revient ; se déconnecter (de cet appareil, ou de tous) ferme la session ; le code ne vaut que
 * dans le navigateur qui l’a demandé. Les comptes sont préparés par les routes /api (aide/compte.ts), la connexion et la
 * déconnexion qu’on vérifie se font à l’écran.
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

  await test.step("avec sa conv : « Ouvrir BLUSH », « Retrouver ma conv », sa conv qui attend sans le prénom de l’autre, et Mon compte en bas", async () => {
    await page.goto("/");
    await expect(entete.getByRole("link", { name: "Ouvrir BLUSH" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Retrouver ma conv" }).first()).toBeVisible();
    /* Qui tient l’appareil lit la landing sans rien toucher : elle ne dit pas avec qui */
    await expect(page.getByText("Ta conv t’attend").first()).toBeVisible();
    await expect(page.getByText(/Ta conv avec/)).toHaveCount(0);
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

/** Dans Mon compte : une ligne de « Ta connexion », puis le bouton de sa feuille. */
async function seDeconnecterDansMonCompte(page: Page, { partout = false } = {}): Promise<void> {
  await ouvrir(page, "/compte");
  const [ligne, titre, bouton] = partout
    ? [/^Se déconnecter de tous les appareils/, "Se déconnecter de tous les appareils\u00a0?", "Se déconnecter de partout"]
    : [/^Se déconnecter Sur cet appareil/, "Se déconnecter\u00a0?", "Se déconnecter"];
  await page.getByRole("main").getByRole("button", { name: ligne }).click();
  await page.getByRole("dialog", { name: titre }).getByRole("button", { name: bouton, exact: true }).click();
  /* Un chargement neuf de la landing, celle de tous */
  await expect(page).toHaveURL(`${URL_APPLI}/`);
  await expect(page.getByRole("banner").getByRole("link", { name: "Se connecter" })).toBeVisible();
}

test("Mon compte propose de se déconnecter : la session se ferme, le navigateur oublie ce qu’il gardait, et Mon compte redemande la connexion", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "bouton-deconnexion");
  await connecterParApi(page, testInfo, email);
  /* Le réveil part à chaque chargement : c’est lui qui fait glisser la session (src/components/shell/Reveil.tsx) */
  const reveil = page.waitForRequest((r) => new URL(r.url()).pathname === "/api/reveil");
  await ouvrir(page, "/compte");
  await reveil;
  /* Ce que le navigateur garde de BLUSH (src/state/cles.ts) : où tu t’étais arrêté dans le rapport, le parcours de l’onglet */
  await page.evaluate(
    ({ reprise, parcours }) => {
      localStorage.setItem(reprise, "{}");
      sessionStorage.setItem(parcours, "{}");
    },
    { reprise: CLE_REPRISE, parcours: CLE_PARCOURS },
  );

  await seDeconnecterDansMonCompte(page);
  await expect.poll(() => sessionsDe(email)).toBe(0);
  expect(
    await page.evaluate(({ reprise, parcours }) => [localStorage.getItem(reprise), sessionStorage.getItem(parcours)], { reprise: CLE_REPRISE, parcours: CLE_PARCOURS }),
  ).toEqual([null, null]);
  await page.goto("/compte");
  await expect(page).toHaveURL(urlDeConnexion("/compte"));
});

test("« Se déconnecter de tous les appareils » ferme aussi la session de l’autre appareil", async ({ page, autreAppareil }, testInfo) => {
  const email = emailLibre(testInfo, "partout");
  await connecterParApi(page, testInfo, email);
  const ordi = await autreAppareil();
  await connecterParApi(ordi, testInfo, email);
  expect(await sessionsDe(email)).toBe(2);

  await seDeconnecterDansMonCompte(page, { partout: true });
  await expect.poll(() => sessionsDe(email)).toBe(0);
  await ordi.goto("/compte");
  await expect(ordi).toHaveURL(urlDeConnexion("/compte"));
});

test("le code ne vaut que dans le navigateur qui l’a demandé : tapé sur un autre appareil, il ne marche pas ; là où il a été demandé, si", async ({
  page,
  autreAppareil,
}, testInfo) => {
  const email = emailLibre(testInfo, "navigateur");
  await page.goto("/connexion");
  const depuis = await demanderCode(page, email);
  const code = await dernierCode(email, { depuis });

  await test.step("sur un autre appareil, le même email et le même code : refusé, et rien ne s’ouvre", async () => {
    const telephone = await autreAppareil();
    const essai = await telephone.request.post("/api/auth/verifier", { headers: origine(testInfo), data: { email, code } });
    expect(await essai.json()).toEqual({ ok: false });
    expect(await compteDe(email)).toBeNull();
  });

  await test.step("dans le navigateur qui l’a demandé : il ouvre la session", async () => {
    await saisirLeCodeRecu(page, email, depuis);
    await expect(page).toHaveURL(/\/commencer$/);
    expect(await compteDe(email)).toMatchObject({ plan: "gratuit" });
  });
});
