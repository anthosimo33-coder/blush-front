import { CASE_IMPORT, texteCaseImport } from "../../src/contenu/consentements";
import { A_COMPLETER, droitApplicable, EDITEUR, identiteEditeur, lignesEditeur } from "../../src/contenu/mentions-legales";
import { capturesPng, connecterParApi, emailLibre, expect, exportWhatsApp, ouvrir, prouverHumain, sql, test, texteWhatsApp, URL_APPLI } from "./aide";

/*
 * Le juridique : les pages /conditions et /mentions-legales (l’éditeur lu dans src/contenu/mentions-legales.ts, jamais
 * recopié ici), leurs liens au pied de la landing, de la confidentialité et de « Mon compte », et l’accord de l’import,
 * sans case : une ligne au-dessus du bouton le dit, le geste du bouton le donne ; l’API refuse toujours un import sans
 * lui (sa version).
 */

const NB = "\u00a0";

test("les conditions : utiliser BLUSH puis acheter, Whop, la rétractation, les bulles, l’éditeur au pied, sans nommer d’IA", async ({ page }) => {
  const reponse = await page.goto("/conditions");
  expect(reponse?.status()).toBe(200);
  await expect(page).toHaveTitle("Conditions · BLUSH");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Conditions" })).toBeVisible();
  for (const partie of ["Utiliser BLUSH", "Acheter"]) await expect(main.getByRole("heading", { level: 2, name: partie, exact: true })).toBeVisible();
  for (const titre of ["Une lecture, pas un conseil", "Dès 15 ans", "Les bulles", `Qui te vend${NB}: Whop`, "Livré tout de suite, sans rétractation", "Un souci, un remboursement"])
    await expect(main.getByRole("heading", { level: 3, name: titre, exact: true })).toBeVisible();
  await expect(main.getByText("BLUSH est ouvert dès 15 ans. Plus jeune, il te faut l’accord d’un parent.")).toBeVisible();
  await expect(main.getByText(/en payant, tu l’acceptes/)).toBeVisible();
  await expect(main.getByText(`Ces conditions suivent ${droitApplicable()}, sans te priver des protections impératives de ton pays de résidence.`)).toBeVisible();
  await expect(main.getByText("Une réponse en vocal\u00a0: 2 bulles.")).toBeVisible();
  /* L’éditeur, en une ligne, au pied : il mène aux mentions légales */
  const editeur = main.getByRole("link", { name: /^L’éditeur/ });
  await expect(editeur).toHaveAttribute("href", "/mentions-legales");
  await expect(editeur).toContainText(identiteEditeur());
  await expect(main.getByRole("link", { name: /Une question\s*\? Écris-nous/ })).toHaveAttribute("href", "mailto:bonjour@askblush.com");
  const texte = await main.innerText();
  for (const nom of ["Anthropic", "Claude", "ElevenLabs", "Mistral", "OpenAI"]) expect(texte, nom).not.toContain(nom);
  expect(texte).not.toContain(A_COMPLETER);
  /* Le pied de la page mène aux deux autres pages légales */
  const liens = page.getByRole("navigation", { name: "Pages légales" });
  await expect(liens.getByRole("link")).toHaveCount(2);
  await liens.getByRole("link", { name: "Mentions légales" }).click();
  await expect(page).toHaveURL(/\/mentions-legales$/);
});

test("les mentions légales : l’éditeur (ses seuls champs remplis, rien « À compléter »), l’hébergeur, le médiateur s’il y en a un", async ({ page }) => {
  const reponse = await page.goto("/mentions-legales");
  expect(reponse?.status()).toBe(200);
  await expect(page).toHaveTitle("Mentions légales · BLUSH");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Mentions légales" })).toBeVisible();
  const editeur = main.getByRole("region", { name: "L’éditeur" });
  /* L’éditeur d’aujourd’hui est complet (la production peut s’ouvrir) : chacune de ses lignes, et rien d’autre */
  const lignes = lignesEditeur();
  expect(lignes.every((l) => l.valeur)).toBe(true);
  for (const { libelle, valeur } of lignes) {
    await expect(editeur.getByText(libelle, { exact: true })).toBeVisible();
    await expect(editeur.getByText(valeur!, { exact: true })).toBeVisible();
  }
  await expect(editeur.getByText(A_COMPLETER)).toHaveCount(0);
  for (const facultatif of ["Forme juridique", "Siège", "Pays", "Téléphone", "Directeur de la publication"])
    if (!lignes.some((l) => l.libelle === facultatif)) await expect(editeur.getByText(facultatif, { exact: true })).toHaveCount(0);
  await expect(editeur.getByRole("link", { name: /bonjour@askblush\.com/ })).toHaveAttribute("href", "mailto:bonjour@askblush.com");
  await expect(main.getByRole("region", { name: "L’hébergeur" }).getByText("Vercel Inc.")).toBeVisible();
  await expect(main.getByText(/médiateur de la consommation/)).toHaveCount(EDITEUR.mediateur.trim() ? 1 : 0);
  await page.getByRole("navigation", { name: "Pages légales" }).getByRole("link", { name: "Confidentialité" }).click();
  await expect(page).toHaveURL(/\/confidentialite$/);
});

test("la confidentialité nomme Whop et Cloudflare, dit le rappel et l’accord de l’import, et mène aux autres pages légales", async ({ page }) => {
  await page.goto("/confidentialite");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 2, name: "Quand tu paies", exact: true })).toBeVisible();
  await expect(main.getByText("Whop, pour le paiement")).toBeVisible();
  await expect(main.getByText(/jamais ta conv, ni un prénom/)).toBeVisible();
  await expect(main.getByText("Pas de robots")).toBeVisible();
  await expect(main.getByText("Un rappel, une seule fois")).toBeVisible();
  await expect(main.getByText("Ton accord, avant chaque conv")).toBeVisible();
  /* L’email : chaque prestataire qui le reçoit est dit (les mails, le reçu), comme dans la liste plus bas */
  await expect(main.getByText(/jamais vendu\. Il ne sort de BLUSH que pour t’écrire \(Resend\) et, quand tu paies, pour ton reçu \(Whop\)\./)).toBeVisible();
  for (const prestataire of ["Whop", "Cloudflare"]) await expect(main.getByText(prestataire, { exact: true })).toBeVisible();
  const liens = page.getByRole("navigation", { name: "Pages légales" });
  await expect(liens.getByRole("link", { name: "Conditions" })).toHaveAttribute("href", "/conditions");
  await expect(liens.getByRole("link", { name: "Mentions légales" })).toHaveAttribute("href", "/mentions-legales");
});

test("les pieds de page : la landing et « Mon compte » mènent aux conditions et aux mentions légales", async ({ page }, testInfo) => {
  await test.step("la landing", async () => {
    await page.goto("/");
    const pied = page.getByRole("navigation", { name: "Pied de page" });
    await expect(pied.getByRole("link", { name: "Conditions" })).toHaveAttribute("href", "/conditions");
    await expect(pied.getByRole("link", { name: "Mentions légales" })).toHaveAttribute("href", "/mentions-legales");
    await pied.getByRole("link", { name: "Conditions" }).click();
    await expect(page).toHaveURL(/\/conditions$/);
    await expect(page.getByRole("heading", { level: 1, name: "Conditions" })).toBeVisible();
  });

  await test.step("« Mon compte »", async () => {
    await connecterParApi(page, testInfo, emailLibre(testInfo, "juridique-compte"));
    await ouvrir(page, "/compte");
    const liens = page.getByRole("navigation", { name: "Pages légales" });
    await expect(liens.getByRole("link")).toHaveCount(3);
    await liens.getByRole("link", { name: "Mentions légales" }).click();
    await expect(page).toHaveURL(/\/mentions-legales$/);
  });
});

test("l’export : aucune case, la ligne de l’accord juste au-dessus du bouton ; le fichier choisi, la conv entre avec la version de l’accord", async ({ page }, testInfo) => {
  const conv = exportWhatsApp(testInfo, { format: "txt" });
  await page.goto("/importer/export?app=whatsapp");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  const ligne = page.getByText(texteCaseImport(), { exact: true });
  await expect(ligne).toBeVisible();
  /* Le lien des conditions s’ouvre à côté : rien de l’import n’est perdu */
  await expect(page.getByRole("link", { name: "conditions", exact: true })).toHaveAttribute("target", "_blank");
  const bouton = page.getByRole("button", { name: "Choisir le fichier enregistré", exact: true });
  /* Juste au-dessus du bouton */
  const [l, b] = [(await ligne.boundingBox())!, (await bouton.boundingBox())!];
  expect(b.y - (l.y + l.height), "la ligne juste au-dessus du bouton").toBeGreaterThanOrEqual(0);
  expect(b.y - (l.y + l.height), "la ligne juste au-dessus du bouton").toBeLessThan(24);

  const reponse = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/import");
  const [selecteur] = await Promise.all([page.waitForEvent("filechooser"), bouton.click()]);
  await selecteur.setFiles(conv.chemin);
  const envoi = await reponse;
  expect(envoi.status()).toBe(200);
  /* L’histoire garde l’accord : la version du texte de la ligne, et son heure */
  const { story } = (await envoi.json()) as { story: { id: string } };
  const [accordGarde] = await sql()<{ version: string; le: Date | null }[]>`select consentement_version as version, consentement_le as le from stories where id = ${story.id}`;
  expect(accordGarde?.version).toBe(CASE_IMPORT.version);
  expect(accordGarde?.le).toBeTruthy();
  await expect(page.getByRole("heading", { level: 1, name: "C’est bon, on a votre conv." })).toBeVisible();
});

test("l’accord refusé par le serveur (BLUSH a changé son texte) : rien ne repart avant la page rechargée", async ({ page }, testInfo) => {
  const conv = exportWhatsApp(testInfo, { format: "txt" });
  await page.goto("/importer/export?app=whatsapp");
  /* Le serveur a une autre version de l’accord que cet onglet : il répond comme après une mise à jour de BLUSH */
  let envois = 0;
  await page.route("**/api/import", (route) => (envois++, route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ erreur: "consentement" }) })));
  const bouton = page.getByRole("button", { name: "Choisir le fichier enregistré", exact: true });
  const [selecteur] = await Promise.all([page.waitForEvent("filechooser"), bouton.click()]);
  await selecteur.setFiles(conv.chemin);
  const alerte = page.getByRole("alert").filter({ hasText: CASE_IMPORT.perimee });
  await expect(alerte).toBeVisible();
  await expect(page.getByText(texteCaseImport(), { exact: true })).toHaveCount(0);
  expect(envois).toBe(1);

  await test.step("retouché, le bouton ne laisse rien repartir (la même version serait refusée sans fin) : le focus va au rechargement", async () => {
    let selecteurs = 0;
    page.on("filechooser", () => void selecteurs++);
    await bouton.click();
    await expect(alerte.getByRole("button", { name: CASE_IMPORT.recharger })).toBeFocused();
    expect(selecteurs).toBe(0);
    expect(envois).toBe(1);
  });

  await test.step("« Recharger la page » : la page revient, la ligne de l’accord à sa place", async () => {
    await Promise.all([page.waitForEvent("load"), alerte.getByRole("button", { name: CASE_IMPORT.recharger }).click()]);
    await expect(page.getByText(texteCaseImport(), { exact: true })).toBeVisible();
    await expect(alerte).toHaveCount(0);
  });
});

test("les captures : aucune case, la ligne de l’accord au-dessus du bouton ; « Continuer » les envoie, et BLUSH les lit", async ({ page }, testInfo) => {
  await page.goto("/importer/captures?app=autre");
  const envois: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/captures") envois.push(r.method());
  });
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByText(texteCaseImport(), { exact: true })).toBeVisible();
  const [selecteur] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Choisir mes captures", exact: true }).click()]);
  await selecteur.setFiles(capturesPng(testInfo, 2));
  expect(envois).toEqual([]);
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page).toHaveURL(/\/importer\/ok$/, { timeout: 45_000 });
  expect(envois).toEqual(["POST"]);
});

test("l’API refuse un import sans l’accord, ou avec une version périmée (dont celle de l’ancienne case) : 422 consentement", async ({ request }, testInfo) => {
  const envoyer = (consentement?: string) =>
    request.post("/api/import", {
      headers: { origin: URL_APPLI },
      multipart: { fichier: { name: "_chat.txt", mimeType: "text/plain", buffer: Buffer.from(texteWhatsApp()) }, ...(consentement ? { consentement } : {}) },
    });
  for (const consentement of [undefined, "2020-01-01", "2026-10-12"]) {
    const r = await envoyer(consentement);
    expect.soft(r.status(), consentement ?? "sans l’accord").toBe(422);
    expect.soft(await r.json(), consentement ?? "sans l’accord").toEqual({ erreur: "consentement" });
  }
  /* L’accord vérifié avant le CAPTCHA : les refus n’ont pas usé le laissez-passer, pris pour l’import accepté */
  await prouverHumain(request, testInfo);
  expect((await envoyer(CASE_IMPORT.version)).status()).toBe(200);
});
