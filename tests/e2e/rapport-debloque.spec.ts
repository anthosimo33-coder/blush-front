import type { Locator, Page } from "@playwright/test";
import {
  attendreMail,
  attendreTaches,
  CHAPITRES_FERMES,
  compteDe,
  connecterParApi,
  emailLibre,
  expect,
  lectureFaite,
  lireUneConvParApi,
  nouvelInvite,
  ouvrir,
  ouvrirLeRapport,
  PAIEMENT,
  RENONCIATION,
  tachesDe,
  test,
  URL_APPLI,
} from "./aide";

/*
 * Débloquer le rapport d’une conv, en le payant à l’écran : la feuille du paiement, la case de renonciation, la page du
 * faux Whop (BLUSH_PAIEMENT_FACTICE) et son vrai webhook signé, le retour, puis « C’est débloqué », la suite qui s’écrit,
 * et le mail « ton rapport est prêt ». Un compte de l’équipe (un invité) n’a rien à payer.
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
    await rapport.getByRole("button", { name: "Lire la suite" }).click();
    await payerALecran(page, /^Le rapport/);
    const ecran = page.getByRole("main");
    await expect(ecran.getByRole("heading", { level: 1, name: "C’est débloqué." })).toBeVisible();
    await expect(ecran.getByText("Les 8 chapitres sont à toi, pour toujours. Et 10 bulles pour en parler avec BLUSH.")).toBeVisible();
    await expect(ecran.getByText("9,90\u00a0€ · Paiement unique, pas d’abonnement")).toBeVisible();
    await expect(page.getByText(/BLUSH\+/)).toHaveCount(0);
    expect(await compteDe(email)).toMatchObject({ debloquees: 1, bulles: 10 });
  });

  await test.step("l’offre ③ juste après : Premium pour 5 € de plus, la carte gardée ; « Non merci, je lis la suite » ramène au rapport", async () => {
    const ecran = page.getByRole("main");
    const offre = ecran.getByRole("region", { name: "Passe en Premium pour 5\u00a0€ de plus" });
    await expect(offre).toBeVisible();
    await expect(offre.getByText("80 bulles en plus, comme en Premium. Seules, elles coûtent 9,90\u00a0€.")).toBeVisible();
    await expect(offre.getByText("Ta carte est enregistrée\u00a0: un geste et c’est fait.")).toBeVisible();
    await expect(offre.getByRole("button", { name: "Ajouter 80 bulles · 5\u00a0€" })).toBeVisible();
    await offre.getByRole("button", { name: "Non merci, je lis la suite" }).click();
  });

  await test.step("la suite de son rapport, complet : les huit chapitres arrivent", async () => {
    await expect(page).toHaveURL(/\/rapport#chapitre-2$/);
    await expect(rapport.getByText("Complet", { exact: true })).toBeVisible();
    await attendreTaches(email);
    await expect(rapport.getByRole("region", { name: "Chapitre 2 : Chapitre 2" })).toBeVisible();
    await expect(rapport.getByRole("region", { name: /^Chapitre \d : / })).toHaveCount(8);
    expect((await tachesDe(email)).every((t) => t.statut === "fini")).toBe(true);
  });

  await test.step("le mail « ton rapport est prêt » : son sommaire reprend les titres du rapport, le prénom de Maëlys compris", async () => {
    const mail = await attendreMail(email, { filtre: (m) => m.sujet === "📖 Ton rapport BLUSH est prêt" });
    expect(sommaireDuMail(mail.html)).toEqual(titres.map((titre, k) => `${k + 1} ${titre}`));
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
  await expect(ecran.getByText("Les 7 chapitres qui restent")).toBeVisible();
  await expect(ecran.getByText("Ta lecture reprend au chapitre 2")).toBeVisible();
  await expect(ecran.getByText("90 bulles pour parler à BLUSH", { exact: true })).toBeVisible();
  await expect(ecran.getByText("14,90\u00a0€ · Paiement unique, pas d’abonnement")).toBeVisible();
  await expect(ecran.getByRole("region", { name: /Passe en Premium/ })).toHaveCount(0);
  expect(await compteDe(email)).toMatchObject({ debloquees: 1, bulles: 90 });
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
