import type { Page } from "@playwright/test";
import {
  attendreLecture,
  attendreMail,
  attendreTaches,
  autreCode,
  champDuCode,
  compteDe,
  dernierCode,
  ecranLu,
  emailLibre,
  envoyerEmail,
  expect,
  exportWhatsApp,
  histoire,
  histoiresDe,
  jusquALEmail,
  lienDeRetrait,
  mailsDepuis,
  mailsPour,
  nouvelInvite,
  placeSurLaListe,
  REPONSES_NOE,
  saisirLeCodeRecu,
  test,
  URL_APPLI,
  URL_BETA,
} from "./aide";

/*
 * La bêta fermée (BLUSH_BETA_FERMEE=1) : seuls les invités (BLUSH_ACCES_LIBRE) entrent. La connexion répond pareil à
 * tous (même écran, même statut), pour que personne ne puisse savoir si un email est invité : l’invité reçoit son code,
 * les autres le mail de la liste d’attente, et la conv qu’ils venaient d’importer est effacée tout de suite.
 */

/**
 * Demande un code depuis l’écran de l’email, et rend la réponse de /api/auth/code : son statut, son corps, et le cookie
 * qu’elle pose, sans sa valeur ni sa date. Le même pour tous : le jeton du navigateur, auquel le code est lié (la conv
 * effacée d’un email hors de la liste garde son cookie, l’effacer changerait la réponse).
 */
async function reponseDuCode(page: Page, email: string): Promise<{ statut: number; corps: unknown; cookie: string | null }> {
  const { reponse } = await envoyerEmail(page, email);
  const cookie = await reponse.headerValue("set-cookie");
  return { statut: reponse.status(), corps: await reponse.json(), cookie: cookie && cookie.replace(/=[^;]*/, "=…").replace(/expires=[^;]*/i, "Expires=…") };
}
/** Le cookie que pose une demande de code acceptée, sous la forme que rend reponseDuCode : celui du navigateur, httpOnly. */
const COOKIE_DU_CODE = expect.stringMatching(/^blush-code=…; .*HttpOnly/i);

test("/connexion : le même écran et le même statut pour un invité et pour un email hors de la liste ; l’invité reçoit son code et entre, l’autre reçoit le mail de la liste d’attente", async ({ page }, testInfo) => {
  const invite = await nouvelInvite(testInfo);
  const debut = Date.now();
  const dehors = emailLibre(testInfo, "dehors");
  const ecrans: Record<string, string> = {};
  const cookies: (string | null)[] = [];

  /* Comme sur un autre appareil : /connexion, l’email, puis l’écran du code */
  const jusquAuCodeDeConnexion = async (email: string) => {
    await page.goto("/connexion");
    await expect(page.getByRole("heading", { level: 1, name: "Retrouve tes convs." })).toBeVisible();
    const depuis = Date.now();
    const reponse = await reponseDuCode(page, email);
    expect(reponse).toEqual({ statut: 200, corps: { email }, cookie: COOKIE_DU_CODE });
    cookies.push(reponse.cookie);
    await expect(page).toHaveURL(/\/connexion\/code$/);
    await expect(page.getByRole("heading", { level: 1, name: "Entre ton code." })).toBeVisible();
    await expect(page.getByText(`On vient d’écrire à ${email}.`)).toBeVisible();
    await expect(page.getByText("Pas de code dans le mail\u00a0? BLUSH est en bêta privée\u00a0: ton email est sur la liste d’attente, le mail t’explique tout.")).toBeVisible();
    ecrans[email] = await ecranLu(page, email);
    return depuis;
  };

  await test.step("un email hors de la liste : « regarde tes mails », et un code tapé au hasard ne marche pas", async () => {
    const depuis = await jusquAuCodeDeConnexion(dehors);
    await attendreMail(dehors, { depuis });
    await champDuCode(page).fill("482913");
    await expect(page.getByText("Ce code ne marche pas. Vérifie-le, ou demande-en un nouveau.")).toBeVisible();
    await expect(page).toHaveURL(/\/connexion\/code$/);
  });

  let code = "";
  await test.step("un invité : exactement le même écran, et son code arrive", async () => {
    const depuis = await jusquAuCodeDeConnexion(invite);
    expect(ecrans[invite]).toBe(ecrans[dehors]);
    expect(cookies[1]).toBe(cookies[0]);
    code = await dernierCode(invite, { depuis });
  });

  await test.step("un mauvais code dit la même chose à l’invité, puis le bon le fait entrer", async () => {
    await champDuCode(page).fill(autreCode(code));
    await expect(page.getByText("Ce code ne marche pas. Vérifie-le, ou demande-en un nouveau.")).toBeVisible();
    await champDuCode(page).fill(code);
    /* Pas encore de conv : l’accueil mène au début du parcours */
    await expect(page).toHaveURL(/\/commencer$/);
    await expect(page.getByRole("heading", { level: 1, name: "Vous vous parlez où\u00a0?" })).toBeVisible();
  });

  await test.step("les mails : le code pour l’invité, « Tu es sur la liste » avec de quoi se retirer pour l’autre", async () => {
    expect(mailsDepuis(invite, debut).map((m) => m.sujet)).toEqual([expect.stringMatching(/^\d{6}\u00a0: ton code BLUSH$/)]);
    const [mail, ...autres] = mailsPour(dehors);
    expect(autres).toEqual([]);
    expect(mail.sujet).toBe("Tu es sur la liste de BLUSH");
    expect(mail.code).toBeUndefined();
    expect(mail.texte).toContain("BLUSH est en bêta privée, sur invitation. Ton email est sur la liste d’attente\u00a0: on t’écrit dès que ta place est prête.");
    /* Rien n’avait été importé sur ce navigateur : rien à dire sur une conv */
    expect(mail.texte).not.toContain("La conv que tu viens d’importer");
    expect(lienDeRetrait(mail)).toMatch(new RegExp(`^${URL_BETA}/attente/retirer\\?id=[\\w-]+&cle=[\\w-]+$`));
  });

  await test.step("côté serveur : l’email hors de la liste est sur la liste d’attente, sans compte ; l’invité a son compte BLUSH+", async () => {
    expect(await placeSurLaListe(dehors)).toEqual({ source: "connexion" });
    expect(await compteDe(dehors)).toBeNull();
    expect(await placeSurLaListe(invite)).toBeNull();
    expect(await compteDe(invite)).toMatchObject({ plan: "blushplus" });
  });
});

test("/email : après l’import, le même écran pour tous ; la conv d’un email hors de la liste est effacée tout de suite, celle de l’invité est gardée et lue", async ({ page }, testInfo) => {
  const invite = await nouvelInvite(testInfo);
  const dehors = emailLibre(testInfo, "dehors");
  /* Deux convs inventées : Noé et Maëlys pour l’email hors de la liste, Sacha et Lina pour l’invité */
  const convDehors = exportWhatsApp(testInfo);
  const convInvite = exportWhatsApp(testInfo, { personnes: { toi: "Sacha", autre: "Lina" } });
  let ecranDehors = "";

  await test.step("hors de la liste : import, « Qui es-tu ? », email, puis l’écran du code", async () => {
    const brouillon = await jusquALEmail(page, convDehors);
    expect(await histoire(brouillon)).toEqual({ aUnCompte: false });
    const depuis = Date.now();
    expect(await reponseDuCode(page, dehors)).toEqual({ statut: 200, corps: { email: dehors }, cookie: COOKIE_DU_CODE });
    await expect(page).toHaveURL(/\/email\/code$/);
    await expect(page.getByRole("heading", { level: 1, name: "Entre ton code." })).toBeVisible();
    await expect(page.getByText(dehors)).toBeVisible();
    ecranDehors = await ecranLu(page, dehors);

    /* La conv n’est pas gardée : effacée juste après la réponse (pour qu’elle ne dise rien, ni par son temps), et le mail le dit */
    await expect.poll(() => histoire(brouillon)).toBeNull();
    const mail = await attendreMail(dehors, { depuis });
    expect(mail.sujet).toBe("Tu es sur la liste de BLUSH");
    expect(mail.texte).toContain("La conv que tu viens d’importer n’a pas été gardée. Tu la renverras ce jour-là.");
    expect(lienDeRetrait(mail)).toContain(`${URL_BETA}/attente/retirer?id=`);
    expect(await placeSurLaListe(dehors)).toEqual({ source: "connexion" });
    expect(await compteDe(dehors)).toBeNull();
  });

  await test.step("l’invité : le même écran, et sa conv est gardée en attendant son code", async () => {
    const brouillon = await jusquALEmail(page, convInvite, { ...REPONSES_NOE, moi: "Sacha" });
    const depuis = Date.now();
    expect(await reponseDuCode(page, invite)).toEqual({ statut: 200, corps: { email: invite }, cookie: COOKIE_DU_CODE });
    await expect(page).toHaveURL(/\/email\/code$/);
    await expect(page.getByRole("heading", { level: 1, name: "Entre ton code." })).toBeVisible();
    expect(await ecranLu(page, invite)).toBe(ecranDehors);
    expect(await histoire(brouillon)).toEqual({ aUnCompte: false });

    await test.step("son code lance la lecture de sa conv", async () => {
      await saisirLeCodeRecu(page, invite, depuis);
      await attendreLecture(page);
      await expect(page.getByRole("heading", { level: 1, name: new RegExp(`BLUSH analyse tes\\s*${convInvite.messages}\\s*messages`) })).toBeVisible();
      expect(await histoiresDe(invite)).toEqual([expect.objectContaining({ id: brouillon, messages: convInvite.messages })]);
    });
  });

  await test.step("côté serveur : l’invité a BLUSH+ et toute sa lecture ; l’email hors de la liste n’a rien reçu d’autre", async () => {
    expect(await compteDe(invite)).toMatchObject({ plan: "blushplus" });
    /* La chaîne d’un compte BLUSH+ va jusqu’au bout (rapport, vocal, mémoire) : on l’attend, pour finir propre */
    const taches = await attendreTaches(invite);
    expect(taches.map((t) => [t.genre, t.statut])).toEqual(expect.arrayContaining([["verdict", "fini"]]));
    expect(taches.filter((t) => t.statut !== "fini")).toEqual([]);
    expect(mailsPour(dehors).map((m) => m.sujet)).toEqual(["Tu es sur la liste de BLUSH"]);
  });
});

test("les limites des codes sont les mêmes pour tous : sept codes par jour pour un email depuis une même adresse, puis « Trop de codes demandés aujourd’hui », invité ou pas", async ({ page, request }, testInfo) => {
  const invite = await nouvelInvite(testInfo);
  const debut = Date.now();
  const dehors = emailLibre(testInfo, "dehors");

  await test.step("sept codes demandés coup sur coup passent, pour l’un comme pour l’autre", async () => {
    for (const email of [dehors, invite])
      for (let k = 0; k < 7; k++) {
        const r = await request.post("/api/auth/code", { headers: { origin: URL_BETA }, data: { email } });
        expect(r.status()).toBe(200);
      }
  });

  const ecrans: string[] = [];
  await test.step("le huitième : le même refus à l’écran, et la même réponse, invité ou pas", async () => {
    for (const email of [dehors, invite]) {
      await page.goto("/connexion");
      expect(await reponseDuCode(page, email)).toEqual({ statut: 429, corps: { erreur: "codes" }, cookie: null });
      await expect(page.getByRole("main").getByRole("alert")).toHaveText("Trop de codes demandés aujourd’hui. Réessaie demain.");
      await expect(page).toHaveURL(/\/connexion$/);
      ecrans.push(await ecranLu(page, email));
    }
    expect(ecrans[1]).toBe(ecrans[0]);
  });

  await test.step("les mails : un seul pour chacun, son navigateur ayant redemandé dans la minute (le code pour l’invité, la liste pour l’autre)", async () => {
    await expect.poll(() => mailsDepuis(invite, debut).map((m) => m.sujet)).toEqual([expect.stringMatching(/^\d{6}\u00a0: ton code BLUSH$/)]);
    await expect.poll(() => mailsPour(dehors).map((m) => m.sujet)).toEqual(["Tu es sur la liste de BLUSH"]);
  });
});

test("une session ouverte hors de la bêta n’ouvre plus rien sur le serveur en bêta fermée", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "ancien");

  await test.step("un compte gratuit se connecte sur le serveur ouvert", async () => {
    await page.goto(`${URL_APPLI}/connexion`);
    const depuis = Date.now();
    expect(await reponseDuCode(page, email)).toEqual({ statut: 200, corps: { email }, cookie: COOKIE_DU_CODE });
    await saisirLeCodeRecu(page, email, depuis);
    await expect(page).toHaveURL(`${URL_APPLI}/commencer`);
    expect(await compteDe(email)).toMatchObject({ plan: "gratuit" });
  });

  await test.step("sur le serveur en bêta fermée, même base, même cookie : l’accueil renvoie à la connexion, sans boucler", async () => {
    await page.goto("/app");
    await expect(page).toHaveURL(`${URL_BETA}/connexion?suite=%2Fapp`);
    await expect(page.getByRole("heading", { level: 1, name: "Retrouve tes convs." })).toBeVisible();
    await expect(page.getByLabel("Ton email")).toBeVisible();
  });

  await test.step("la session reste valable sur le serveur ouvert : c’est la bêta qui la refuse", async () => {
    await page.goto(`${URL_APPLI}/app`);
    await expect(page).toHaveURL(`${URL_APPLI}/commencer`);
  });
});

test.fixme("/email/code en bêta fermée : « On vient d’écrire à », et la liste d’attente expliquée", async ({ page }, testInfo) => {
  /*
   * Bug : src/app/email/code/page.tsx:7 lit BLUSH_BETA_FERMEE au rendu, mais la page est prérendue au build. Construite
   * sans la variable (le build des tests), elle dit « On vient de l’envoyer à » même sur un serveur en bêta fermée, et
   * n’explique pas la liste d’attente. /connexion/code (dynamique) le fait bien.
   */
  const dehors = emailLibre(testInfo, "dehors");
  await jusquALEmail(page, exportWhatsApp(testInfo));
  await reponseDuCode(page, dehors);
  await expect(page).toHaveURL(/\/email\/code$/);
  await expect(page.getByText(`On vient d’écrire à ${dehors}.`)).toBeVisible();
  await expect(page.getByText("Pas de code dans le mail\u00a0? BLUSH est en bêta privée\u00a0: ton email est sur la liste d’attente, le mail t’explique tout.")).toBeVisible();
});
