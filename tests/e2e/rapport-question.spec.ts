import type { Page, TestInfo } from "@playwright/test";
import { attendreTaches, definirPlan, emailLibre, expect, lectureBlushPlus, lectureFaite, ouvrirLeRapport, PAIEMENT, reponseAuGeste, test } from "./aide";

/*
 * « Ta question » (/rapport/question), depuis le rapport complet : BLUSH accueille, propose des idées tirées du rapport
 * (les questions de la mémoire), puis répond en bulles. La question passe par le chat : le modèle
 * factice répond « elle te cherche 👀 », « et toi tu fais le mec occupé », puis demande « tu lui as répondu quoi ? ».
 */

const IDEES = ["pourquoi elle vanne ?", "je relance trop ?", "samedi je fais quoi ?", "qui craque en premier ?"];
/* Une question inventée, comme un utilisateur l’écrirait */
const QUESTION = "elle m’a dit on verra pour dimanche, ça veut dire non ?";

test("BLUSH+ : ta question, une idée tirée du rapport, puis la réponse de BLUSH, gardée dans le chat", async ({ page }, testInfo) => {
  await lectureBlushPlus(page, testInfo);
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
 * Un compte « rapport » (le rapport complet acheté une fois, donné par `npm run acces -- <email> rapport`) dont la conv
 * est lue : l’accès arrive après le verdict, le rapport s’écrit à la première ouverture.
 */
async function compteRapport(page: Page, testInfo: TestInfo): Promise<string> {
  const email = emailLibre(testInfo, "question-rapport");
  await lectureFaite(page, testInfo, email);
  await definirPlan(email, "rapport");
  /* Ouvrir le rapport lance son écriture (l’accès donné après le verdict) */
  await ouvrirLeRapport(page);
  await attendreTaches(email);
  return email;
}

test("compte « rapport » : le rapport complet, une question incluse, mais pas le chat (réservé à BLUSH+)", async ({ page }, testInfo) => {
  await compteRapport(page, testInfo);
  const rapport = await ouvrirLeRapport(page);

  await test.step("les huit chapitres sont ouverts, et l’en-tête dit « Complet »", async () => {
    await expect(rapport.getByText("Complet", { exact: true })).toBeVisible();
    await expect(rapport.getByRole("region", { name: /^Chapitre \d : / })).toHaveCount(8);
    await expect(rapport.getByRole("region", { name: "Chapitre 8 : Chapitre 8" }).getByText("Et voilà.")).toBeVisible();
    await expect(rapport.getByRole("button", { name: /\(verrouillé\)$/ })).toHaveCount(0);
    await expect(rapport.getByRole("button", { name: "Lire la suite" })).toHaveCount(0);
  });

  await test.step("une question incluse avec le rapport ; le bouton du chat, mais pas sa bulle", async () => {
    await expect(rapport.getByRole("link", { name: /^Poser ma question à BLUSH/ })).toContainText("Une question incluse avec ton rapport");
    /* Le bouton du bas seulement : la bulle du chat (en bas à droite) est celle de BLUSH+ */
    await expect(page.getByRole("link", { name: "Parler à BLUSH" })).toHaveCount(1);
  });

  await test.step("« Parler à BLUSH » ouvre le chat sous le paiement de BLUSH+, sa seule offre (le rapport est déjà à lui)", async () => {
    await page.getByRole("link", { name: "Parler à BLUSH" }).click();
    await expect(page).toHaveURL(/\/app\?depuis=rapport$/);
    const paiement = page.getByRole("dialog", { name: "BLUSH+", exact: true });
    await expect(paiement).toBeVisible();
    await expect(paiement.getByRole("radio")).toHaveCount(1);
    await expect(paiement.getByRole("radio", { name: /^BLUSH\+ · / })).toBeChecked();
    await expect(page.getByRole("dialog", { name: PAIEMENT })).toHaveCount(0);
  });
});

/*
 * Bug : un compte « rapport » voit « Une question incluse avec ton rapport » et « 1 question incluse », mais sa question
 * est refusée : elle passe par le chat, réservé à BLUSH+ (src/app/api/chat/route.ts, `utilisateur.plan !== "blushplus"`
 * → 402 « acces »), et l’écran répond « le chat avec moi, c’est dans BLUSH+ » (souciQuestion, le texte de « acces » dans src/lib/messages-erreur.ts).
 */
test.fixme("compte « rapport » : la question incluse avec le rapport reçoit sa réponse", async ({ page }, testInfo) => {
  await compteRapport(page, testInfo);
  const rapport = await ouvrirLeRapport(page);
  await rapport.getByRole("link", { name: /^Poser ma question à BLUSH/ }).click();
  await expect(page.getByText("1 question incluse")).toBeVisible();
  await page.getByRole("textbox", { name: "Ta question à BLUSH" }).fill(QUESTION);
  await page.getByRole("button", { name: "Poser ma question" }).click();
  const conv = page.getByRole("log", { name: "Ta conversation avec BLUSH" });
  await expect(conv.getByText("elle te cherche 👀")).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});
