import { CASE_IMPORT } from "../../src/contenu/consentements";
import { caseImport, capturesPng, connecterParApi, emailLibre, expect, exportWhatsApp, ouvrir, sql, test, texteWhatsApp, URL_APPLI } from "./aide";

/*
 * Le juridique : les pages /conditions et /mentions-legales, leurs liens au pied de la landing, de la confidentialité et
 * de « Mon compte », et la case de l’import (« J’ai 18 ans ou plus… ») : sans elle, rien ne part, à l’écran comme par
 * l’API ; avec elle, la conv entre. Les autres tests la cochent par choisirFichier (aide/page.ts, accepterImport).
 */

const NB = "\u00a0";

test("les conditions : utiliser BLUSH puis acheter, Whop, la rétractation, les bulles, sans nommer d’IA", async ({ page }) => {
  const reponse = await page.goto("/conditions");
  expect(reponse?.status()).toBe(200);
  await expect(page).toHaveTitle("Conditions · BLUSH");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Conditions" })).toBeVisible();
  for (const partie of ["Utiliser BLUSH", "Acheter"]) await expect(main.getByRole("heading", { level: 2, name: partie, exact: true })).toBeVisible();
  for (const titre of [
    "Une lecture, pas un conseil",
    "18 ans et plus",
    "Les bulles",
    `Qui te vend${NB}: Whop`,
    "Livré tout de suite, sans rétractation",
    "Un souci, un remboursement",
  ])
    await expect(main.getByRole("heading", { level: 3, name: titre, exact: true })).toBeVisible();
  await expect(main.getByText(/Je veux mon rapport tout de suite et je renonce à mon droit de rétractation/)).toBeVisible();
  await expect(main.getByText("Une réponse en vocal\u00a0: 2 bulles.")).toBeVisible();
  await expect(main.getByRole("link", { name: /Une question\s*\? Écris-nous/ })).toHaveAttribute("href", "mailto:bonjour@askblush.com");
  const texte = await main.innerText();
  for (const nom of ["Anthropic", "Claude", "ElevenLabs", "Mistral", "OpenAI"]) expect(texte, nom).not.toContain(nom);
  /* Le pied de la page mène aux deux autres pages légales */
  const liens = page.getByRole("navigation", { name: "Pages légales" });
  await expect(liens.getByRole("link")).toHaveCount(2);
  await liens.getByRole("link", { name: "Mentions légales" }).click();
  await expect(page).toHaveURL(/\/mentions-legales$/);
});

test("les mentions légales : l’éditeur (encore « À compléter »), l’hébergeur, le médiateur", async ({ page }) => {
  const reponse = await page.goto("/mentions-legales");
  expect(reponse?.status()).toBe(200);
  await expect(page).toHaveTitle("Mentions légales · BLUSH");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Mentions légales" })).toBeVisible();
  const editeur = main.getByRole("region", { name: "L’éditeur" });
  await expect(editeur.getByText("Directeur de la publication")).toBeVisible();
  /* L’identité n’est pas encore connue (TODO(produit) de src/contenu/mentions-legales.ts) : la production reste fermée au public */
  await expect(editeur.getByText("À compléter")).toHaveCount(6);
  await expect(editeur.getByRole("link", { name: /bonjour@askblush\.com/ })).toHaveAttribute("href", "mailto:bonjour@askblush.com");
  await expect(main.getByRole("region", { name: "L’hébergeur" }).getByText("Vercel Inc.")).toBeVisible();
  await expect(main.getByText(/médiateur de la consommation/)).toBeVisible();
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

test("l’export : sans la case, le choix du fichier ne s’ouvre pas ; cochée, la conv entre", async ({ page }, testInfo) => {
  const conv = exportWhatsApp(testInfo, { format: "txt" });
  await page.goto("/importer/export?app=whatsapp");
  const accord = caseImport(page);
  await expect(accord).not.toBeChecked();
  /* Le lien des conditions s’ouvre à côté : rien de l’import n’est perdu */
  await expect(page.getByRole("link", { name: "conditions", exact: true })).toHaveAttribute("target", "_blank");
  let selecteurs = 0;
  page.on("filechooser", () => void selecteurs++);
  const bouton = page.getByRole("button", { name: "Choisir le fichier enregistré", exact: true });

  await test.step("sans la case : le message, le focus sur elle, et rien ne s’ouvre", async () => {
    await bouton.click();
    await expect(page.getByRole("alert").filter({ hasText: CASE_IMPORT.manquante })).toBeVisible();
    await expect(accord).toBeFocused();
    await expect(accord).toHaveAttribute("aria-invalid", "true");
    expect(selecteurs).toBe(0);
  });

  await test.step("cochée : le message part, le fichier se choisit, la conv entre", async () => {
    await accord.check();
    await expect(page.getByRole("alert").filter({ hasText: CASE_IMPORT.manquante })).toHaveCount(0);
    const reponse = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/import");
    const [selecteur] = await Promise.all([page.waitForEvent("filechooser"), bouton.click()]);
    await selecteur.setFiles(conv.chemin);
    const envoi = await reponse;
    expect(envoi.status()).toBe(200);
    /* L’histoire garde l’accord : la version de la case cochée, et son heure */
    const { story } = (await envoi.json()) as { story: { id: string } };
    const [accordGarde] = await sql()<{ version: string; le: Date | null }[]>`select consentement_version as version, consentement_le as le from stories where id = ${story.id}`;
    expect(accordGarde?.version).toBe(CASE_IMPORT.version);
    expect(accordGarde?.le).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1, name: "C’est bon, on a votre conv." })).toBeVisible();
  });
});

test("les captures : choisies sans la case, « Continuer » n’envoie rien ; cochée, BLUSH les lit", async ({ page }, testInfo) => {
  await page.goto("/importer/captures?app=autre");
  const envois: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/captures") envois.push(r.method());
  });
  const [selecteur] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Choisir mes captures", exact: true }).click()]);
  await selecteur.setFiles(capturesPng(testInfo, 2));
  const continuer = page.getByRole("button", { name: "Continuer" });
  await continuer.click();
  await expect(page.getByRole("alert").filter({ hasText: CASE_IMPORT.manquante })).toBeVisible();
  await expect(caseImport(page)).toBeFocused();
  expect(envois).toEqual([]);
  await caseImport(page).check();
  await continuer.click();
  await expect(page).toHaveURL(/\/qui$/, { timeout: 45_000 });
  expect(envois).toEqual(["POST"]);
});

test("l’API refuse un import sans la case, ou avec une version périmée : 422 consentement", async ({ request }) => {
  const envoyer = (consentement?: string) =>
    request.post("/api/import", {
      headers: { origin: URL_APPLI },
      multipart: { fichier: { name: "_chat.txt", mimeType: "text/plain", buffer: Buffer.from(texteWhatsApp()) }, ...(consentement ? { consentement } : {}) },
    });
  for (const consentement of [undefined, "2020-01-01"]) {
    const r = await envoyer(consentement);
    expect.soft(r.status(), consentement ?? "sans la case").toBe(422);
    expect.soft(await r.json(), consentement ?? "sans la case").toEqual({ erreur: "consentement" });
  }
  expect((await envoyer(CASE_IMPORT.version)).status()).toBe(200);
});
