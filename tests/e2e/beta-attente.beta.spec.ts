import type { Page } from "@playwright/test";
import { attendreMail, compteDe, ecranLu, emailLibre, expect, lienDeRetrait, mailsPour, nouvelInvite, placeSurLaListe, reponseAuGeste, test, URL_BETA } from "./aide";

/*
 * La liste d’attente de la bêta fermée : la page /attente (on y laisse son email), le mail qui le confirme, et le lien
 * signé de ce mail pour se retirer (/attente/retirer) : une question et un bouton, jamais un retrait au seul clic du lien,
 * que certaines messageries ouvrent d’elles-mêmes pour le vérifier.
 */

/**
 * Laisse son email sur /attente, et rend le statut de la réponse de /api/attente. Pas son corps : l’écran ne le lit pas, et
 * Chromium ne le donne alors jamais à Playwright (response.json() attend sans fin).
 */
async function rejoindreLaListe(page: Page, email: string): Promise<number> {
  await page.goto("/attente");
  await expect(page.getByRole("heading", { level: 1, name: "BLUSH est en bêta privée." })).toBeVisible();
  await page.getByLabel("Ton email").fill(email);
  return (await reponseAuGeste(page, { chemin: "/api/attente" }, () => page.getByRole("button", { name: "Rejoindre la liste" }).click())).status();
}

test("/attente : la même confirmation pour tous ; le mail dit « Tu es sur la liste » avec de quoi se retirer, ou « Ta place est prête » à un invité", async ({ page }, testInfo) => {
  const invite = await nouvelInvite(testInfo);
  const dehors = emailLibre(testInfo, "attente");
  let ecran = "";

  await test.step("le bouton attend un email complet", async () => {
    await page.goto("/attente");
    const rejoindre = page.getByRole("button", { name: "Rejoindre la liste" });
    await expect(rejoindre).toBeDisabled();
    await page.getByLabel("Ton email").fill("maelys@");
    await page.getByLabel("Ton email").blur();
    await expect(rejoindre).toBeDisabled();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Vérifie ton email : il manque quelque chose.");
    await page.getByLabel("Ton email").fill(dehors);
    await expect(rejoindre).toBeEnabled();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });

  await test.step("un email hors de la liste : « Tu es sur la liste. », et le mail qui le confirme", async () => {
    const depuis = Date.now();
    expect(await rejoindreLaListe(page, dehors)).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Tu es sur la liste." })).toBeVisible();
    await expect(page.getByText("On vient de t’écrire pour te le confirmer. On te réécrit dès que ta place est prête.")).toBeVisible();
    ecran = await ecranLu(page, dehors);

    const mail = await attendreMail(dehors, { depuis });
    expect(mail.sujet).toBe("Tu es sur la liste de BLUSH");
    expect(mail.texte).toContain("BLUSH est en bêta privée, sur invitation. Ton email est sur la liste d’attente\u00a0: on t’écrit dès que ta place est prête.");
    /* Le lien du mail, dans sa version texte comme dans le bouton du HTML : la page de retrait de ce serveur */
    const lien = lienDeRetrait(mail);
    expect(lien).toMatch(new RegExp(`^${URL_BETA}/attente/retirer\\?id=[\\w-]+&cle=[\\w-]+$`));
    expect(mail.html).toContain(`href="${lien.replaceAll("&", "&amp;")}"`);
    expect(await placeSurLaListe(dehors)).toEqual({ source: "accueil" });
    expect(await compteDe(dehors)).toBeNull();
  });

  await test.step("revenir s’inscrire : la même confirmation, une seule place, un mail de plus", async () => {
    expect(await rejoindreLaListe(page, dehors)).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Tu es sur la liste." })).toBeVisible();
    expect(await placeSurLaListe(dehors)).toEqual({ source: "accueil" });
    expect(mailsPour(dehors).map((m) => m.sujet)).toEqual(["Tu es sur la liste de BLUSH", "Tu es sur la liste de BLUSH"]);
  });

  await test.step("un invité : exactement la même confirmation, mais son mail lui dit que sa place est prête", async () => {
    const depuis = Date.now();
    expect(await rejoindreLaListe(page, invite)).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Tu es sur la liste." })).toBeVisible();
    expect(await ecranLu(page, invite)).toBe(ecran);

    const mail = await attendreMail(invite, { depuis });
    expect(mail.sujet).toBe("Ta place BLUSH est prête");
    expect(mail.texte).toContain("Ton email est déjà invité\u00a0: entre sur BLUSH avec cet email, et fais-lui lire votre conv.");
    expect(mail.texte).toContain(URL_BETA);
    expect(mail.texte).not.toContain("Retire ton email");
    /* Inscrit quand même : la ligne ne dit pas qui est invité */
    expect(await placeSurLaListe(invite)).toEqual({ source: "accueil" });
    expect(await compteDe(invite)).toBeNull();
  });
});

test("/attente/retirer : le lien signé du mail pose la question, et seul le bouton retire l’email de la liste", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "retrait");
  const depuis = Date.now();
  expect(await rejoindreLaListe(page, email)).toBe(200);
  const lien = lienDeRetrait(await attendreMail(email, { depuis }));

  await test.step("ouvrir le lien ne retire rien : une question, un bouton", async () => {
    await page.goto(lien);
    await expect(page.getByRole("heading", { level: 1, name: "Te retirer de la liste\u00a0?" })).toBeVisible();
    await expect(page.getByText("Ton email quitte la liste d’attente de BLUSH, et on ne t’écrira plus.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retirer mon email" })).toBeEnabled();
    expect(await placeSurLaListe(email)).toEqual({ source: "accueil" });
  });

  await test.step("le bouton retire l’email : « C’est fait. », et la liste ne l’a plus", async () => {
    const reponse = await reponseAuGeste(page, { chemin: "/api/attente/retrait" }, () => page.getByRole("button", { name: "Retirer mon email" }).click());
    expect(reponse.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "C’est fait." })).toBeVisible();
    await expect(page.getByText("Ton email n’est plus sur la liste d’attente. On ne t’écrira plus.")).toBeVisible();
    expect(await placeSurLaListe(email)).toBeNull();
  });

  await test.step("« Revenir à l’accueil » ramène à l’accueil", async () => {
    await page.getByRole("link", { name: "Revenir à l’accueil" }).click();
    await expect(page).toHaveURL(`${URL_BETA}/`);
  });
});

test("/attente/retirer : un lien incomplet, abîmé ou pris dans le mail d’un autre ne retire personne", async ({ page }, testInfo) => {
  const [alice, bruno] = [emailLibre(testInfo, "alice"), emailLibre(testInfo, "bruno")];
  const liens: string[] = [];
  for (const email of [alice, bruno]) {
    const depuis = Date.now();
    expect(await rejoindreLaListe(page, email)).toBe(200);
    liens.push(lienDeRetrait(await attendreMail(email, { depuis })));
  }
  const [lienAlice, lienBruno] = liens.map((l) => new URL(l));

  /** Ouvre un lien de retrait et appuie sur le bouton : le serveur le refuse (404), l’écran dit que le lien ne marche pas. */
  const refuse = async (lien: string) => {
    await page.goto(lien);
    const reponse = await reponseAuGeste(page, { chemin: "/api/attente/retrait" }, () => page.getByRole("button", { name: "Retirer mon email" }).click());
    expect(reponse.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Ce lien ne marche pas." })).toBeVisible();
    await expect(page.getByText("Il est peut-être incomplet. Ouvre-le depuis le mail, tel quel.")).toBeVisible();
  };

  await test.step("sans sa clé, le lien ne propose même pas de bouton", async () => {
    await page.goto(`/attente/retirer?id=${lienAlice.searchParams.get("id")}`);
    await expect(page.getByRole("heading", { level: 1, name: "Ce lien ne marche pas." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retirer mon email" })).toHaveCount(0);
  });

  await test.step("une clé abîmée est refusée", async () => {
    const cle = lienAlice.searchParams.get("cle")!;
    const abimee = `${cle.startsWith("A") ? "B" : "A"}${cle.slice(1)}`;
    await refuse(`/attente/retirer?id=${lienAlice.searchParams.get("id")}&cle=${abimee}`);
  });

  await test.step("la clé d’Alice ne retire pas Bruno", async () => {
    await refuse(`/attente/retirer?id=${lienBruno.searchParams.get("id")}&cle=${lienAlice.searchParams.get("cle")}`);
  });

  await test.step("côté serveur : les deux sont toujours sur la liste", async () => {
    expect(await placeSurLaListe(alice)).toEqual({ source: "accueil" });
    expect(await placeSurLaListe(bruno)).toEqual({ source: "accueil" });
  });
});

test("/attente : après dix inscriptions en une heure depuis la même adresse, la onzième ne passe pas", async ({ page, request }, testInfo) => {
  await test.step("dix inscriptions passent", async () => {
    for (let k = 0; k < 10; k++) {
      const r = await request.post("/api/attente", { headers: { origin: URL_BETA }, data: { email: emailLibre(testInfo, `rafale${k}`) } });
      expect(r.status()).toBe(200);
    }
  });

  await test.step("la onzième, depuis l’écran : refusée (« trop »), et l’écran dit que ça n’a pas marché", async () => {
    const email = emailLibre(testInfo, "onzieme");
    expect(await rejoindreLaListe(page, email)).toBe(429);
    /* Le message d’une panne : l’écran ne distingue pas « trop » (src/app/attente/AttenteScreen.tsx:30), et la limite dure une heure */
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Ça n’a pas marché. Réessaie dans un instant.");
    await expect(page.getByRole("heading", { level: 1, name: "BLUSH est en bêta privée." })).toBeVisible();
    expect(await placeSurLaListe(email)).toBeNull();
    expect(mailsPour(email)).toEqual([]);
  });
});

test.fixme("/commencer annonce la bêta privée à qui n’est pas connecté, et mène à la liste d’attente", async ({ page }) => {
  /*
   * Bug : src/app/commencer/page.tsx:9 lit BLUSH_BETA_FERMEE au rendu, mais la page est prérendue au build : construite
   * sans la variable (le build des tests), elle n’a pas le bandeau « Bêta privée, sur invitation » sur un serveur en bêta
   * fermée, et rien ne mène à /attente.
   */
  await page.goto("/commencer");
  await page.getByRole("link", { name: /Bêta privée, sur invitation/ }).click();
  await expect(page).toHaveURL(/\/attente$/);
  await expect(page.getByRole("heading", { level: 1, name: "BLUSH est en bêta privée." })).toBeVisible();
});
