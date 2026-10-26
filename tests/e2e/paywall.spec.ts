import {
  attendreLecture,
  CARTE,
  compteDe,
  dernierCode,
  emailLibre,
  expect,
  exportWhatsApp,
  jusquAuCode,
  CASE_DE_LA_ROUE,
  OFFRE_SUITE,
  paieEnPetitEcran,
  payerParCarte,
  quitterPuisRevenir,
  refuserLaRoue,
  RESEAU,
  ROUE,
  saisirCode,
  sql,
  tachesDe,
  test,
  tientEnPetitEcran,
} from "./aide";
import { CASES_DE_LA_ROUE } from "../../src/contenu/roue";

/*
 * Le paywall avant toute lecture (décidé le 16 octobre), de bout en bout, comme un nouveau venu : l’import, « Qui
 * es-tu ? », le code reçu par email, puis la lecture, que le code déroule seul (rien ne part au modèle), « Voir mon
 * rapport », le paywall prime (les deux formules et le bouton qui paie) et sa roue des cadeaux par-dessus (au bout de 5 s
 * ou à la moitié de la page, jamais sur la carte ; refusée, ou tournée), « Qu’est-ce qui coince ? » (la carte refermée
 * sans payer, le retour sur l’onglet) et l’offre ① après « C’est trop cher » (sans lot gagné ; avec, le rapport seul), le
 * paiement au faux Whop, « C’est débloqué » (le rapport entier), puis la vraie lecture et le verdict.
 */

/** « Qu’est-ce qui coince ? » (FeuilleQuiCoince) : le titre de sa feuille. */
const QUESTION = "Qu’est-ce qui coince\u00a0?";
/** Les verdicts écrits pour les convs de ce compte : aucun tant que rien n’est payé (le modèle n’a rien lu). */
const verdictsEcrits = async (email: string) =>
  (
    await sql()<{ n: number }[]>`
    select count(*)::int as n from verdicts v join stories s on s.id = v.story_id join users u on u.id = s.user_id where u.email = ${email.toLowerCase()}`
  )[0]!.n;

test("un nouveau venu : la lecture du code, le paywall, payé, puis la vraie lecture et son verdict", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "paywall");
  const depuis = await jusquAuCode(page, exportWhatsApp(testInfo), email);
  expect(await saisirCode(page, await dernierCode(email, { depuis }))).toBe(true);

  await test.step("la lecture se déroule sans le modèle : « Voir mon rapport » mène au paywall, rien n’est payé ni lu", async () => {
    expect(await attendreLecture(page, { paywall: "garder" })).toBe("paywall");
    expect((await tachesDe(email)).map((t) => [t.genre, t.statut])).toEqual([["verdict", "paiement"]]);
    expect(await verdictsEcrits(email)).toBe(0);
    expect(await compteDe(email)).toMatchObject({ bulles: 0, debloquees: 0 });
  });

  await test.step("« Voir mon rapport » : le paywall prime, sans la roue ; ses 5 s passées sur la carte qu’on remplit, elle attend qu’on en sorte, puis refusée", async () => {
    await page.getByRole("button", { name: "Voir mon rapport" }).click();
    const ecran = page.getByRole("main");
    await expect(ecran.getByRole("heading", { level: 1 })).toBeVisible({ timeout: RESEAU });
    /* Le 21 octobre : plus à l’arrivée, mais au bout de 5 s (ou à la moitié de la page), et jamais sur la carte */
    await expect(page.getByRole("dialog", { name: ROUE })).toHaveCount(0);
    await ecran.getByRole("button", { name: "Débloquer · 19,90\u00a0€" }).click();
    const carte = page.getByRole("dialog", { name: CARTE });
    await expect(carte).toBeVisible();
    await page.waitForTimeout(6_000);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await carte.getByRole("button", { name: "Revenir" }).click();
    await expect(page.getByRole("dialog", { name: ROUE })).toBeVisible({ timeout: RESEAU });
    await expect(carte).toHaveCount(0);
    await tientEnPetitEcran(page, "la roue");
    await refuserLaRoue(page);
  });

  await test.step("le paywall prime : les deux formules aux prix du 23 octobre, Premium choisie d’avance", async () => {
    const ecran = page.getByRole("main");
    /* Sur téléphone, la première section est rangée comme une fiche produit (22 octobre) : les messages lus et la note passent dans l’en-tête des aperçus du rapport */
    const telephone = page.viewportSize()!.width < 1024;
    /* Le titre : la première trouvaille du code, qui nomme l’autre */
    await expect(ecran.getByRole("heading", { level: 1 })).toContainText("Maëlys");
    await expect(ecran.getByText(telephone ? /^.+ messages lus · 8 chapitres \+ ton vocal$/ : /^Ton rapport · .+ messages lus$/)).toBeVisible();
    await expect(ecran.getByRole("radio", { name: /^Le rapport/ })).toContainText("9,90\u00a0€");
    const premium = ecran.getByRole("radio", { name: /Premium/ });
    await expect(premium).toContainText("19,90\u00a0€");
    /* La formule « après » (17 octobre) : ni prix barré ni écart écrit, ses réponses dont les offertes (celles du rapport, sans prix barré) */
    await expect(premium).not.toContainText("24,80");
    await expect(premium).not.toContainText("pour 6");
    await expect(premium).toContainText("25 réponses, dont 3 offertes");
    /* Sans prix barré sur ses offertes, pas de « 0 € » : il se lirait comme le prix de ses 25 réponses */
    await expect(premium).not.toContainText(/(?<![\d,])0\u00a0€/);
    /* Le nom du rapport : l’en-tête des aperçus sur téléphone, la carte du paiement sur ordinateur */
    await expect(ecran.getByText("Ton rapport sur Maëlys", { exact: true }).filter({ visible: true })).toHaveCount(1);
    /* Retirée le 22 octobre : la ligne « Paiement unique · … jamais prévenue » sous le bouton */
    await expect(ecran.getByText(/^Paiement unique · /)).toHaveCount(0);
    await expect(premium).toHaveAttribute("aria-checked", "true");
    await expect(ecran.getByRole("button", { name: "Débloquer · 19,90\u00a0€" })).toBeVisible();
    await expect(ecran.getByText(/Tu économises|Ton verdict arrive/)).toHaveCount(0);
    await expect(
      telephone ? ecran.getByText("654 avis", { exact: true }).filter({ visible: true }) : ecran.getByText(/4,8 · 654 avis · déjà 1,2\u00a0million de messages lus$/),
    ).toBeVisible();
    await paieEnPetitEcran(page, "Débloquer · 19,90\u00a0€");
    expect(await verdictsEcrits(email)).toBe(0);
  });

  await test.step("la carte refermée sans payer (l’onglet quitté et retrouvé pendant qu’on la remplit) : « Qu’est-ce qui coince ? », jamais sur la carte ; « C’est trop cher » : l’offre ①", async () => {
    /* Le 21 octobre, l’offre ① couvrait la carte 19 s après « Débloquer » : rien ne vient pendant le paiement */
    await page.getByRole("main").getByRole("button", { name: "Débloquer · 19,90\u00a0€" }).click();
    const carte = page.getByRole("dialog", { name: CARTE });
    await expect(carte).toBeVisible();
    await quitterPuisRevenir(page);
    await page.waitForTimeout(1000);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(carte).toBeVisible();
    await carte.getByRole("button", { name: "Revenir" }).click();
    /* Depuis le 26 octobre, l’offre ① ne vient plus d’elle-même : la question d’abord, et l’offre seulement après « trop cher » */
    const question = page.getByRole("dialog", { name: QUESTION });
    await expect(question).toBeVisible();
    await expect(carte).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: OFFRE_SUITE })).toHaveCount(0);
    for (const reponse of ["C’est trop cher", "J’ai pas confiance", "Pas maintenant", "Ça a bugué", "Passer"])
      await expect(question.getByRole("button", { name: reponse })).toBeVisible();
    await question.getByRole("button", { name: "C’est trop cher" }).click();
    await expect(page.getByRole("dialog", { name: OFFRE_SUITE })).toBeVisible({ timeout: RESEAU });
    await expect(question).toHaveCount(0);
  });

  await test.step("l’offre ①, « Offre unique sur ton rapport », une fois ; « Non merci »", async () => {
    const offre = page.getByRole("dialog", { name: OFFRE_SUITE });
    await expect(offre).toBeVisible();
    await expect(offre.getByRole("button", { name: "Je le prends · 6,90\u00a0€" })).toBeVisible();
    await offre.getByRole("button", { name: "Non merci" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await quitterPuisRevenir(page);
    await page.waitForTimeout(1000);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  await test.step("le rapport seul, payé sur l’écran : « C’est débloqué », les huit chapitres", async () => {
    const ecran = page.getByRole("main");
    await ecran.getByRole("radio", { name: /^Le rapport/ }).click();
    await ecran.getByRole("button", { name: "Débloquer · 9,90\u00a0€" }).click();
    await payerParCarte(page);
    await expect(page).toHaveURL(/\/rapport\/debloque\?achat=/, { timeout: RESEAU });
    const debloque = page.getByRole("main");
    await expect(debloque.getByRole("heading", { level: 1, name: "C’est débloqué." })).toBeVisible();
    await expect(debloque.getByText("Les 8 chapitres sont à toi. Et 3 bulles pour en parler avec BLUSH.")).toBeVisible();
    expect(await compteDe(email)).toMatchObject({ debloquees: 1, bulles: 3 });
  });

  await test.step("l’offre ③ passée, « Continuer » : la vraie lecture, puis son verdict", async () => {
    const ecran = page.getByRole("main");
    const continuer = ecran.getByRole("link", { name: "Continuer" });
    const nonMerci = ecran.getByRole("button", { name: /^Non merci/ });
    /* L’offre ③, puis son repli (le 2e rapport), refusés l’un après l’autre : la liste, et « Continuer » vers la lecture */
    for (let k = 0; k < 3; k++) {
      await expect(continuer.or(nonMerci).first()).toBeVisible({ timeout: RESEAU });
      if (!(await nonMerci.isVisible())) break;
      await nonMerci.click();
    }
    await continuer.click();
    expect(await attendreLecture(page, { paywall: "garder" })).toBe("verdict");
    expect(await verdictsEcrits(email)).toBe(1);
    expect((await tachesDe(email)).find((t) => t.genre === "verdict")?.statut).toBe("fini");
    await page.getByRole("link", { name: "Voir mon rapport" }).click();
    await expect(page).toHaveURL(/\/rapport\/verdict/, { timeout: RESEAU });
  });
});

test("la roue tournée : « Gagné », le lot (−10 %) sur les prix du paywall et du paiement, et plus d’offre ①", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "roue");
  /* La case imposée au serveur : −10 % sur la formule (le faux Whop seulement) */
  await page.setExtraHTTPHeaders({ [CASE_DE_LA_ROUE]: String(CASES_DE_LA_ROUE.findIndex((c) => c.lot === "moins10")) });
  const depuis = await jusquAuCode(page, exportWhatsApp(testInfo), email);
  expect(await saisirCode(page, await dernierCode(email, { depuis }))).toBe(true);
  expect(await attendreLecture(page, { paywall: "garder" })).toBe("paywall");

  await test.step("la page descendue à moitié : la roue sans attendre ses 5 s ; « Découvrir mon cadeau », elle s’arrête sur −10 %, « Gagné » et son minuteur", async () => {
    await page.getByRole("button", { name: "Voir mon rapport" }).click();
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible({ timeout: RESEAU });
    const roue = page.getByRole("dialog", { name: ROUE });
    await expect(roue).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(roue).toBeVisible({ timeout: 2_000 });
    await roue.getByRole("button", { name: "Découvrir mon cadeau" }).click();
    await expect(page.getByText(/^Gagné/)).toBeVisible({ timeout: RESEAU });
    await expect(page.getByRole("dialog").getByRole("heading", { name: "−10\u00a0%" })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("timer")).toHaveText(/^1[45]:\d\d$/);
    await tientEnPetitEcran(page, "« Gagné »");
    await page.getByRole("dialog").getByRole("button", { name: "Voir mon rapport" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  await test.step("le paywall : le bandeau du cadeau, Premium à 17,91 € ; l’onglet quitté puis retrouvé, la question ; « C’est trop cher » avec un lot : pas d’offre ①, le rapport seul", async () => {
    const ecran = page.getByRole("main");
    await expect(ecran.getByRole("status").filter({ hasText: "Ton cadeau\u00a0: −10\u00a0% sur ta formule" })).toBeVisible();
    const premium = ecran.getByRole("radio", { name: /Premium/ });
    await expect(premium).toContainText("17,91\u00a0€");
    await expect(premium).toContainText("−1,99\u00a0€");
    await quitterPuisRevenir(page);
    const question = page.getByRole("dialog", { name: QUESTION });
    await expect(question).toBeVisible({ timeout: RESEAU });
    await question.getByRole("button", { name: "C’est trop cher" }).click();
    const rapportSeul = page.getByRole("dialog", { name: "Prends le rapport seul." });
    await expect(rapportSeul).toBeVisible({ timeout: RESEAU });
    await expect(rapportSeul.getByRole("button", { name: "Passer au rapport · 8,91\u00a0€" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: OFFRE_SUITE })).toHaveCount(0);
    await rapportSeul.getByRole("button", { name: "Plus tard" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(premium).toHaveAttribute("aria-checked", "true");
  });

  await test.step("payé au prix du lot : 17,91 €, 25 bulles, le lot pris", async () => {
    await page.getByRole("main").getByRole("button", { name: "Débloquer · 17,91\u00a0€" }).click();
    await payerParCarte(page);
    await expect(page).toHaveURL(/\/rapport\/debloque\?achat=/, { timeout: RESEAU });
    expect(await compteDe(email)).toMatchObject({ debloquees: 1, bulles: 25 });
    const achats = await sql()<{ centimes: number; lot_roue: string | null }[]>`
      select a.centimes, a.lot_roue from achats a join users u on u.id = a.user_id where u.email = ${email.toLowerCase()} and a.statut = 'paye'`;
    expect(achats).toEqual([{ centimes: 1791, lot_roue: "moins10" }]);
  });
});
