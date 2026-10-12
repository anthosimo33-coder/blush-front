import type { Page, TestInfo } from "@playwright/test";
import { AIDE_SANS_BULLES, URGENCES } from "@/contenu/aide";
import {
  attendreTaches,
  compteDe,
  debloquerLaConv,
  donnerDesBulles,
  emailLibre,
  expect,
  filDuChat,
  lectureComplete,
  lectureFaite,
  messagesDuChat,
  origine,
  ouvrir,
  ouvrirLeRapport,
  PAIEMENT,
  RESEAU,
  reponseAuGeste,
  test,
} from "./aide";

/*
 * « Ta question » (/rapport/question), depuis le rapport complet : BLUSH accueille, propose des idées tirées du rapport
 * (les questions de la mémoire), puis répond en bulles. La question passe par le chat : le modèle
 * factice répond « elle te cherche 👀 », « et toi tu fais le mec occupé », puis demande « tu lui as répondu quoi ? ».
 */

const IDEES = ["pourquoi elle vanne ?", "je relance trop ?", "samedi je fais quoi ?", "qui craque en premier ?"];
/* Une question inventée, comme un utilisateur l’écrirait */
const QUESTION = "elle m’a dit on verra pour dimanche, ça veut dire non ?";
/* La première bulle de chaque réponse du modèle factice : la compter dit si une réponse verrouillée a laissé son texte */
const PREMIERE_BULLE = "elle te cherche 👀";

/** Le compteur de bulles en haut de l’écran (à côté du retour sur iPhone, de « Mon compte » sur ordinateur) : `n` bulles. */
const compteur = (page: Page, n: number | string) => page.getByRole("button", { name: `Tes bulles\u00a0: ${n}`, exact: true });

test("un compte de l’équipe : ta question, une idée tirée du rapport, puis la réponse de BLUSH, gardée dans le chat", async ({ page }, testInfo) => {
  await lectureComplete(page, testInfo);
  const rapport = await ouvrirLeRapport(page);
  const conv = page.getByRole("log", { name: "Ta conversation avec BLUSH" });
  const champ = page.getByRole("textbox", { name: "Ta question à BLUSH" });
  const envoyer = page.getByRole("button", { name: "Poser ma question" });

  await test.step("le rapport mène à « Ta question » : BLUSH accueille, avec le compte de vos messages", async () => {
    await rapport.getByRole("link", { name: "Poser ma question à BLUSH" }).click();
    await expect(page).toHaveURL(/\/rapport\/question$/);
    await expect(conv.getByText("une question sur vous deux\u00a0? balance")).toBeVisible();
    await expect(conv.getByText("je te réponds avec vos 64 messages, preuves à l’appui")).toBeVisible();
    await expect(envoyer).toBeDisabled();
    /* L’équipe : des bulles illimitées, au compteur comme dans le chat */
    await expect(compteur(page, "illimitées")).toHaveText("∞");
  });

  await test.step("les idées tirées du rapport : un toucher met l’idée dans le champ, sans l’envoyer", async () => {
    const idees = page.getByRole("group", { name: "Des idées, tirées de ton rapport" }).getByRole("button");
    await expect(idees).toHaveText(IDEES);
    const idee = idees.filter({ hasText: "samedi je fais quoi ?" });
    await idee.click();
    await expect(idee).toHaveAttribute("aria-pressed", "true");
    await expect(champ).toHaveValue("samedi je fais quoi ?");
    await expect(envoyer).toBeEnabled();
    await expect(conv.getByText("samedi je fais quoi ?")).toHaveCount(0);
    /* Un second toucher la retire */
    await idee.click();
    await expect(idee).toHaveAttribute("aria-pressed", "false");
    await expect(champ).toHaveValue("");
    await expect(envoyer).toBeDisabled();
  });

  await test.step("sa propre question, envoyée : BLUSH répond en bulles, preuve et confiance comprises", async () => {
    await champ.fill(QUESTION);
    expect((await reponseAuGeste(page, { chemin: "/api/chat" }, () => envoyer.click())).status()).toBe(200);
    await expect(conv.getByText(QUESTION)).toBeVisible();
    await expect(conv.getByText("elle te cherche 👀")).toBeVisible();
    await expect(conv.getByText("Ce que je vois")).toBeVisible();
    await expect(conv.getByText("et toi tu fais le mec occupé")).toBeVisible();
    await expect(conv.getByText("Probable", { exact: true })).toBeVisible();
    await expect(conv.getByText("tu lui as répondu quoi ?")).toBeVisible();
    /* Jamais débitée : ni reçu sous la réponse, et le compteur reste illimité */
    await expect(conv.locator("[data-recu]")).toHaveCount(0);
    await expect(compteur(page, "illimitées")).toBeVisible();
    /* Une seule question ici : le champ et les idées s’effacent, place à la suite */
    await expect(champ).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Des idées, tirées de ton rapport" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Retour au rapport" })).toHaveAttribute("href", "/rapport");
  });

  await test.step("la question passe par le chat : l’échange y est, à la suite", async () => {
    await page.getByRole("link", { name: "Continuer dans ton chat avec BLUSH" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText(QUESTION)).toBeVisible();
    await expect(page.getByText("elle te cherche 👀").first()).toBeVisible();
  });
});

/**
 * Un compte qui paie (pas de l’équipe) dont la conv est lue, puis son rapport débloqué, comme un achat livré : le rapport
 * s’écrit à la première ouverture.
 */
async function compteDebloque(page: Page, testInfo: TestInfo): Promise<string> {
  const email = emailLibre(testInfo, "question-debloque");
  await lectureFaite(page, testInfo, email);
  await debloquerLaConv(email);
  /* Ouvrir le rapport lance son écriture (débloqué après le verdict) */
  await ouvrirLeRapport(page);
  await attendreTaches(email);
  return email;
}

test("un rapport débloqué (un achat) : le rapport complet, « Ta question » et le chat à portée", async ({ page }, testInfo) => {
  await compteDebloque(page, testInfo);
  const rapport = await ouvrirLeRapport(page);

  await test.step("les huit chapitres sont ouverts, et l’en-tête dit « Complet »", async () => {
    await expect(rapport.getByText("Complet", { exact: true })).toBeVisible();
    await expect(rapport.getByRole("region", { name: /^Chapitre \d : / })).toHaveCount(8);
    await expect(rapport.getByRole("region", { name: "Chapitre 8 : Chapitre 8" }).getByText("Et voilà.")).toBeVisible();
    await expect(rapport.getByRole("button", { name: /\(verrouillé\)$/ })).toHaveCount(0);
    await expect(rapport.getByRole("button", { name: "Lire la suite" })).toHaveCount(0);
  });

  await test.step("« Ta question », sans question incluse ; le chat, par son bouton et par sa bulle", async () => {
    await expect(rapport.getByRole("link", { name: /^Poser ma question à BLUSH/ })).toBeVisible();
    await expect(page.getByText("Une question incluse avec ton rapport")).toHaveCount(0);
    await expect(rapport.getByRole("link", { name: "Parler à BLUSH" }).first()).toHaveAttribute("href", "/app?depuis=rapport");
    /* La bulle du chat (en bas à droite) : celle d’un rapport débloqué */
    await expect(page.locator("a[aria-label='Parler à BLUSH']")).toHaveCount(1);
  });

  await test.step("« Parler à BLUSH » ouvre le chat, sans paiement", async () => {
    await rapport.getByRole("link", { name: "Parler à BLUSH" }).first().click();
    await expect(page).toHaveURL(/\/app\?depuis=rapport$/);
    await expect(page.getByRole("dialog", { name: PAIEMENT })).toHaveCount(0);
  });
});

/*
 * « Ta question » est une réponse du chat comme une autre (plus de question incluse) : une bulle, et l’échange est gardé
 * dans le chat. À 0 bulle, la réponse s’écrit, verrouillée (rien d’elle n’arrive) ; une autre attend déjà : « bulles ».
 */
test("un rapport débloqué, 1 bulle : ta question reçoit sa réponse ; la suivante s’écrit verrouillée, la troisième attend", async ({ page }, testInfo) => {
  const email = await compteDebloque(page, testInfo);
  await donnerDesBulles(email, 1);
  const rapport = await ouvrirLeRapport(page);
  await rapport.getByRole("link", { name: /^Poser ma question à BLUSH/ }).click();
  await expect(page).toHaveURL(/\/rapport\/question$/);
  await expect(page.getByText("1 question incluse")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Ta question à BLUSH" }).fill(QUESTION);
  expect((await reponseAuGeste(page, { chemin: "/api/chat" }, () => page.getByRole("button", { name: "Poser ma question" }).click())).status()).toBe(200);
  const conv = page.getByRole("log", { name: "Ta conversation avec BLUSH" });
  await expect(conv.getByText("elle te cherche 👀")).toBeVisible();
  await expect(conv.getByText("tu lui as répondu quoi ?")).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  /* La suite, c’est le chat ; l’échange y est gardé, à la suite */
  await expect(page.getByRole("link", { name: "Continuer dans ton chat avec BLUSH" })).toBeVisible();
  expect(await messagesDuChat(email)).toEqual(["toi", "blush"]);
  expect(await compteDe(email)).toMatchObject({ bulles: 0 });

  /* Une deuxième question, posée par la route comme le fait l’écran (marquée `question`), à 0 bulle : écrite, verrouillée */
  const question = (texte: string) => page.request.post("/api/chat", { headers: origine(testInfo), data: { texte, question: true }, timeout: RESEAU });
  const seconde = await question("et samedi, je fais quoi ?");
  expect(seconde.status()).toBe(200);
  expect(await seconde.text()).not.toContain("elle te cherche");
  expect(await messagesDuChat(email)).toEqual(["toi", "blush", "toi", "blush"]);
  /* La troisième : une réponse verrouillée attend déjà, rien ne part */
  const troisieme = await question("et dimanche ?");
  expect([troisieme.status(), await troisieme.json()]).toEqual([402, { erreur: "bulles", aide: AIDE_SANS_BULLES }]);
  expect(await messagesDuChat(email)).toHaveLength(4);
});

/** Rien ne déborde sur le côté, et `geste` se laisse amener entièrement à l’écran (au pixel près). */
async function tientALEcran(page: Page, geste: ReturnType<Page["getByRole"]>, quoi: string): Promise<void> {
  const { large, ecranLarge } = await page.evaluate(() => ({ large: document.documentElement.scrollWidth, ecranLarge: window.innerWidth }));
  expect(large, `${quoi} : la largeur de la page (l’écran fait ${ecranLarge} px)`).toBeLessThanOrEqual(ecranLarge);
  await geste.scrollIntoViewIfNeeded();
  await expect(geste, `${quoi} : à l’écran`).toBeInViewport({ ratio: 0.98 });
}

/*
 * Les bulles sur « Ta question », avec les pièces du chat : le compteur en haut, « 1 bulle · il t’en reste N » sous la
 * réponse, « C’est quoi une bulle ? » et la recharge. Sur un petit iPhone (375 × 667), dans les deux navigateurs.
 */
test("un rapport débloqué, 10 bulles : « 1 bulle · il t’en reste 9 » sous la réponse, le compteur à 9 ; il mène à la recharge ; tout tient en 375 × 667", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const email = await compteDebloque(page, testInfo);
  await donnerDesBulles(email, 10);
  const conv = page.getByRole("log", { name: "Ta conversation avec BLUSH" });

  await test.step("le compteur, en haut à côté du retour, le titre au centre", async () => {
    const rapport = await ouvrirLeRapport(page);
    await rapport.getByRole("link", { name: /^Poser ma question à BLUSH/ }).click();
    await expect(page).toHaveURL(/\/rapport\/question$/);
    await expect(compteur(page, 10)).toHaveText("10");
    const retour = (await page.getByRole("link", { name: "Retour", exact: true }).boundingBox())!;
    const bulles = (await compteur(page, 10).boundingBox())!;
    const titre = (await page.locator("header").getByText("Ta question", { exact: true }).boundingBox())!;
    expect(bulles.x, "le compteur suit le retour").toBeGreaterThanOrEqual(retour.x + retour.width);
    expect(Math.abs(bulles.y + bulles.height / 2 - (retour.y + retour.height / 2)), "sur la même ligne").toBeLessThanOrEqual(2);
    expect(Math.abs(titre.x + titre.width / 2 - 375 / 2), "le titre au centre de la barre").toBeLessThanOrEqual(2);
    await tientALEcran(page, page.getByRole("textbox", { name: "Ta question à BLUSH" }), "le champ");
  });

  await test.step("la question coûte une bulle : le reçu sous la réponse, et le compteur suit", async () => {
    await page.getByRole("textbox", { name: "Ta question à BLUSH" }).fill(QUESTION);
    expect((await reponseAuGeste(page, { chemin: "/api/chat" }, () => page.getByRole("button", { name: "Poser ma question" }).click())).status()).toBe(200);
    await expect(conv.getByText(PREMIERE_BULLE)).toBeVisible();
    await expect(conv.locator("[data-recu]")).toHaveText("1 bulle · il t’en reste 9");
    await expect(compteur(page, 9)).toHaveText("9");
    await expect(compteur(page, 10)).toHaveCount(0);
    expect(await compteDe(email)).toMatchObject({ bulles: 9 });
    await tientALEcran(page, conv.locator("[data-recu]"), "le reçu");
    await tientALEcran(page, page.getByRole("link", { name: "Retour au rapport" }), "« Retour au rapport »");
  });

  await test.step("le compteur ouvre « C’est quoi une bulle ? », d’où l’on recharge", async () => {
    await compteur(page, 9).click();
    const bulle = page.getByRole("dialog", { name: "C’est quoi une bulle\u00a0?" });
    await bulle.getByRole("button", { name: "Recharger · il t’en reste 9" }).click();
    const recharge = page.getByRole("dialog", { name: "Recharge tes bulles" });
    await expect(recharge.getByText("Elles n’expirent jamais.")).toBeVisible();
    await expect(bulle).toBeHidden();
    await expect(recharge.getByRole("button", { name: /^Payer · / })).toBeInViewport();
  });

  await test.step("la réponse est gardée dans le chat, et son compteur dit 9", async () => {
    await ouvrir(page, "/app");
    await expect(compteur(page, 9)).toBeVisible();
    await expect(filDuChat(page).getByText(QUESTION)).toBeVisible();
  });
});

test("à 0 bulle, l’écran de « Ta question » : la réponse est prête, sans rien d’elle ; « Recharger pour la lire », puis payée, elle se lit dans le chat", async ({
  page,
}, testInfo) => {
  test.slow();
  const email = await compteDebloque(page, testInfo);
  const rapport = await ouvrirLeRapport(page);
  await rapport.getByRole("link", { name: /^Poser ma question à BLUSH/ }).click();
  await expect(compteur(page, 0)).toHaveText("0");
  await page.getByRole("textbox", { name: "Ta question à BLUSH" }).fill(QUESTION);
  expect((await reponseAuGeste(page, { chemin: "/api/chat" }, () => page.getByRole("button", { name: "Poser ma question" }).click())).status()).toBe(200);
  const conv = page.getByRole("log", { name: "Ta conversation avec BLUSH" });
  const recharge = page.getByRole("dialog", { name: "Recharge tes bulles" });

  await test.step("la réponse est prête, sans rien d’elle, ni reçu", async () => {
    await expect(conv.getByText("Ta réponse est prête")).toBeVisible();
    await expect(conv.getByText("Recharge tes bulles pour la lire\u00a0: elle t’attend dans ton chat avec BLUSH.")).toBeVisible();
    await expect(conv.getByText(PREMIERE_BULLE)).toHaveCount(0);
    await expect(conv.locator("[data-recu]")).toHaveCount(0);
    await expect(compteur(page, 0)).toBeVisible();
  });

  await test.step("« Recharger pour la lire » ouvre la recharge, qui la rappelle (avec le bonus de la première recharge, ④)", async () => {
    await conv.getByRole("button", { name: "Recharger pour la lire" }).click();
    await expect(recharge.getByText("Ta réponse à Maëlys s’affiche dès que c’est payé.")).toBeVisible();
    await expect(recharge.getByText("Ta 1re recharge\u00a0: +40 offertes")).toBeVisible();
  });

  await test.step("payée au faux Whop : le retour mène au chat, qui lit la réponse prête", async () => {
    await recharge.getByRole("checkbox", { name: "Je veux mes bulles tout de suite et je renonce à mon droit de rétractation" }).check();
    await recharge.getByRole("button", { name: "Payer · 9,90\u00a0€" }).click();
    await page.waitForURL(/\/paiement\/factice\?achat=/, { timeout: RESEAU });
    await page.getByRole("button", { name: "Payer", exact: true }).click();
    await page.waitForURL((u) => u.pathname === "/app" && !u.search.includes("recharge"), { timeout: 2 * RESEAU });
    await expect(page.getByRole("status").filter({ hasText: "+120 bulles, ta réponse est là" })).toBeVisible();
    const fil = filDuChat(page);
    await expect(fil.getByText(QUESTION)).toBeVisible();
    await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(1);
    await expect(fil.locator("[data-verrouillee]")).toHaveCount(0);
    await expect(fil.getByText("1 bulle · il t’en reste 119")).toBeVisible();
    await expect(compteur(page, 119)).toBeVisible();
    expect(await compteDe(email)).toMatchObject({ bulles: 119 });
  });
});

test("à 0 bulle, une réponse prête attend déjà : la question est refusée (402 « bulles »), la recharge s’ouvre, et le souci garde ses numéros d’aide", async ({
  page,
}, testInfo) => {
  const email = await compteDebloque(page, testInfo);
  /* Une réponse écrite à 0 bulle attend déjà la recharge (une question posée par la route, comme le fait l’écran) */
  const avant = await page.request.post("/api/chat", { headers: origine(testInfo), data: { texte: "et samedi, je fais quoi ?", question: true }, timeout: RESEAU });
  expect(avant.status()).toBe(200);
  await ouvrir(page, "/rapport/question");
  const champ = page.getByRole("textbox", { name: "Ta question à BLUSH" });
  await champ.fill(QUESTION);
  expect((await reponseAuGeste(page, { chemin: "/api/chat" }, () => page.getByRole("button", { name: "Poser ma question" }).click())).status()).toBe(402);
  const recharge = page.getByRole("dialog", { name: "Recharge tes bulles" });
  const souci = page.getByRole("main").getByRole("alert");

  await test.step("la recharge s’ouvre d’elle-même, comme dans le chat", async () => {
    await expect(recharge.getByText("Elles n’expirent jamais.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(recharge).toBeHidden();
  });

  await test.step("le souci dit les numéros d’aide (le message n’a atteint personne) ; la question revient dans le champ ; réécrite, le souci reste", async () => {
    await expect(souci).toContainText(URGENCES);
    await expect(champ).toHaveValue(QUESTION);
    await champ.fill("et dimanche, alors ?");
    await expect(souci).toContainText(URGENCES);
    expect(await messagesDuChat(email)).toHaveLength(2);
  });

  await test.step("« Recharger » rouvre la recharge", async () => {
    await souci.getByRole("button", { name: "Recharger" }).click();
    await expect(recharge.getByRole("button", { name: /^Payer · / })).toBeVisible();
  });
});
