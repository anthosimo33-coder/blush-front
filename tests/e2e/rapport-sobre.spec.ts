import { ALERTE_FACTICE, attendreMail, compteDe, emailLibre, expect, lectureFaite, mailsPour, pagePrete, rapportPasEncoreEcrit, tachesDe, test } from "./aide";

/*
 * Le mode sobre : quand la conv montre un danger (une détresse, un mineur), BLUSH laisse la taquinerie de côté. Pas de mise en scène du
 * verdict, pas de score, pas de vocal, pas de partage, pas de paiement : un rapport court et doux, offert, des gestes
 * pour soi, et de l’aide à un toucher. Le modèle factice lève l’alerte quand la conv porte son déclencheur (une conv
 * inventée, ALERTE_FACTICE). C’est le seul parcours de sécurité de l’appli.
 */

/* Ce qu’écrit le modèle factice avec une alerte (src/server/ia/factice.ts) */
const TITRE = "Ce que tu vis n’est pas normal.";
const GESTES = ["Parles-en à quelqu’un de confiance.", "Garde une trace de ce qui t’inquiète.", "Appelle une ligne d’écoute si ça pèse trop."];

test("une alerte : le rapport doux, offert à un compte gratuit, sans jeu ni paiement, et de l’aide à un toucher", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "sobre");
  /* La conv de Noé et Maëlys, et un dernier message qui fait lever l’alerte au modèle factice */
  await lectureFaite(page, testInfo, email, { ajout: { de: "autre", texte: ALERTE_FACTICE } });
  const ecran = page.getByRole("main");

  await test.step("« Voir mon rapport » mène droit au rapport doux, sans la scène du verdict", async () => {
    await page.goto("/lecture");
    await page.getByRole("link", { name: "Voir mon rapport" }).click();
    /* La scène du verdict se passe d’elle-même : elle repart vers le rapport, en rechargeant la page */
    await expect(page).toHaveURL(/\/rapport$/);
    await pagePrete(page);
    await expect(ecran.getByRole("heading", { level: 1, name: TITRE })).toBeVisible();
    await expect(ecran.getByText("On va parler doucement.")).toBeVisible();
    await expect(ecran.getByText("Dans votre conv, il revient sans cesse sur tes sorties.")).toBeVisible();
    await expect(ecran.getByText("Tu n’y es pour rien.")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Étape \d sur \d/ })).toHaveCount(0);
  });

  await test.step("rien du jeu : ni paiement, ni vocal, ni partage, ni chapitre à débloquer", async () => {
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Écouter le vocal de BLUSH/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Partager/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Lire la suite|Débloquer|\(verrouillé\)$/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Parler à BLUSH|Parle à BLUSH/ })).toHaveCount(0);
  });

  await test.step("« Besoin d’en parler à quelqu’un ? » : deux lignes d’écoute, à appeler d’un toucher", async () => {
    await ecran.getByRole("button", { name: "Besoin d’en parler à quelqu’un ?" }).click();
    const aide = page.getByRole("dialog", { name: "Besoin d’en parler à quelqu’un ?" });
    await expect(aide).toBeVisible();
    await expect(aide.getByRole("link", { name: /^Fil Santé Jeunes/ })).toHaveAttribute("href", "tel:0800235236");
    await expect(aide.getByRole("link", { name: /^SOS Amitié/ })).toHaveAttribute("href", "tel:0972394050");
    await aide.getByRole("button", { name: "Fermer" }).click();
    await expect(aide).toBeHidden();
  });

  await test.step("« Et maintenant ? » : trois gestes pour soi, et de quoi lui écrire si on le veut", async () => {
    await ecran.getByRole("button", { name: "Et maintenant ?" }).click();
    await expect(ecran.getByRole("heading", { level: 1, name: "Passe à autre chose, proprement." })).toBeVisible();
    await expect(ecran.getByRole("listitem")).toHaveText(GESTES.map((g, k) => `${k + 1}${g}`));
    await expect(ecran.getByText("Si tu veux lui écrire")).toBeVisible();
    await expect(ecran.getByText("J’ai besoin de temps pour moi.")).toBeVisible();
  });

  await test.step("« OK, merci » mène au début du parcours, comme « Quitter vite », toujours en haut", async () => {
    await ecran.getByRole("link", { name: "OK, merci" }).click();
    await expect(page).toHaveURL(/\/commencer$/);
    await page.goto("/rapport");
    await page.getByRole("link", { name: "Quitter vite" }).click();
    await expect(page).toHaveURL(/\/commencer$/);
    await expect(page.getByRole("heading", { level: 1, name: "Vous vous parlez où ?" })).toBeVisible();
  });

  await test.step("côté serveur : le rapport doux est offert (le compte reste gratuit), sans vocal ; le mail « prêt » est doux aussi", async () => {
    expect(await compteDe(email)).toMatchObject({ plan: "gratuit" });
    expect((await tachesDe(email)).map((t) => [t.genre, t.statut])).toEqual([
      ["verdict", "fini"],
      ["rapport_plan", "fini"],
    ]);
    const mail = await attendreMail(email, { filtre: (m) => m.sujet === "Ton rapport BLUSH est prêt" });
    expect(mail.texte).toContain("Il est court, et il t’aide à y voir clair. Prends le temps de le lire au calme");
    expect(mail.texte).not.toContain("chapitres");
    expect(mailsPour(email).map((m) => m.sujet)).not.toContain("📖 Ton rapport BLUSH est prêt");
  });
});

/*
 * Bug : avec une alerte, la scène du verdict se joue tant que le rapport doux n’est pas écrit. La scène ne regarde que le
 * rapport sobre (src/app/rapport/verdict/VerdictReveal.tsx:72-75), présent une fois le rapport doux écrit (`sober`,
 * assemblerRapport, src/server/presentation/rapport.ts), alors que le verdict sait déjà qu’il y a une alerte
 * (mode_sobre). Avec le vrai modèle, le rapport doux s’écrit après le verdict : « Voir mon rapport », touché tout de
 * suite, joue la mise en scène (les cartes, les sons, l’emoji 🧊 par défaut) sur une alerte danger, puis le rapport en
 * cours d’écriture.
 */
test.fixme("une alerte : pas de scène du verdict, même avant que le rapport doux soit écrit", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "sobre-tot");
  await lectureFaite(page, testInfo, email, { ajout: { de: "autre", texte: ALERTE_FACTICE } });
  /* Le verdict est là, le rapport doux pas encore */
  await rapportPasEncoreEcrit(email);
  await page.goto("/lecture");
  await page.getByRole("link", { name: "Voir mon rapport" }).click();
  await expect(page).toHaveURL(/\/rapport$/);
  await expect(page.getByRole("heading", { name: /^Étape \d sur \d/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Partager/ })).toHaveCount(0);
});

