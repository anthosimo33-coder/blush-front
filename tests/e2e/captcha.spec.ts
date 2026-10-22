import type { Page, Request } from "@playwright/test";
import { CASE_IMPORT } from "../../src/contenu/consentements";
import { ENTETE_CAPTCHA, JETON_DE_TEST, SCRIPT_TURNSTILE } from "../../src/lib/captcha";
import {
  capturesPng,
  choisirFichier,
  connecterParApi,
  emailLibre,
  ENTETE_DU_JETON,
  expect,
  exportWhatsApp,
  LECTURE_DES_CAPTURES,
  prouverHumain,
  reponseAuGeste,
  test,
  texteWhatsApp,
  URL_APPLI,
  type SuiviDuWidget,
} from "./aide";

/*
 * Le CAPTCHA (Cloudflare Turnstile) aux trois portes sans compte : la demande de code, l’import d’un export et les
 * captures. Les serveurs ont les clés de test qui passent toujours, et le navigateur reçoit un faux script de Cloudflare
 * (aide/captcha.ts) : rien ne part sur le réseau. On vérifie que l’écran monte le widget (et lui seul charge le script),
 * que son jeton part avec la demande, et que le serveur refuse sans lui, avant de compter quoi que ce soit.
 */

/** Ce que le faux widget a fait dans la page. */
const suiviDuWidget = (page: Page) => page.evaluate(() => (window as unknown as { __turnstile?: SuiviDuWidget }).__turnstile ?? null);

/** Les demandes du script de Cloudflare faites par ce navigateur, d’ici à la fin du test. */
function scriptsDeCloudflare(page: Page): string[] {
  const vus: string[] = [];
  page.on("request", (r: Request) => void (r.url() === SCRIPT_TURNSTILE && vus.push(page.url())));
  return vus;
}

test("le script de Cloudflare ne se charge que sur les écrans qui en ont besoin", async ({ page }) => {
  const vus = scriptsDeCloudflare(page);
  for (const adresse of ["/", "/commencer", "/confidentialite"]) {
    await page.goto(adresse);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  expect(vus).toEqual([]);
  await page.goto("/connexion");
  await expect.poll(() => vus.length).toBe(1);
  await expect.poll(async () => (await suiviDuWidget(page))?.actions).toEqual(["code"]);
});

test("la demande de code : le jeton du widget part avec elle ; sans lui, le serveur refuse avant toute limite", async ({ page, request }, testInfo) => {
  const email = emailLibre(testInfo, "captcha");

  await test.step("à l’écran : le widget, discret, rend son jeton, qui part dans l’en-tête de la demande", async () => {
    await page.goto("/connexion");
    await page.getByLabel("Ton email").fill(email);
    const reponse = await reponseAuGeste(page, { chemin: "/api/auth/code" }, () => page.getByRole("button", { name: "Recevoir mon code" }).click());
    expect(reponse.request().headers()[ENTETE_CAPTCHA]).toBe(JETON_DE_TEST);
    expect(reponse.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Entre ton code." })).toBeVisible();
  });

  await test.step("« Renvoyer le code » a son jeton aussi, du widget de l’écran du code (le script, lui, n’est chargé qu’une fois)", async () => {
    await expect.poll(async () => (await suiviDuWidget(page))?.actions).toEqual(["code", "code"]);
  });

  await test.step("sans jeton, par la route : 403 « captcha » ; avec le jeton factice, elle passe", async () => {
    const sans = await request.post("/api/auth/code", { headers: { origin: URL_APPLI }, data: { email } });
    expect([sans.status(), await sans.json()]).toEqual([403, { erreur: "captcha" }]);
    const avec = await request.post("/api/auth/code", { headers: { origin: URL_APPLI, ...ENTETE_DU_JETON }, data: { email } });
    expect(avec.status()).toBe(200);
  });
});

test("l’import sans compte : le laissez-passer pris pendant la préparation du fichier, puis l’import ; sans lui, refusé", async ({ page, request }, testInfo) => {
  const conv = exportWhatsApp(testInfo);

  await test.step("à l’écran : /api/captcha avec le jeton, puis /api/import, qui passe", async () => {
    const appels: string[] = [];
    page.on("request", (r) => {
      const chemin = new URL(r.url()).pathname;
      if (chemin === "/api/captcha" || chemin === "/api/import") appels.push(`${chemin} ${r.headers()[ENTETE_CAPTCHA] ?? "-"}`);
    });
    await page.goto("/importer/export?app=whatsapp");
    const reponse = await reponseAuGeste(page, { chemin: "/api/import" }, () => choisirFichier(page, conv.chemin));
    expect(reponse.status()).toBe(200);
    expect(appels).toEqual([`/api/captcha ${JETON_DE_TEST}`, "/api/import -"]);
    await expect(page.getByRole("heading", { level: 1, name: "C’est bon, on a votre conv." })).toBeVisible();
    /* Le laissez-passer est un cookie httpOnly : le script de la page ne le voit pas */
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "blush-humain")?.httpOnly).toBe(true);
  });

  await test.step("par la route, sans laissez-passer : 403 « captcha » ; avec, un import et son nouvel essai, pas un troisième", async () => {
    const importer = () =>
      request.post("/api/import", {
        headers: { origin: URL_APPLI },
        multipart: { fichier: { name: "_chat.txt", mimeType: "text/plain", buffer: Buffer.from(texteWhatsApp()) }, consentement: CASE_IMPORT.version },
      });
    const sans = await importer();
    expect([sans.status(), await sans.json()]).toEqual([403, { erreur: "captcha" }]);
    const refuse = await request.post("/api/captcha", { headers: { origin: URL_APPLI } });
    expect([refuse.status(), await refuse.json()]).toEqual([403, { erreur: "captcha" }]);
    await prouverHumain(request, testInfo);
    expect((await importer()).status()).toBe(200);
    expect((await importer()).status()).toBe(200);
    expect((await importer()).status()).toBe(403);
  });
});

test("les captures sans compte : le laissez-passer, puis la lecture", async ({ page }, testInfo) => {
  test.setTimeout(LECTURE_DES_CAPTURES * 2);
  const appels: string[] = [];
  page.on("request", (r) => {
    const chemin = new URL(r.url()).pathname;
    if (chemin === "/api/captcha" || chemin === "/api/captures") appels.push(chemin);
  });
  await page.goto("/importer/captures?app=hinge");
  await expect(page.getByRole("heading", { level: 1, name: "Choisis tes captures." })).toBeVisible();
  await expect.poll(async () => (await suiviDuWidget(page))?.actions).toEqual(["import"]);
  await choisirFichier(page, capturesPng(testInfo, 2), "Choisir mes captures");
  const reponse = await reponseAuGeste(page, { chemin: "/api/captures", timeout: LECTURE_DES_CAPTURES }, () => page.getByRole("button", { name: "Continuer" }).click());
  expect(reponse.status()).toBe(200);
  expect(appels).toEqual(["/api/captcha", "/api/captures"]);
  await expect(page.getByRole("heading", { level: 1, name: "C’est bon, on a votre conv." })).toBeVisible();
});

test("le script de Cloudflare bloqué (une extension, un réseau d’entreprise) : sans compte, le message tout de suite ; connecté, l’import part sans attendre", async ({
  page,
}, testInfo) => {
  /* Le script ne vient pas : la route de la page passe avant le faux script du contexte (aide/captcha.ts) */
  await page.route(SCRIPT_TURNSTILE, (route) => route.abort());
  const conv = exportWhatsApp(testInfo);
  const imports: string[] = [];
  page.on("request", (r) => void (new URL(r.url()).pathname === "/api/import" && imports.push(r.method())));
  /* Attendre le jeton, ce serait 20 secondes (jetonCaptcha) : bien au-delà de ce que ces étapes s’accordent */
  const vite = { timeout: 10_000 };

  await test.step("sans compte : « captcha », dit à l’écran, et rien n’est importé", async () => {
    await page.goto("/importer/export?app=whatsapp");
    await choisirFichier(page, conv.chemin);
    await expect(page.getByText("On n’a pas pu vérifier que tu n’es pas un robot.", { exact: false })).toBeVisible(vite);
    expect(imports).toEqual([]);
  });

  await test.step("connecté : le serveur ne demande rien, l’import part", async () => {
    await connecterParApi(page, testInfo, emailLibre(testInfo, "captcha-bloque"));
    await page.goto("/importer/export?app=whatsapp");
    const reponse = await reponseAuGeste(page, { chemin: "/api/import", timeout: vite.timeout }, () => choisirFichier(page, conv.chemin));
    expect(reponse.status()).toBe(200);
  });
});
