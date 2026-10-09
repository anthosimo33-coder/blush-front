import { chatEnVocal, ecrireABlush, expect, filDuChat, lectureBlushPlus, litLeMp3, ouvrir, reponseAuGeste, tesMessagesAuChat, test } from "./aide";

/*
 * Le chat en vocal (/app) : BLUSH répond en vocal quand on le lui demande (« parle-moi en vocal », que le modèle factice
 * reconnaît), jusqu’à ce qu’on repasse à l’écrit ; et nos propres vocaux, enregistrés au micro, que BLUSH écoute
 * (transcrits : le modèle factice entend toujours la même phrase) avant de répondre en vocal. La voix du modèle factice
 * est un silence en MP3, à la durée du texte (src/server/ia/voix.ts).
 */

/** La bulle d’un vocal de BLUSH : « Écouter le vocal de BLUSH (0:06) », puis « Mettre le vocal de BLUSH en pause » pendant qu’il joue. */
const VOCAL_DE_BLUSH = /^Écouter le vocal de BLUSH \(\d+:\d{2}\)$/;

test("« parle-moi en vocal » : BLUSH répond en vocal ; « Repasser à l’écrit » revient aux bulles, et ça tient après un rechargement", async ({ page }, testInfo) => {
  const email = await lectureBlushPlus(page, testInfo);
  await ouvrir(page, "/app");
  const fil = filDuChat(page);
  const bandeau = page.getByRole("status").filter({ hasText: "BLUSH te répond en vocal" });
  const vocal = fil.getByRole("button", { name: VOCAL_DE_BLUSH });

  await test.step("demandé par écrit : BLUSH répond par un vocal, et le chat passe en vocal", async () => {
    expect(await ecrireABlush(page, "parle-moi en vocal stp")).toBe(200);
    await expect(vocal).toHaveCount(1);
    await expect(bandeau).toBeVisible();
    /* En vocal, ses bulles écrites ne s’affichent pas */
    await expect(fil.getByText("elle te cherche 👀")).toHaveCount(0);
    expect(await chatEnVocal(email)).toBe(true);
  });

  await test.step("le vocal vient du serveur, en MP3 ; là où le navigateur le lit, il se met en pause d’un toucher", async () => {
    const audio = await reponseAuGeste(page, { chemin: /^\/api\/vocal\/chat\/\d+$/, methode: "GET" }, () => vocal.click());
    const chemin = new URL(audio.url()).pathname;
    /*
     * Le toucher a demandé le vocal ; ce que le serveur sert se vérifie par une requête de la même session : le WebKit de
     * Linux (la CI) charge les médias hors de son réseau habituel, et Playwright y lit un statut 0
     */
    const fichier = await page.request.get(chemin);
    expect(fichier.status()).toBe(200);
    expect(fichier.headers()["content-type"]).toBe("audio/mpeg");
    if (await litLeMp3(page, chemin)) {
      const pause = fil.getByRole("button", { name: "Mettre le vocal de BLUSH en pause" });
      await expect(pause).toBeVisible();
      await pause.click();
      await expect(vocal).toBeVisible();
    }
  });

  await test.step("« Repasser à l’écrit » : le bandeau s’en va, et la réponse suivante revient en bulles", async () => {
    await bandeau.getByRole("button", { name: "Repasser à l’écrit" }).click();
    await expect(bandeau).toBeHidden();
    await expect.poll(() => chatEnVocal(email)).toBe(false);
    expect(await ecrireABlush(page, "et là, elle pense quoi ?")).toBe(200);
    await expect(fil.getByText("elle te cherche 👀")).toBeVisible();
    await expect(vocal).toHaveCount(1);
  });

  await test.step("rechargé : toujours à l’écrit, le vocal de tout à l’heure est encore là", async () => {
    await ouvrir(page);
    await expect(fil.getByText("elle te cherche 👀")).toBeVisible();
    await expect(vocal).toHaveCount(1);
    await expect(bandeau).toHaveCount(0);
  });
});

test("le micro refusé : BLUSH le dit dans la conv, et rien n’est enregistré", async ({ page }, testInfo) => {
  /*
   * La fenêtre d’autorisation du navigateur répond non (on ne la pilote pas : sa réponse est jouée ici). Un navigateur
   * de test sans micro du tout (WebKit sans écran) reçoit de quoi poser la question : c’est le refus qu’on regarde.
   */
  await page.addInitScript(() => {
    const refus = () => Promise.reject(new DOMException("Refusé", "NotAllowedError"));
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = refus;
    else Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: refus } });
    if (typeof MediaRecorder === "undefined") Object.assign(window, { MediaRecorder: class {} });
  });
  const email = await lectureBlushPlus(page, testInfo);
  await ouvrir(page, "/app");
  await page.getByRole("button", { name: "Enregistrer un vocal" }).click();
  await expect(filDuChat(page).getByText("Je n’ai pas accès à ton micro. Autorise-le dans les réglages de ton navigateur, ou écris-moi.")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Enregistrement du vocal en cours" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enregistrer un vocal" })).toBeEnabled();
  expect(await tesMessagesAuChat(email)).toEqual([]);
});

test("au micro : un vocal annulé ne part pas ; un vocal envoyé est écouté par BLUSH, qui répond en vocal", async ({ page, browserName }, testInfo) => {
  /* Un micro factice : Chromium seulement (--use-fake-device-for-media-stream, playwright.config.ts) */
  test.skip(browserName !== "chromium", "le micro factice est celui de Chromium");
  const email = await lectureBlushPlus(page, testInfo);
  await ouvrir(page, "/app");
  const fil = filDuChat(page);
  const enregistrer = page.getByRole("button", { name: "Enregistrer un vocal" });
  const enCours = page.getByRole("status").filter({ hasText: "Enregistrement du vocal en cours" });
  /* Chaque envoi au chat : aucun ne doit partir quand on annule */
  const envois: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/chat" && r.method() === "POST") envois.push(r.headers()["content-type"] ?? "");
  });

  await test.step("l’enregistrement démarre, « Annuler le vocal » le jette sans rien envoyer", async () => {
    await enregistrer.click();
    await expect(enCours).toBeAttached();
    await page.getByRole("button", { name: "Annuler le vocal" }).click();
    await expect(enCours).toHaveCount(0);
    await expect(enregistrer).toBeVisible();
    expect(envois).toEqual([]);
  });

  await test.step("un vocal d’une seconde, « Envoyer le vocal » : il part, BLUSH l’écoute et répond en vocal", async () => {
    await enregistrer.click();
    await expect(enCours).toBeAttached();
    /* Le compteur passe à une seconde : assez pour un vocal (moins d’une demi-seconde, il serait jeté) */
    await expect(page.getByText("0:01", { exact: true })).toBeVisible();
    const reponse = await reponseAuGeste(page, { chemin: "/api/chat" }, () => page.getByRole("button", { name: "Envoyer le vocal" }).click());
    expect(reponse.status()).toBe(200);
    expect(envois).toEqual([expect.stringMatching(/^multipart\/form-data/)]);
    await expect(fil.getByRole("button", { name: /^Écouter ton vocal \(\d+:\d{2}\)$/ })).toBeVisible();
    await expect(fil.getByRole("button", { name: VOCAL_DE_BLUSH })).toBeVisible();
  });

  await test.step("côté serveur : ce que BLUSH a entendu est gardé comme ton message, marqué « (vocal) »", async () => {
    expect(await tesMessagesAuChat(email)).toEqual([expect.stringMatching(/^\(vocal\) .+/)]);
  });
});
