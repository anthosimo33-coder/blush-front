import type { Page, TestInfo } from "@playwright/test";
import { AIDE_SANS_BULLES } from "@/contenu/aide";
import {
  attendreTaches,
  compteDe,
  debloquerLaConv,
  donnerDesBulles,
  emailLibre,
  expect,
  lectureComplete,
  lectureFaite,
  messagesDuChat,
  origine,
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

test("à 0 bulle, l’écran de « Ta question » : la réponse est prête, sans rien d’elle", async ({ page }, testInfo) => {
  await compteDebloque(page, testInfo);
  const rapport = await ouvrirLeRapport(page);
  await rapport.getByRole("link", { name: /^Poser ma question à BLUSH/ }).click();
  await page.getByRole("textbox", { name: "Ta question à BLUSH" }).fill(QUESTION);
  expect((await reponseAuGeste(page, { chemin: "/api/chat" }, () => page.getByRole("button", { name: "Poser ma question" }).click())).status()).toBe(200);
  const conv = page.getByRole("log", { name: "Ta conversation avec BLUSH" });
  await expect(conv.getByText("Ta réponse est prête")).toBeVisible();
  await expect(conv.getByText("Recharge tes bulles pour la lire\u00a0: elle t’attend dans ton chat avec BLUSH.")).toBeVisible();
  await expect(conv.getByText("elle te cherche 👀")).toHaveCount(0);
});
