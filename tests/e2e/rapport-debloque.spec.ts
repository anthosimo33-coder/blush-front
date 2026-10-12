import type { Locator } from "@playwright/test";
import {
  attendreMail,
  attendreTaches,
  CHAPITRES_FERMES,
  compteDe,
  connecterParApi,
  debloquerLaConv,
  emailLibre,
  expect,
  lectureFaite,
  lireUneConvParApi,
  nouvelInvite,
  ouvrir,
  ouvrirLeRapport,
  PAIEMENT,
  reponseAuGeste,
  tachesDe,
  test,
} from "./aide";

/*
 * Débloquer le rapport d’une conv. Le paiement (Whop) n’est pas encore branché : un compte qui paie se débloque ici par
 * la base, comme un achat livré, puis arrive sur « C’est débloqué » comme au retour du paiement, et retrouve la suite qui
 * s’écrit, et le mail « ton rapport est prêt ». Un compte de l’équipe (un invité) se livre son rapport par « Débloquer ».
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

test("un rapport débloqué (un achat livré) : « C’est débloqué », puis la suite de son rapport", async ({ page }, testInfo) => {
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

  await test.step("l’achat livré, le retour du paiement : « C’est débloqué » dit ce qui vient de s’ouvrir, et son prix", async () => {
    await debloquerLaConv(email);
    await ouvrir(page, "/rapport/debloque?offre=rapport");
    const ecran = page.getByRole("main");
    await expect(ecran.getByRole("heading", { level: 1, name: "C’est débloqué." })).toBeVisible();
    await expect(ecran.getByText("Les 8 chapitres sont à toi, pour toujours. Et 10 bulles pour en parler avec BLUSH.")).toBeVisible();
    await expect(ecran.getByText("Les 7 chapitres qui restent")).toBeVisible();
    await expect(ecran.getByText("Ta lecture reprend au chapitre 2")).toBeVisible();
    await expect(ecran.getByText("10 bulles pour parler à BLUSH", { exact: true })).toBeVisible();
    await expect(ecran.getByText("9,90\u00a0€ · Paiement unique, pas d’abonnement")).toBeVisible();
    await expect(page.getByText(/BLUSH\+/)).toHaveCount(0);
    expect(await compteDe(email)).toMatchObject({ debloquees: 1 });
  });

  await test.step("« Lire la suite » ramène au rapport, complet : les huit chapitres arrivent", async () => {
    await page.getByRole("link", { name: "Lire la suite" }).click();
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

test("un compte de l’équipe : « Débloquer » se livre le rapport sans payer, et mène à « C’est débloqué »", async ({ page }, testInfo) => {
  const email = await nouvelInvite(testInfo);
  await connecterParApi(page, testInfo, email);
  await lireUneConvParApi(page, testInfo);
  await attendreTaches(email);
  await ouvrir(page, "/rapport?paiement=1");
  const paiement = page.getByRole("dialog", { name: PAIEMENT });

  await test.step("le paiement : les deux formules, Premium choisie d’avance", async () => {
    await expect(paiement.getByRole("radio", { name: /^Rapport \+ 60 bulles/ })).toBeChecked();
    await expect(paiement.getByRole("radio", { name: /^Le rapport/ })).not.toBeChecked();
  });

  await test.step("« Débloquer » : la conv débloquée pour de bon, puis « C’est débloqué »", async () => {
    const reponse = await reponseAuGeste(page, { chemin: "/api/debloquer" }, () => paiement.getByRole("button", { name: "Débloquer" }).click());
    expect(reponse.status()).toBe(200);
    await expect(page).toHaveURL(/\/rapport\/debloque\?offre=premium$/);
    await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "C’est débloqué." })).toBeVisible();
    await expect(page.getByRole("main").getByText("90 bulles pour parler à BLUSH", { exact: true })).toBeVisible();
    expect(await compteDe(email)).toMatchObject({ debloquees: 1, bulles: 0 });
  });
});
