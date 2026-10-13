import type { Page, TestInfo } from "@playwright/test";
import { STORY_COOKIE } from "../../src/services/session";
import {
  attendreTaches,
  champDuChat,
  connecterParApi,
  debloquerLaConv,
  ecrireABlush,
  emailLibre,
  expect,
  fermerLaFeuille,
  filDuChat,
  histoiresDe,
  lectureFaite,
  lireUneConvParApi,
  messagesDeLHistoire,
  nouvelInvite,
  ouvrir,
  test,
} from "./aide";

/*
 * Plusieurs convs sur un compte : « Tes convs » (/app/convs) les liste, un toucher ouvre l’accueil de l’une, et il
 * s’ouvre encore sur elle ensuite ; Mon compte les liste aussi. Un geste vise toujours la conv à l’écran, même si un
 * autre onglet en a ouvert une autre entre-temps (l’en-tête x-blush-conv, src/services/session.ts).
 * Des comptes de l’équipe (des invités) : l’accueil s’ouvre sans le paiement ; un compte qui paie, pour une conv payée
 * à côté d’une autre qui ne l’est pas. Leurs convs sont préparées par les routes /api.
 * Une page n’est touchée qu’une fois prête aux gestes (ouvrir) : un toucher plus tôt suivrait le lien sans choisir la conv.
 */

const ROMANE = { toi: "Noé", autre: "Romane" };

/**
 * Un compte de l’équipe avec deux convs lues : Maëlys d’abord, puis Romane (la conv ouverte). Les deux lectures tournent en
 * même temps sur le serveur ; on attend la fin des deux (le chat d’une conv attend sa mémoire, la dernière étape).
 */
async function deuxConvs(page: Page, testInfo: TestInfo): Promise<{ email: string; maelys: string; romane: string }> {
  const email = await nouvelInvite(testInfo);
  await connecterParApi(page, testInfo, email);
  const maelys = await lireUneConvParApi(page, testInfo);
  const romane = await lireUneConvParApi(page, testInfo, { personnes: ROMANE });
  await attendreTaches(email);
  return { email, maelys, romane };
}

/** L’accueil montre bien la conv avec `autre` : son avatar, qui ouvre sa fiche. */
const accueilDe = (page: Page, autre: string) => page.getByRole("link", { name: new RegExp(`^${autre}, voir sa fiche`) });

test("une seule conv : pas de liste, l’accueil n’a pas de retour à « Tes convs »", async ({ page }, testInfo) => {
  const email = await nouvelInvite(testInfo);
  await connecterParApi(page, testInfo, email);
  await lireUneConvParApi(page, testInfo);
  await attendreTaches(email);

  await ouvrir(page, "/app/convs");
  await expect(page).toHaveURL(/\/app$/);
  await expect(accueilDe(page, "Maëlys")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Tes convs/ })).toHaveCount(0);
});

test("plusieurs convs : « Tes convs » les liste, un toucher ouvre l’accueil de l’autre, et il reste ouvert sur elle", async ({ page }, testInfo) => {
  /* Deux lectures complètes avant le premier écran : longues sur une machine chargée */
  test.slow();
  await deuxConvs(page, testInfo);

  await test.step("l’accueil s’ouvre sur la dernière lue, Romane, avec le retour à « Tes convs »", async () => {
    await ouvrir(page, "/app");
    await expect(accueilDe(page, "Romane")).toBeVisible();
    await page.getByRole("link", { name: "Tes convs (Maëlys)" }).click();
  });

  await test.step("« Tes convs » : les deux, la plus récente d’abord, chacune avec son verdict", async () => {
    await expect(page).toHaveURL(/\/app\/convs$/);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: "Tes convs" })).toBeVisible();
    /* « Romane : Vous êtes à deux doigts., aujourd’hui » (une espace insécable avant les deux-points ; le jour, lui, dépend de l’heure) */
    const convs = main.getByRole("link", { name: /\s: Vous êtes à deux doigts\., / });
    await expect(convs).toHaveCount(2);
    await expect(convs.nth(0)).toHaveAccessibleName(/^Romane\s: /);
    await expect(convs.nth(1)).toHaveAccessibleName(/^Maëlys\s: /);
    await expect(main.getByRole("link", { name: /^Analyser une autre conv/ })).toBeVisible();
    await convs.nth(1).click();
  });

  await test.step("un toucher sur Maëlys ouvre son accueil, et il s’ouvre encore sur elle ensuite", async () => {
    await expect(page).toHaveURL(/\/app$/);
    await expect(accueilDe(page, "Maëlys")).toBeVisible();
    await expect(page.getByRole("link", { name: "Tes convs (Romane)" })).toBeVisible();
    await ouvrir(page);
    await expect(accueilDe(page, "Maëlys")).toBeVisible();
  });

  await test.step("Mon compte : la conv ouverte, l’autre, et le geste qui efface vise celle qui est ouverte", async () => {
    await ouvrir(page, "/compte");
    const main = page.getByRole("main");
    const histoires = main.getByRole("region", { name: "Tes histoires" });
    await expect(histoires.getByRole("button", { name: "Maëlys et toi Ouverte sur l’accueil" })).toBeVisible();
    await expect(histoires.getByRole("button", { name: /^Romane et toi/ })).toBeVisible();
    await expect(histoires.getByRole("button", { name: /Ouverte sur l’accueil$/ })).toHaveCount(1);
    await expect(main.getByRole("region", { name: "Tes données" }).getByRole("button", { name: /^Supprimer l’histoire avec Maëlys/ })).toBeVisible();
  });

  await test.step("depuis Mon compte, un toucher sur Romane ouvre son accueil", async () => {
    await page
      .getByRole("main")
      .getByRole("region", { name: "Tes histoires" })
      .getByRole("button", { name: /^Romane et toi/ })
      .click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(accueilDe(page, "Romane")).toBeVisible();
    await expect(page.getByRole("link", { name: "Tes convs (Maëlys)" })).toBeVisible();
  });
});

test("une conv payée, l’autre pas : la landing mène à « Tes convs », le paiement de celle qui n’est pas payée y ramène, la payée s’ouvre sans lui", async ({ page }, testInfo) => {
  /* Deux lectures avant le premier écran ; un compte qui paie (pas de l’équipe) : le paiement s’ouvre sur l’accueil d’une conv pas débloquée */
  test.slow();
  const email = emailLibre(testInfo, "payee-et-pas");
  await lectureFaite(page, testInfo, email);
  await debloquerLaConv(email);
  await lireUneConvParApi(page, testInfo, { personnes: ROMANE });
  await attendreTaches(email);

  await test.step("la landing : « Retrouver ma conv » mène à « Tes convs » (Romane, ouverte, n’est pas payée), et de quoi en analyser une autre", async () => {
    await page.goto("/");
    await expect(page.getByRole("main").getByRole("link", { name: "Analyser une autre conv" }).first()).toHaveAttribute("href", "/commencer");
    await page.getByRole("main").getByRole("link", { name: "Retrouver ma conv" }).first().click();
    await expect(page).toHaveURL(/\/app\/convs$/);
  });

  await test.step("Romane : son accueil, le paiement par-dessus ; fermé sans payer, il ramène à « Tes convs »", async () => {
    await page
      .getByRole("main")
      .getByRole("link", { name: /^Romane\s: / })
      .click();
    await expect(page.getByRole("dialog", { name: "La suite parle de vous deux\u00a0: toi et Romane." })).toBeVisible();
    await fermerLaFeuille(page);
    await expect(page).toHaveURL(/\/app\/convs$/);
  });

  await test.step("Maëlys, payée : son accueil, sans paiement", async () => {
    await page
      .getByRole("main")
      .getByRole("link", { name: /^Maëlys\s: / })
      .click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(accueilDe(page, "Maëlys")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test("un geste vise la conv à l’écran, même quand un autre onglet en a ouvert une autre", async ({ page }, testInfo) => {
  test.slow();
  const { email, maelys, romane } = await deuxConvs(page, testInfo);
  /* Deux onglets du même navigateur : le cookie de la conv ouverte leur est commun */
  const ongletA = page;
  const ongletB = await page.context().newPage();

  await test.step("l’onglet A reste sur Romane ; l’onglet B ouvre Maëlys", async () => {
    await ouvrir(ongletA, "/app");
    await expect(accueilDe(ongletA, "Romane")).toBeVisible();
    await ouvrir(ongletB, "/app/convs");
    await ongletB.getByRole("link", { name: /^Maëlys\s: / }).click();
    await expect(ongletB).toHaveURL(/\/app$/);
    await expect(accueilDe(ongletB, "Maëlys")).toBeVisible();
  });

  await test.step("écrire à BLUSH depuis l’onglet A : l’échange va dans la conv de Romane, pas dans celle de Maëlys", async () => {
    const [avantMaelys, avantRomane] = [await messagesDeLHistoire(maelys), await messagesDeLHistoire(romane)];
    await ongletA.bringToFront();
    await champDuChat(ongletA).fill("tu crois qu’elle attend que je relance ?");
    await ongletA.getByRole("button", { name: "Envoyer" }).click();
    await expect(filDuChat(ongletA).getByText("elle te cherche 👀")).toBeVisible();
    /* Ton message et la réponse de BLUSH */
    await expect.poll(() => messagesDeLHistoire(romane)).toBe(avantRomane + 2);
    expect(await messagesDeLHistoire(maelys)).toBe(avantMaelys);
  });

  await test.step("supprimer depuis Mon compte, resté sur Maëlys pendant que l’onglet A rouvre Romane : c’est Maëlys qui part", async () => {
    await ouvrir(ongletB, "/compte");
    const supprimer = ongletB
      .getByRole("main")
      .getByRole("region", { name: "Tes données" })
      .getByRole("button", { name: /^Supprimer l’histoire avec Maëlys/ });
    await expect(supprimer).toBeVisible();
    await ouvrir(ongletA, "/app/convs");
    await ongletA.getByRole("link", { name: /^Romane\s: / }).click();
    await expect(ongletA).toHaveURL(/\/app$/);
    await expect(accueilDe(ongletA, "Romane")).toBeVisible();

    await ongletB.bringToFront();
    await supprimer.click();
    await ongletB.getByRole("dialog", { name: "Supprimer l’histoire avec Maëlys\u00a0?" }).getByRole("button", { name: "Supprimer l’histoire", exact: true }).click();
    /* Une autre conv reste : son accueil s’ouvre */
    await expect(ongletB).toHaveURL(/\/app$/);
    await expect(accueilDe(ongletB, "Romane")).toBeVisible();
    await expect(ongletB.getByRole("link", { name: /^Tes convs/ })).toHaveCount(0);
    expect((await histoiresDe(email)).map((h) => h.id)).toEqual([romane]);
  });
});

/*
 * Connecté sans brouillon (sans le cookie de la conv choisie) : l’accueil et sa fiche gardent ce qu’ils ont vu pendant la
 * visite sous l’identifiant de la conv affichée, tel que le serveur l’a résolu (idDeLaConv, src/services/serveur.ts),
 * jamais sous un cookie absent, qui vaudrait pour toutes les convs du compte.
 */
test("connecté sans cookie de conv : l’accueil de l’une ne montre rien de l’autre", async ({ page }, testInfo) => {
  test.slow();
  const { email } = await deuxConvs(page, testInfo);
  const question = "une question pour Romane, et rien que pour elle";

  await test.step("une nouvelle connexion, sans aucun cookie : l’accueil s’ouvre sur Romane, la dernière lue", async () => {
    await page.context().clearCookies();
    await connecterParApi(page, testInfo, email);
    expect((await page.context().cookies()).map((c) => c.name)).not.toContain(STORY_COOKIE);
    await ouvrir(page, "/app");
    await expect(accueilDe(page, "Romane")).toBeVisible();
  });

  await test.step("écrire à BLUSH sur Romane, puis passer par sa fiche", async () => {
    expect(await ecrireABlush(page, question)).toBe(200);
    await expect(filDuChat(page).getByText(question)).toBeVisible();
    await accueilDe(page, "Romane").click();
    await expect(page).toHaveURL(/\/app\/fiche$/);
    await expect(page.getByRole("heading", { level: 1, name: "Romane" })).toBeVisible();
    await page.goBack();
    await expect(accueilDe(page, "Romane")).toBeVisible();
    await expect(filDuChat(page).getByText(question)).toBeVisible();
  });

  await test.step("Maëlys, ouverte par « Tes convs » : ni le message de Romane, ni sa fiche", async () => {
    await page.getByRole("link", { name: "Tes convs (Maëlys)" }).click();
    await page.getByRole("link", { name: /^Maëlys\s: / }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(accueilDe(page, "Maëlys")).toBeVisible();
    await expect(filDuChat(page).getByText(question)).toHaveCount(0);
    await accueilDe(page, "Maëlys").click();
    await expect(page).toHaveURL(/\/app\/fiche$/);
    await expect(page.getByRole("heading", { level: 1, name: "Maëlys" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Romane" })).toHaveCount(0);
  });

  await test.step("revenue sur Romane : son échange y est toujours", async () => {
    await ouvrir(page, "/app/convs");
    await page.getByRole("link", { name: /^Romane\s: / }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(accueilDe(page, "Romane")).toBeVisible();
    await expect(filDuChat(page).getByText(question)).toBeVisible();
  });

  /* L’autre entrée qui change de conv : sa fiche, préchargée par l’accueil de Romane, ne doit pas s’ouvrir sur elle */
  await test.step("Maëlys, ouverte par « Mon compte » sans recharger la page : sa fiche est bien la sienne", async () => {
    await page.getByRole("link", { name: "Tes convs (Maëlys)" }).click();
    await expect(page).toHaveURL(/\/app\/convs$/);
    await page.getByRole("link", { name: "Mon compte" }).click();
    await expect(page).toHaveURL(/\/compte$/);
    await page
      .getByRole("main")
      .getByRole("region", { name: "Tes histoires" })
      .getByRole("button", { name: /^Maëlys et toi/ })
      .click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(accueilDe(page, "Maëlys")).toBeVisible();
    await expect(filDuChat(page).getByText(question)).toHaveCount(0);
    await accueilDe(page, "Maëlys").click();
    await expect(page).toHaveURL(/\/app\/fiche$/);
    await expect(page.getByRole("heading", { level: 1, name: "Maëlys" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Romane" })).toHaveCount(0);
  });
});
