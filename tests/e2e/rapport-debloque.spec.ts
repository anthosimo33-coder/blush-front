import type { Locator, Page } from "@playwright/test";
import {
  achatEnBase,
  attendreMail,
  attendreTaches,
  CHAPITRES_D_ATTENTE,
  CHAPITRES_FERMES,
  compteDe,
  connecterParApi,
  dernierAchat,
  emailLibre,
  expect,
  fermerLaFeuille,
  lectureFaite,
  lireUneConvParApi,
  nouvelInvite,
  ouvrir,
  ouvrirLeRapport,
  OFFRE_SUITE,
  PAIEMENT,
  raccourcirLaSuite,
  RENONCIATION,
  tachesDe,
  test,
  tientEnPetitEcran,
  titreDuChapitre,
  URL_APPLI,
} from "./aide";

/*
 * Débloquer le rapport d’une conv, en le payant à l’écran : la feuille « Ta formule », la case de renonciation (gardée
 * avec l’achat), la page du faux Whop (BLUSH_PAIEMENT_FACTICE) et son vrai webhook signé, le retour, puis « C’est
 * débloqué », la suite qui s’écrit, et le mail « ton rapport est prêt ». Le rapport seul, Premium, et l’offre ① (la
 * feuille fermée sans payer), prise, puis passée. Un compte de l’équipe (un invité) n’a rien à payer.
 */

/**
 * Les titres des chapitres tels que le rapport gratuit les montre, dans l’ordre : le chapitre 1 (sans « Chapitre 1 : »,
 * dit aux lecteurs d’écran seulement), puis les sept fermés (sans leur numéro ni « (verrouillé) »).
 */
async function titresDuRapport(rapport: Locator): Promise<string[]> {
  const verdict = await rapport.getByRole("heading", { level: 2, name: /^Chapitre 1 : / }).textContent();
  const fermes = await rapport.getByRole("button", { name: /\(verrouillé\)$/ }).allTextContents();
  return [verdict!.replace(/^Chapitre 1\s*:\s*/, ""), ...fermes.map((t) => t.replace(/^\d+/, "").replace(/\(verrouillé\)$/, ""))];
}

/** Le sommaire du mail « ton rapport est prêt », lu dans son HTML : la pastille du numéro, puis le titre. */
const sommaireDuMail = (html: string) => [...html.matchAll(/>(\d)<\/div><\/td><td class="encre"[^>]*>([^<]+)</g)].map((m) => `${m[1]} ${m[2]}`);

/** Paie à l’écran la formule `nom` (« Le rapport », « Rapport + 60 bulles ») de la feuille ouverte : la case cochée, « Débloquer », puis « Payer » chez le faux Whop. */
async function payerALecran(page: Page, nom: RegExp): Promise<void> {
  const paiement = page.getByRole("dialog", { name: PAIEMENT });
  await paiement.getByRole("radio", { name: nom }).click();
  await paiement.getByRole("checkbox", { name: /je renonce à mon droit de rétractation/ }).check();
  await paiement.getByRole("button", { name: "Débloquer" }).click();
  await expect(page).toHaveURL(/\/paiement\/factice\?achat=/);
  await page.getByRole("button", { name: "Payer", exact: true }).click();
  await expect(page).toHaveURL(/\/rapport\/debloque\?achat=/);
}

test("le rapport seul, payé à l’écran : « C’est débloqué », l’offre ③ (Non merci), puis la suite de son rapport", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "debloque");
  await lectureFaite(page, testInfo, email);
  const rapport = await ouvrirLeRapport(page);

  let titres: string[] = [];
  await test.step("le rapport pas débloqué : le verdict seul, les sept autres fermés sous leur titre", async () => {
    await expect(rapport.getByText("Aperçu gratuit", { exact: true })).toBeVisible();
    expect((await tachesDe(email)).map((t) => [t.genre, t.statut])).toEqual([["verdict", "fini"]]);
    await expect(rapport.getByRole("button", { name: /\(verrouillé\)$/ })).toHaveCount(7);
    titres = await titresDuRapport(rapport);
    expect(titres).toEqual(["Le verdict", ...CHAPITRES_FERMES]);
  });

  await test.step("« Lire la suite », le rapport seul, la case cochée, « Débloquer », « Payer » chez le faux Whop : « C’est débloqué »", async () => {
    await rapport.getByRole("button", { name: "Lire la suite · 9,90\u00a0€" }).click();
    await payerALecran(page, /^Le rapport/);
    const ecran = page.getByRole("main");
    await expect(ecran.getByRole("heading", { level: 1, name: "C’est débloqué." })).toBeVisible();
    /* Avec l’offre ③, 28 px, sur ordinateur comme sur téléphone (le prototype) */
    await expect(ecran.getByRole("heading", { level: 1, name: "C’est débloqué." })).toHaveCSS("font-size", "28px");
    await expect(ecran.getByText("Les 8 chapitres sont à toi. Et 10 bulles pour en parler avec BLUSH.")).toBeVisible();
    await expect(page.getByText(/BLUSH\+/)).toHaveCount(0);
    expect(await compteDe(email)).toMatchObject({ debloquees: 1, bulles: 10 });
    /* La case cochée est gardée avec l’achat : sa version, son heure */
    expect(await achatEnBase(await dernierAchat(email))).toMatchObject({ offre: "rapport", statut: "paye", renonciationVersion: RENONCIATION, renonciationLe: expect.any(Date) });
  });

  await test.step("l’offre ③ juste après : Premium pour 5 € de plus, la carte gardée ; « Non merci, je lis la suite » ramène au rapport", async () => {
    const ecran = page.getByRole("main");
    const offre = ecran.getByRole("region", { name: "Passe en Premium pour 5\u00a0€ de plus" });
    await expect(offre).toBeVisible();
    await expect(offre.getByText("80 bulles en plus, comme en Premium. Seules, elles coûtent 9,90\u00a0€.")).toBeVisible();
    await expect(offre.getByText("Ta carte est enregistrée\u00a0: un geste et c’est fait.")).toBeVisible();
    await expect(offre.getByRole("button", { name: "Ajouter 80 bulles · 5\u00a0€" })).toBeVisible();
    /* L’offre prend la place de la liste et du bouton du bas : « Non merci » continue la lecture */
    await expect(ecran.getByText("Les 7 chapitres qui restent")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Lire la suite" })).toHaveCount(0);
    await tientEnPetitEcran(page, "« C’est débloqué » et l’offre ③");
    await offre.getByRole("button", { name: "Non merci, je lis la suite" }).click();
  });

  await test.step("la suite de son rapport, complet : les huit chapitres arrivent, sous les titres vus fermés", async () => {
    await expect(page).toHaveURL(/\/rapport#chapitre-2$/);
    await expect(rapport.getByText("Complet", { exact: true })).toBeVisible();
    await attendreTaches(email);
    await expect(rapport.getByRole("region", { name: `Chapitre 2 : ${titreDuChapitre(2)}` })).toBeVisible();
    await expect(rapport.getByRole("region", { name: /^Chapitre \d : / })).toHaveCount(8);
    /* Chaque chapitre débloqué porte le titre qu’il avait fermé */
    const ouverts = await rapport.getByRole("heading", { level: 2, name: /^Chapitre \d : / }).allTextContents();
    expect(ouverts.map((t) => t.replace(/^Chapitre \d\s*:\s*/, ""))).toEqual(titres);
    expect((await tachesDe(email)).every((t) => t.statut === "fini")).toBe(true);
  });

  await test.step("le mail « ton rapport est prêt » : son sommaire garde les titres d’attente (rien de la conv), le prénom de Maëlys compris", async () => {
    const mail = await attendreMail(email, { filtre: (m) => m.sujet === "📖 Ton rapport BLUSH est prêt" });
    expect(sommaireDuMail(mail.html)).toEqual(["Le verdict", ...CHAPITRES_D_ATTENTE].map((titre, k) => `${k + 1} ${titre}`));
  });
});

test("Premium, choisie d’avance : payée à l’écran, 90 bulles, et pas d’offre ③", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "premium");
  await lectureFaite(page, testInfo, email);
  await ouvrir(page, "/rapport?paiement=1");
  const paiement = page.getByRole("dialog", { name: PAIEMENT });
  await expect(paiement.getByRole("radio", { name: /^Rapport \+ 60 bulles/ })).toBeChecked();
  await payerALecran(page, /^Rapport \+ 60 bulles/);
  const ecran = page.getByRole("main");
  await expect(ecran.getByRole("heading", { level: 1, name: "C’est débloqué." })).toBeVisible();
  /* Sans offre, 32 px, sur ordinateur comme sur téléphone (le prototype, pas 40 sur ordinateur) */
  await expect(ecran.getByRole("heading", { level: 1, name: "C’est débloqué." })).toHaveCSS("font-size", "32px");
  await expect(ecran.getByText("Les 7 chapitres qui restent")).toBeVisible();
  await expect(ecran.getByText("Ta lecture reprend au chapitre 2")).toBeVisible();
  await expect(ecran.getByText("90 bulles pour parler à BLUSH", { exact: true })).toBeVisible();
  await expect(ecran.getByText("1 bulle = 1 réponse · elles n’expirent jamais")).toBeVisible();
  await expect(ecran.getByRole("region", { name: /Passe en Premium/ })).toHaveCount(0);
  expect(await compteDe(email)).toMatchObject({ debloquees: 1, bulles: 90 });
  expect(await achatEnBase(await dernierAchat(email))).toMatchObject({ offre: "premium", statut: "paye", renonciationVersion: RENONCIATION });
  await ecran.getByRole("link", { name: "Lire la suite" }).click();
  await expect(page).toHaveURL(/\/rapport#chapitre-2$/);
});

test("la feuille fermée sans payer : l’offre ①, prise à l’écran, la suite à 6,90 € ; pas d’offre ③ le même jour", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "suite");
  await lectureFaite(page, testInfo, email);
  const rapport = await ouvrirLeRapport(page);
  await rapport.getByRole("button", { name: "Lire la suite · 9,90\u00a0€" }).click();
  await expect(page.getByRole("dialog", { name: PAIEMENT })).toBeVisible();
  await tientEnPetitEcran(page, "« Ta formule », Premium ouverte");
  await fermerLaFeuille(page);
  const offre = page.getByRole("dialog", { name: OFFRE_SUITE });
  await expect(offre).toBeVisible();
  await tientEnPetitEcran(page, "l’offre ①");
  /*
   * La souris est restée où était « Lire la suite » : pile sur le bord bas de « Je la prends », qui se soulève au survol
   * (lift), en sort, retombe, et y revient, sans jamais tenir en place. On l’écarte, comme une main qui bouge
   */
  await page.mouse.move(0, 0);

  await test.step("« Je la prends » sans la case : rien ne part ; cochée, la page du faux Whop, à 6,90 €", async () => {
    await offre.getByRole("button", { name: "Je la prends · 6,90\u00a0€" }).click();
    await expect(offre.getByRole("alert")).toHaveText("Coche la case pour payer.");
    await offre.getByRole("checkbox", { name: /je renonce à mon droit de rétractation/ }).check();
    await offre.getByRole("button", { name: "Je la prends · 6,90\u00a0€" }).click();
    await expect(page).toHaveURL(/\/paiement\/factice\?achat=/);
    await expect(page.getByRole("heading", { level: 1, name: "Ta suite" })).toBeVisible();
    await expect(page.getByText("6,90\u00a0€", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Payer", exact: true }).click();
  });

  await test.step("« C’est débloqué » : les 10 bulles, et la liste (jamais deux offres le même jour)", async () => {
    await expect(page).toHaveURL(/\/rapport\/debloque\?achat=/);
    const ecran = page.getByRole("main");
    await expect(ecran.getByText("Les 8 chapitres sont à toi. Et 10 bulles pour en parler avec BLUSH.")).toBeVisible();
    await expect(ecran.getByText("10 bulles pour parler à BLUSH", { exact: true })).toBeVisible();
    await expect(ecran.getByRole("region", { name: /Passe en Premium/ })).toHaveCount(0);
    expect(await compteDe(email)).toMatchObject({ debloquees: 1, bulles: 10 });
    expect(await achatEnBase(await dernierAchat(email))).toMatchObject({ offre: "suite", statut: "paye", renonciationVersion: RENONCIATION });
  });
});

test("l’offre ① passée : son compte à rebours (l’heure de fin du serveur) arrive à zéro, elle se ferme, et ne se vend plus", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "suite-passee");
  await lectureFaite(page, testInfo, email);
  let rapport = await ouvrirLeRapport(page);
  await rapport.getByRole("button", { name: "Lire la suite · 9,90\u00a0€" }).click();
  await fermerLaFeuille(page);
  await expect(page.getByRole("dialog", { name: OFFRE_SUITE })).toBeVisible();

  await test.step("sa fin ramenée à quelques secondes (en base : le moyen de test), la page rechargée retrouve l’heure du serveur", async () => {
    await raccourcirLaSuite(email, 8);
    rapport = await ouvrirLeRapport(page);
    await rapport.getByRole("button", { name: "Lire la suite · 9,90\u00a0€" }).click();
    await fermerLaFeuille(page);
    const offre = page.getByRole("dialog", { name: OFFRE_SUITE });
    await expect(offre.getByRole("timer", { name: "L’offre se termine dans" })).toHaveText(/^00:0[0-8]$/);
  });

  await test.step("à zéro : elle se ferme, « L’offre est passée », et le serveur ne la vend plus", async () => {
    await expect(page.getByRole("dialog", { name: OFFRE_SUITE })).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole("status").filter({ hasText: "L’offre est passée" })).toBeVisible();
    const r = await page.request.post("/api/paiement", { headers: { origin: URL_APPLI }, data: { offre: "suite", renonciation: RENONCIATION } });
    expect([r.status(), await r.json()]).toEqual([422, { erreur: "offre" }]);
    /* La feuille refermée ne la remontre pas */
    await rapport.getByRole("button", { name: "Lire la suite · 9,90\u00a0€" }).click();
    await fermerLaFeuille(page);
    await expect(page.getByRole("dialog", { name: PAIEMENT })).toBeHidden();
    await page.waitForTimeout(800);
    await expect(page.getByRole("dialog", { name: OFFRE_SUITE })).toHaveCount(0);
    expect(await compteDe(email)).toMatchObject({ debloquees: 0, bulles: 0 });
  });
});

test("un compte de l’équipe n’a rien à payer : son rapport est ouvert, et le serveur refuse de le faire payer (409 « deja »)", async ({ page }, testInfo) => {
  const email = await nouvelInvite(testInfo);
  await connecterParApi(page, testInfo, email);
  await lireUneConvParApi(page, testInfo);
  await attendreTaches(email);
  const rapport = await ouvrirLeRapport(page);
  await expect(rapport.getByText("Complet", { exact: true })).toBeVisible();
  for (const offre of ["rapport", "pack30"] as const) {
    const r = await page.request.post("/api/paiement", { headers: { origin: URL_APPLI }, data: { offre, renonciation: RENONCIATION } });
    expect([r.status(), await r.json()]).toEqual([409, { erreur: "deja" }]);
  }
  expect(await compteDe(email)).toMatchObject({ bulles: 0 });
});
