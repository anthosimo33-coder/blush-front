import type { Page, TestInfo } from "@playwright/test";
import { attendreTaches, champDuChat, connecterParApi, expect, histoiresDe, lireUneConvParApi, messagesDeLHistoire, nouvelInvite, ouvrir, test } from "./aide";

/*
 * Plusieurs convs sur un compte : « Tes convs » (/app/convs) les liste, un toucher ouvre l’accueil de l’une, et il
 * s’ouvre encore sur elle ensuite ; Mon compte les liste aussi. Un geste vise toujours la conv à l’écran, même si un
 * autre onglet en a ouvert une autre entre-temps (l’en-tête x-blush-conv, src/services/session.ts).
 * Des comptes BLUSH+ (des invités) : l’accueil s’ouvre sans le paiement. Leurs convs sont préparées par les routes /api.
 * Une page n’est touchée qu’une fois prête aux gestes (ouvrir) : un toucher plus tôt suivrait le lien sans choisir la conv.
 */

const ROMANE = { toi: "Noé", autre: "Romane" };

/**
 * Un compte BLUSH+ avec deux convs lues : Maëlys d’abord, puis Romane (la conv ouverte). Les deux lectures tournent en
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
  /* Deux lectures BLUSH+ complètes avant le premier écran : longues sur une machine chargée */
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
    await page.getByRole("main").getByRole("region", { name: "Tes histoires" }).getByRole("button", { name: /^Romane et toi/ }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(accueilDe(page, "Romane")).toBeVisible();
    await expect(page.getByRole("link", { name: "Tes convs (Maëlys)" })).toBeVisible();
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
    await expect(ongletA.getByRole("log", { name: "Ta conv avec BLUSH" }).getByText("elle te cherche 👀")).toBeVisible();
    /* Ton message et la réponse de BLUSH */
    await expect.poll(() => messagesDeLHistoire(romane)).toBe(avantRomane + 2);
    expect(await messagesDeLHistoire(maelys)).toBe(avantMaelys);
  });

  await test.step("supprimer depuis Mon compte, resté sur Maëlys pendant que l’onglet A rouvre Romane : c’est Maëlys qui part", async () => {
    await ouvrir(ongletB, "/compte");
    const supprimer = ongletB.getByRole("main").getByRole("region", { name: "Tes données" }).getByRole("button", { name: /^Supprimer l’histoire avec Maëlys/ });
    await expect(supprimer).toBeVisible();
    await ouvrir(ongletA, "/app/convs");
    await ongletA.getByRole("link", { name: /^Romane\s: / }).click();
    await expect(ongletA).toHaveURL(/\/app$/);
    await expect(accueilDe(ongletA, "Romane")).toBeVisible();

    await ongletB.bringToFront();
    await supprimer.click();
    await ongletB.getByRole("dialog", { name: "Supprimer l’histoire avec Maëlys ?" }).getByRole("button", { name: "Supprimer l’histoire", exact: true }).click();
    /* Une autre conv reste : son accueil s’ouvre */
    await expect(ongletB).toHaveURL(/\/app$/);
    await expect(accueilDe(ongletB, "Romane")).toBeVisible();
    await expect(ongletB.getByRole("link", { name: /^Tes convs/ })).toHaveCount(0);
    expect((await histoiresDe(email)).map((h) => h.id)).toEqual([romane]);
  });
});
