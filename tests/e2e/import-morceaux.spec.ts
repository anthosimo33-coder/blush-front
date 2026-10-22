import {
  attendreLecture,
  capturesPng,
  choisirFichier,
  demanderCode,
  ecrire,
  emailLibre,
  expect,
  exportWhatsApp,
  histoiresDe,
  importerWhatsApp,
  LECTURE_DES_CAPTURES,
  repondreQui,
  saisirLeCodeRecu,
  test,
  texteWhatsApp,
} from "./aide";

/*
 * Une conv en plusieurs morceaux (src/server/morceaux.ts) : un export WhatsApp, des captures, puis un 2e export avec la
 * même personne, réunis en une seule conv, rangée par date et sans doublons, puis lue en entier. Noé et Elias : Elias est
 * le nom que le modèle factice lit en haut de toutes les captures (src/server/ia/factice.ts). Tout est inventé.
 */
const NOE_ET_ELIAS = { toi: "Noé", autre: "Elias" };

test("un export court, des captures, un autre export : une seule conv, sans doublons, lue en entier", async ({ page }, testInfo) => {
  test.setTimeout(LECTURE_DES_CAPTURES * 3);
  const email = emailLibre(testInfo, "morceaux");

  await test.step("« Vous vous parlez où ? » dit qu’on ajoutera le reste juste après", async () => {
    await page.goto("/commencer");
    await expect(page.getByText("Vous vous êtes parlé sur plusieurs applis\u00a0? Commence par une\u00a0: tu ajouteras le reste juste après.")).toBeVisible();
  });

  await test.step("un export de 30 messages : gardé, mais trop court ; ajouter un morceau devient le bouton", async () => {
    await importerWhatsApp(page, exportWhatsApp(testInfo, { personnes: NOE_ET_ELIAS, n: 30 }));
    await expect(page.getByText("30", { exact: true })).toBeVisible();
    await expect(page.getByText(/C’est encore court pour une lecture juste\s:\sil faut au moins 50 messages/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Continuer" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ajouter un morceau" })).toBeVisible();
  });

  await test.step("« Il manque un bout de votre histoire ? » ouvre la feuille : les quatre tuiles, en mode ajout", async () => {
    await page.getByRole("button", { name: /Il manque un bout de votre histoire/ }).click();
    const feuille = page.getByRole("dialog", { name: "Ajoute un morceau" });
    await expect(feuille).toBeVisible();
    await expect(feuille.getByText("Avec la même personne, sur n’importe quelle appli. BLUSH remet tout dans l’ordre.")).toBeVisible();
    const tuiles = feuille.getByRole("navigation", { name: "Ce que tu ajoutes" }).getByRole("link");
    await expect(tuiles).toHaveCount(4);
    await expect(feuille.getByRole("link", { name: "WhatsApp Un autre export" })).toHaveAttribute("href", "/importer/export?app=whatsapp&mode=ajout");
    await feuille.getByRole("link", { name: "Captures ou vidéo Hinge, Tinder… toutes les applis" }).click();
    await expect(page).toHaveURL(/\/importer\/captures\?app=autre&mode=ajout$/);
  });

  await test.step("deux captures : elles rejoignent la conv, l’histoire réunie les montre après l’export", async () => {
    await choisirFichier(page, capturesPng(testInfo, 2), "Choisir mes captures");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/importer\/histoire$/, { timeout: LECTURE_DES_CAPTURES });
    await expect(page.getByRole("heading", { level: 1, name: "Votre histoire, d’un bout à l’autre." })).toBeVisible();
    await expect(page.getByText("BLUSH a tout remis dans l’ordre")).toBeVisible();
    /* 30 messages de l’export, 24 lus sur les captures */
    await expect(page.getByText("54", { exact: true })).toBeVisible();
    await expect(page.getByText(/messages · .+ · 2 morceaux/)).toBeVisible();
    await expect(page.getByText(/^Avec Elias · /)).toBeVisible();
    await expect(page.getByText(/^2 captures · /)).toBeVisible();
  });

  await test.step("un export avec quelqu’un d’autre : refusé, en nommant Elias", async () => {
    await page.getByRole("button", { name: "Ajouter un autre morceau" }).click();
    await page.getByRole("dialog", { name: "Ajoute un morceau" }).getByRole("link", { name: "WhatsApp Un autre export" }).click();
    await expect(page).toHaveURL(/\/importer\/export\?app=whatsapp&mode=ajout$/);
    /* Une autre conv, un mois plus tôt : aucun message en commun avec celle d’Elias (des messages en commun la feraient prendre pour la même) */
    const avecSarah = texteWhatsApp({ toi: "Noé", autre: "Sarah" }).replaceAll("/09/2026", "/08/2026");
    await choisirFichier(page, ecrire(testInfo.outputPath("exports", "sarah", "Discussion WhatsApp avec Sarah.txt"), avecSarah));
    await expect(page.getByText("Ce morceau n’est pas avec Elias.")).toBeVisible();
    await expect(page).toHaveURL(/\/importer\/export\?app=whatsapp&mode=ajout$/);
  });

  await test.step("le même export, en entier : ses 30 premiers messages sont déjà là, retirés en double", async () => {
    await choisirFichier(page, exportWhatsApp(testInfo, { personnes: NOE_ET_ELIAS, n: 64 }).chemin);
    await expect(page).toHaveURL(/\/importer\/histoire$/);
    /* 30 + 24 + 64, moins les 30 en double */
    await expect(page.getByText("88", { exact: true })).toBeVisible();
    await expect(page.getByText(/messages · .+ · 3 morceaux/)).toBeVisible();
    await expect(page.getByText("30 messages en double retirés\u00a0: ils étaient dans deux morceaux à la fois.")).toBeVisible();
    await page.getByRole("link", { name: "Continuer" }).click();
  });

  await test.step("« Qui es-tu ? » : les deux noms de l’export, puis la lecture des 88 messages", async () => {
    await expect(page.getByRole("radiogroup", { name: "Qui es-tu dans cette conv\u00a0?" }).getByRole("radio")).toHaveText([/Noé/, /Elias/]);
    await repondreQui(page, { moi: "Noé", tuEs: "Un garçon", ou: "On se parle", veux: "Juste comprendre" });
    await page.getByRole("button", { name: "Continuer" }).click();
    await saisirLeCodeRecu(page, email, await demanderCode(page, email));
    await attendreLecture(page);
    await expect(page.getByRole("heading", { level: 1, name: /BLUSH analyse tes\s*88\s*messages/ })).toBeVisible();
    expect(await histoiresDe(email)).toEqual([expect.objectContaining({ messages: 88 })]);
  });
});

test("des captures d’abord, puis un export : la conv reçue, l’histoire réunie, et « Qui es-tu ? » redemande qui est qui", async ({ page }, testInfo) => {
  test.setTimeout(LECTURE_DES_CAPTURES * 3);
  const email = emailLibre(testInfo, "morceaux-captures");

  await test.step("des captures : une fois lues, « C’est bon, on a votre conv. », d’où l’on peut ajouter la suite", async () => {
    await page.goto("/importer/captures?app=autre");
    await choisirFichier(page, capturesPng(testInfo, 2), "Choisir mes captures");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/importer\/ok$/, { timeout: LECTURE_DES_CAPTURES });
    await expect(page.getByRole("heading", { level: 1, name: "C’est bon, on a votre conv." })).toBeVisible();
    await expect(page.getByText("2 captures", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Il manque un bout de votre histoire/ }).click();
    await page.getByRole("dialog", { name: "Ajoute un morceau" }).getByRole("link", { name: "WhatsApp Un autre export" }).click();
  });

  await test.step("l’export WhatsApp avec Elias : les deux morceaux, du plus ancien au plus récent", async () => {
    await choisirFichier(page, exportWhatsApp(testInfo, { personnes: NOE_ET_ELIAS, n: 64 }).chemin);
    await expect(page).toHaveURL(/\/importer\/histoire$/);
    await expect(page.getByText("88", { exact: true })).toBeVisible();
    await expect(page.getByText(/messages · .+ · 2 morceaux/)).toBeVisible();
    await expect(page.getByText(/^Avec Elias · /)).toBeVisible();
    await page.getByRole("link", { name: "Continuer" }).click();
  });

  await test.step("« Qui es-tu ? » : les deux noms de l’export, puis l’email et la lecture des 88 messages", async () => {
    await expect(page.getByRole("radiogroup", { name: "Qui es-tu dans cette conv\u00a0?" }).getByRole("radio")).toHaveText([/Noé/, /Elias/]);
    await repondreQui(page, { moi: "Noé", tuEs: "Un garçon", ou: "On s’est vus", veux: "Qu’on soit ensemble" });
    await page.getByRole("button", { name: "Continuer" }).click();
    await saisirLeCodeRecu(page, email, await demanderCode(page, email));
    await attendreLecture(page);
    await expect(page.getByRole("heading", { level: 1, name: /BLUSH analyse tes\s*88\s*messages/ })).toBeVisible();
  });
});

test("« Ajouter quand même » : des captures refusées (le contact enregistré sous un autre nom) s’ajoutent, sans être relues", async ({ page }, testInfo) => {
  test.setTimeout(LECTURE_DES_CAPTURES * 3);
  const envois: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/captures") envois.push(r.method());
  });

  await test.step("un export avec « Bébé », puis des captures où l’on lit Elias : refusées, avec de quoi les ajouter quand même", async () => {
    await importerWhatsApp(page, exportWhatsApp(testInfo, { personnes: { toi: "Noé", autre: "Bébé" } }));
    await page.goto("/importer/captures?app=autre&mode=ajout");
    await choisirFichier(page, capturesPng(testInfo, 2), "Choisir mes captures");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByText("Ce morceau n’est pas avec Bébé.")).toBeVisible({ timeout: LECTURE_DES_CAPTURES });
    await expect(page.getByText("C’est la même personne, sous un autre nom\u00a0? Tu peux l’ajouter quand même.")).toBeVisible();
  });

  await test.step("« Ajouter quand même » : les mêmes captures, ajoutées, l’histoire réunie en deux morceaux", async () => {
    await page.getByRole("button", { name: "Ajouter quand même" }).click();
    await expect(page).toHaveURL(/\/importer\/histoire$/, { timeout: LECTURE_DES_CAPTURES });
    await expect(page.getByText(/messages · .+ · 2 morceaux/)).toBeVisible();
    expect(envois).toEqual(["POST", "POST"]);
  });
});
