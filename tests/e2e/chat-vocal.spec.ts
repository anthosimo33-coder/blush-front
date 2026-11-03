import type { Page } from "@playwright/test";
import { DUREE_VOCAL_MAX_S, TAILLE_VOCAL_MAX } from "../../src/server/ia/duree-audio";
import { chatEnVocal, ecrireABlush, expect, filDuChat, lectureComplete, litLeMp3, ouvrir, RESEAU, reponseAuGeste, tesMessagesAuChat, test } from "./aide";

/*
 * Le chat en vocal (/app) : BLUSH répond en vocal quand on le lui demande (« parle-moi en vocal », que le modèle factice
 * reconnaît), jusqu’à ce qu’on repasse à l’écrit ; et nos propres vocaux, enregistrés au micro, que BLUSH écoute
 * (transcrits : le modèle factice entend toujours la même phrase) avant de répondre en vocal. La voix du modèle factice
 * est un silence en MP3, à la durée du texte (src/server/ia/voix.ts).
 */

/** La bulle d’un vocal de BLUSH : « Écouter le vocal de BLUSH (0:06) », puis « Mettre le vocal de BLUSH en pause » pendant qu’il joue. */
const VOCAL_DE_BLUSH = /^Écouter le vocal de BLUSH \(\d+:\d{2}\)$/;

test("« parle-moi en vocal » : BLUSH répond en vocal ; « Repasser à l’écrit » revient aux bulles, et ça tient après un rechargement", async ({ page }, testInfo) => {
  const email = await lectureComplete(page, testInfo);
  await ouvrir(page, "/app");
  const fil = filDuChat(page);
  const bandeau = page.getByRole("status").filter({ hasText: "BLUSH te répond en vocal" });
  const vocal = fil.getByRole("button", { name: VOCAL_DE_BLUSH });
  /*
   * Le vocal de la dernière réponse se prépare en mémoire dès qu’il est à l’écran (src/app/app/voice.tsx, VocalBlush) :
   * il est demandé au serveur avant le toucher, ou au toucher s’il n’en a pas eu le temps. On l’attend donc dès l’envoi,
   * et l’attente ne reste pas sans personne pour l’écouter si le test échoue avant
   */
  const demandeDuVocal = page.waitForResponse((r) => /^\/api\/vocal\/chat\/\d+$/.test(new URL(r.url()).pathname) && r.request().method() === "GET", { timeout: 2 * RESEAU });
  demandeDuVocal.catch(() => {});

  await test.step("demandé par écrit : BLUSH répond par un vocal, et le chat passe en vocal", async () => {
    expect(await ecrireABlush(page, "parle-moi en vocal stp")).toBe(200);
    await expect(vocal).toHaveCount(1);
    await expect(bandeau).toBeVisible();
    /* En vocal, ses bulles écrites ne s’affichent pas */
    await expect(fil.getByText("elle te cherche 👀")).toHaveCount(0);
    expect(await chatEnVocal(email)).toBe(true);
  });

  await test.step("le vocal vient du serveur, en MP3 ; là où le navigateur le lit, il se met en pause d’un toucher", async () => {
    await vocal.click();
    const audio = await demandeDuVocal;
    const chemin = new URL(audio.url()).pathname;
    /*
     * Le vocal a été demandé (avant le toucher, ou par lui) ; ce que le serveur sert se vérifie par une requête de la
     * même session : le WebKit de Linux (la CI) charge les médias hors de son réseau habituel, et Playwright y lit un
     * statut 0
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
    /* Ses bulles arrivent en flux, avant que l’échange soit gardé : sa question de la fin dit la réponse entière, enregistrée */
    await expect(fil.getByText("tu lui as répondu quoi ?")).toBeVisible();
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
  const email = await lectureComplete(page, testInfo);
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
  const email = await lectureComplete(page, testInfo);
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

/*
 * Le poids d’un vocal (S-15) : l’enregistreur demande 32 kb/s (src/app/app/voice.tsx, DEBIT_VOCAL), mais seul Chromium
 * suit l’option ; le WebKit de Playwright l’accepte puis encode en AAC au débit que le son lui dicte. Ce test mesure ce
 * qui part vraiment au serveur, sur les deux navigateurs, avec le même micro de synthèse : un souffle et un la, plus durs
 * à compresser qu’une voix (le pire cas).
 *   - Chromium : au plus 5 ko par seconde (32 kb/s et l’enveloppe), pour que le débit ne remonte pas en silence.
 *   - Partout : un vocal de la durée que le serveur accepte (130 s, mesurées par le serveur), à ce débit, tient
 *     sous la taille maximale du serveur. Si elle baisse, ce test dit si les vocaux de l’iPhone passent encore.
 */

/**
 * Le micro de synthèse (un souffle et un la, mêlés dans un flux de l’audio du navigateur, à un volume que la page peut
 * couper : window.volumeDuMicro), et le vocal envoyé au chat, gardé dans la page (window.vocalEnvoye).
 */
async function microDeSynthese(page: Page) {
  await page.addInitScript(() => {
    /* Le micro de synthèse : un souffle (un bruit blanc) et un la, mêlés dans un flux de l’audio du navigateur */
    const ouvrir = async () => {
      const ctx = new AudioContext();
      await ctx.resume().catch(() => {});
      const sortie = ctx.createMediaStreamDestination();
      const son = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const echantillons = son.getChannelData(0);
      for (let i = 0; i < echantillons.length; i++) echantillons[i] = (Math.random() * 2 - 1) * 0.2;
      const souffle = ctx.createBufferSource();
      souffle.buffer = son;
      souffle.loop = true;
      const la = ctx.createOscillator();
      la.frequency.value = 440;
      const volume = ctx.createGain();
      souffle.connect(volume);
      la.connect(volume);
      volume.connect(sortie);
      souffle.start();
      la.start();
      Object.assign(window, { volumeDuMicro: volume.gain });
      return sortie.stream;
    };
    /* Sur le prototype : WebKit remplace l’objet navigator.mediaDevices après le chargement, et une simple affectation s’y perd */
    Object.defineProperty(MediaDevices.prototype, "getUserMedia", { configurable: true, value: ouvrir });
    /* Ce qui part au chat : le poids du vocal, lu dans le formulaire envoyé */
    const vrai = window.fetch.bind(window);
    window.fetch = (entree, init) => {
      const vocal = init?.body instanceof FormData ? init.body.get("vocal") : null;
      if (vocal instanceof Blob) Object.assign(window, { vocalEnvoye: vocal });
      return vrai(entree, init);
    };
  });
}

/** Le navigateur enregistre-t-il un flux audio ? Le WebKit de Linux (la CI) n’a pas d’encodeur : un flux n’y donne aucun morceau. */
const enregistreUnFlux = (page: Page) =>
  page.evaluate(async () => {
    try {
      const ctx = new AudioContext();
      const sortie = ctx.createMediaStreamDestination();
      const la = ctx.createOscillator();
      la.connect(sortie);
      la.start();
      const enregistreur = new MediaRecorder(sortie.stream);
      const morceau = new Promise<boolean>((fin) => {
        enregistreur.ondataavailable = (e) => fin(e.data.size > 0);
        enregistreur.onerror = () => fin(false);
        setTimeout(() => fin(false), 3_000);
      });
      enregistreur.start();
      await new Promise((attente) => setTimeout(attente, 500));
      enregistreur.stop();
      const vu = await morceau;
      la.stop();
      await ctx.close();
      return vu;
    } catch {
      return false;
    }
  });

/** La durée du vocal envoyé au chat (microDeSynthese), celle du son décodé, son type et son poids. */
const vocalEnvoye = (page: Page) =>
  page.evaluate(async () => {
    const vocal = (window as unknown as { vocalEnvoye: Blob }).vocalEnvoye;
    const son = await new AudioContext().decodeAudioData(await vocal.arrayBuffer());
    return { octets: vocal.size, type: vocal.type, secondes: son.duration };
  });

test("le poids d’un vocal : ce qui part au serveur, au débit réel du navigateur, tient sous sa taille maximale", async ({ page, browserName }, testInfo) => {
  await microDeSynthese(page);
  await lectureComplete(page, testInfo);
  await ouvrir(page, "/app");
  test.skip(!(await enregistreUnFlux(page)), "ce navigateur n’enregistre pas un flux audio (le WebKit de Linux, sans encodeur)");
  await page.getByRole("button", { name: "Enregistrer un vocal" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Enregistrement du vocal en cours" })).toBeAttached();
  /* Quatre secondes : l’enveloppe du fichier compte peu devant le son */
  await expect(page.getByText("0:04", { exact: true })).toBeVisible({ timeout: 10_000 });
  const reponse = await reponseAuGeste(page, { chemin: "/api/chat" }, () => page.getByRole("button", { name: "Envoyer le vocal" }).click());
  expect(reponse.status()).toBe(200);
  await expect(filDuChat(page).getByRole("button", { name: /^Écouter ton vocal \(\d+:\d{2}\)$/ })).toBeVisible();
  /* Sa durée exacte, celle du son décodé (la bulle l’arrondit à la seconde) */
  const { octets, type, secondes } = await vocalEnvoye(page);
  const parSeconde = octets / secondes;
  testInfo.annotations.push({
    type: "débit d’un vocal",
    description: `${browserName} : ${type}, ${octets} octets pour ${secondes.toFixed(2)} s, ${Math.round((parSeconde * 8) / 1000)} kb/s`,
  });

  expect(secondes).toBeGreaterThanOrEqual(3.5);
  if (browserName === "chromium") expect(parSeconde, "Chromium suit les 32 kb/s demandés").toBeLessThanOrEqual(5_000);
  expect(parSeconde * DUREE_VOCAL_MAX_S, `un vocal de ${DUREE_VOCAL_MAX_S} s à ce débit`).toBeLessThanOrEqual(TAILLE_VOCAL_MAX);
});

/*
 * La fin d’un vocal : ce qui part au serveur dure jusqu’à l’arrêt. L’enregistreur livre le son par tranches de 250 ms
 * (src/app/app/voice.tsx) ; quand l’arrêt suivait un requestData(), le moteur de Safari perdait la tranche en cours et ce
 * que gardait l’encodeur (environ 0,3 s), et un vocal envoyé en fin de phrase finissait au milieu d’un mot. Le micro se
 * tait, puis reprend juste avant l’envoi, qui tombe au pire moment, vers la fin d’une tranche : la reprise doit être
 * entendue jusqu’au bout.
 */
test("la fin d’un vocal : ce qui part dure jusqu’à l’arrêt, même envoyé à la fin d’une tranche", async ({ page }, testInfo) => {
  await microDeSynthese(page);
  await page.addInitScript(() => {
    /* Quand l’enregistreur démarre et s’arrête, sur le prototype, sans rien changer à ce qu’il fait */
    if (typeof MediaRecorder === "undefined") return;
    const { start, stop } = MediaRecorder.prototype;
    MediaRecorder.prototype.start = function (...args: Parameters<MediaRecorder["start"]>) {
      Object.assign(window, { debutDuVocal: performance.now() });
      return start.apply(this, args);
    };
    MediaRecorder.prototype.stop = function () {
      Object.assign(window, { finDuVocal: performance.now() });
      return stop.apply(this);
    };
  });
  await lectureComplete(page, testInfo);
  await ouvrir(page, "/app");
  test.skip(!(await enregistreUnFlux(page)), "ce navigateur n’enregistre pas un flux audio (le WebKit de Linux, sans encodeur)");
  await page.getByRole("button", { name: "Enregistrer un vocal" }).click();
  await expect(page.getByText("0:02", { exact: true })).toBeVisible({ timeout: 10_000 });
  /* Le micro se tait 0,6 s, reprend, puis « Envoyer le vocal » est touché dans la page à 200 ms d’une tranche (un clic de Playwright arriverait n’importe quand) */
  const reponse = await reponseAuGeste(page, { chemin: "/api/chat" }, () =>
    page.evaluate(async () => {
      const w = window as unknown as { debutDuVocal: number; volumeDuMicro: AudioParam; repriseDuMicro: number };
      const pause = (ms: number) => new Promise((suite) => setTimeout(suite, ms));
      w.volumeDuMicro.value = 0;
      await pause(600);
      w.volumeDuMicro.value = 1;
      w.repriseDuMicro = performance.now();
      await pause(400);
      await pause((200 - ((performance.now() - w.debutDuVocal) % 250) + 250) % 250);
      document.querySelector<HTMLButtonElement>('button[aria-label="Envoyer le vocal"]')!.click();
    }),
  );
  expect(reponse.status()).toBe(200);
  /* Le son décodé : depuis la fin du silence jusqu’à la fin du vocal, ce qui a été entendu de la reprise */
  const { entendu, joue } = await page.evaluate(async () => {
    const w = window as unknown as { vocalEnvoye: Blob; repriseDuMicro: number; finDuVocal: number };
    const son = await new AudioContext().decodeAudioData(await w.vocalEnvoye.arrayBuffer());
    const e = son.getChannelData(0);
    /*
     * Par fenêtres de 10 ms : la fin du silence, celui d’au moins 0,2 s le plus tard dans le vocal (les quelques
     * millisecondes muettes que l’encodeur ajoute à la toute fin n’en sont pas un)
     */
    const fenetre = Math.round(son.sampleRate / 100);
    let finDuSilence = 0;
    let muettes = 0;
    for (let a = 0; a + fenetre <= e.length; a += fenetre) {
      let somme = 0;
      for (let i = a; i < a + fenetre; i++) somme += e[i]! * e[i]!;
      muettes = Math.sqrt(somme / fenetre) < 0.02 ? muettes + 1 : 0;
      if (muettes >= 20) finDuSilence = a + fenetre;
    }
    return { entendu: (e.length - finDuSilence) / son.sampleRate, joue: (w.finDuVocal - w.repriseDuMicro) / 1000 };
  });
  testInfo.annotations.push({ type: "fin d’un vocal", description: `reprise jouée ${joue.toFixed(2)} s avant l’arrêt, entendue ${entendu.toFixed(2)} s` });
  /*
   * L’encodeur et la fin du silence lissent quelques centièmes (Chromium jusqu’à 0,06 s mesurées, le WebKit rien),
   * jamais une syllabe : sans le correctif, le WebKit perdait 0,16 à 0,28 s
   */
  expect(entendu).toBeGreaterThanOrEqual(joue - 0.12);
});
