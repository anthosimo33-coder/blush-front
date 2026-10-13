import {
  attendreTaches,
  compteDe,
  debloquerLaConv,
  donnerDesBulles,
  ecrireABlush,
  emailLibre,
  expect,
  feuilleSurOrdinateur,
  filDuChat,
  lectureFaite,
  messagesDuChat,
  ouvrir,
  ouvrirLeRapport,
  payerParCarte,
  reponseAuGeste,
  RESEAU,
  test,
} from "./aide";

/*
 * Les bulles dans le chat (/app), au dessin du prototype validé des bulles, pour un compte qui paie (pas de l’équipe) :
 * le compteur à côté du bouton du compte (sa première apparition expliquée), « 1 bulle · il t’en reste N » sous chaque
 * réponse, la carte et le compteur rose à 2 bulles ou moins, puis à 0 la réponse écrite mais verrouillée (sa lecture en
 * clair, « Ta meilleure réponse » floutée, sans son texte dans la page), la recharge qui s’ouvre (le message suivant
 * refusé), le bonus de la première recharge (④), le paiement au faux Whop, et la réponse lue au retour, sans débit. Le
 * modèle factice répond toujours « elle te cherche 👀 » en premier : la compter dans la page dit ce qu’une réponse
 * verrouillée y a laissé ; « je lui envoie quoi » lui fait écrire une réponse à envoyer.
 */

const PREMIERE_BULLE = "elle te cherche 👀";
/** Ce qu’il demande quand il veut une réponse à envoyer (le chemin du modèle factice qui en écrit une). */
const QUOI_ENVOYER = "elle me propose un verre, je lui envoie quoi ?";

test("un compte à 6 bulles parle jusqu’à 0 ; sa réponse prête, la lecture en clair et la réponse à envoyer floutée ; la recharge (④) au faux Whop ; la réponse lue au retour, sans débit", async ({
  page,
}, testInfo) => {
  test.slow();
  const fil = filDuChat(page);
  const email = emailLibre(testInfo, "bulles");
  const compteur = (n: number | string) => page.getByRole("button", { name: `Tes bulles\u00a0: ${n}`, exact: true });

  await test.step("un compte qui paie : sa conv lue, son rapport débloqué, 6 bulles", async () => {
    await lectureFaite(page, testInfo, email);
    await debloquerLaConv(email);
    await ouvrirLeRapport(page);
    await attendreTaches(email);
    await donnerDesBulles(email, 6);
  });

  await test.step("le compteur à côté du bouton du compte, et sa première apparition expliquée", async () => {
    await ouvrir(page, "/app");
    await expect(compteur(6)).toBeVisible();
    await expect(page.getByText("Tes 6 bulles sont là")).toBeVisible();
    /* « comment ça marche » : la feuille « C’est quoi une bulle ? », d’où l’on recharge ; Échap la ferme */
    await page.getByRole("button", { name: "1 bulle = 1 réponse de BLUSH · comment ça marche" }).click();
    const feuille = page.getByRole("dialog", { name: "C’est quoi une bulle\u00a0?" });
    await expect(feuille).toBeVisible();
    await feuilleSurOrdinateur(page, feuille, { titre: 26 });
    await expect(feuille.getByRole("button", { name: "Recharger · il t’en reste 6" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(feuille).toBeHidden();
  });

  await test.step("chaque réponse coûte une bulle, dite sous elle ; à 5, ni carte ni rose (le seuil est à 2)", async () => {
    expect(await ecrireABlush(page, "on s’est parlé ce matin")).toBe(200);
    await expect(fil.getByText("1 bulle · il t’en reste 5")).toBeVisible();
    await expect(compteur(5)).toBeVisible();
    /* La première réponse arrivée : la carte de la première apparition laisse sa place */
    await expect(page.getByText("Tes 6 bulles sont là")).toHaveCount(0);
    await expect(page.getByText(/^Plus que \d+ bulles?$/)).toHaveCount(0);
    await expect(compteur(5)).toHaveClass(/bg-white/);
    expect(await compteDe(email)).toMatchObject({ bulles: 5 });
  });

  await test.step("à 2 : le compteur rose et la carte « Plus que 2 bulles », comme le prototype", async () => {
    for (let reste = 4; reste >= 2; reste--) {
      expect(await ecrireABlush(page, `et là, il m’en reste ${reste} ?`)).toBe(200);
      await expect(fil.getByText(`1 bulle · il t’en reste ${reste}`)).toBeVisible();
      await expect(compteur(reste)).toBeVisible();
      if (reste > 2) await expect(page.getByText(/^Plus que \d+ bulles?$/)).toHaveCount(0);
    }
    await expect(page.getByText("Plus que 2 bulles")).toBeVisible();
    await expect(compteur(2)).toHaveClass(/text-elle-ink/);
  });

  await test.step("jusqu’à 0 : le compteur suit, puis « Tes bulles sont finies »", async () => {
    for (let reste = 1; reste >= 0; reste--) {
      expect(await ecrireABlush(page, `et là, il m’en reste ${reste} ?`)).toBe(200);
      await expect(fil.getByText(`1 bulle · il t’en reste ${reste}`)).toBeVisible();
      await expect(compteur(reste)).toBeVisible();
    }
    await expect(page.getByText("Plus que 1 bulle")).toHaveCount(0);
    await expect(page.getByText("Tes bulles sont finies")).toBeVisible();
    await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(6);
    expect(await compteDe(email)).toMatchObject({ bulles: 0 });
  });

  /* La page telle qu’elle est avant le paiement : la réponse à envoyer, lue une fois payée, ne doit pas y être */
  let avantLePaiement = "";
  await test.step("à 0 bulle : BLUSH écrit sa réponse ; sa lecture se lit en clair, « Ta meilleure réponse » est floutée, sans son texte dans la page", async () => {
    expect(await ecrireABlush(page, QUOI_ENVOYER)).toBe(200);
    const prete = fil.locator("[data-verrouillee=reponse]");
    await expect(prete.getByText("Ta réponse est prête")).toBeVisible();
    await expect(prete.getByText("Ta meilleure réponse")).toBeVisible();
    await expect(prete.getByText("Recommandée")).toBeVisible();
    await expect(prete.getByRole("button", { name: "Recharger pour la lire" })).toBeVisible();
    /* Ses lignes : floutées, neutres (la forme de la réponse, pas son texte) */
    const lignes = prete.locator("[data-ligne-floutee]");
    expect(await lignes.count()).toBeGreaterThan(0);
    for (const l of await lignes.allTextContents()) expect(l).toMatch(/^[x ]+$/);
    /* Sa lecture, en clair : sa première bulle en plus des six d’avant ; ni « Copier », ni reçu */
    await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(7);
    await expect(prete.getByRole("button", { name: "Copier" })).toHaveCount(0);
    await expect(fil.locator("[data-recu]")).toHaveCount(6);
    await expect(page.getByText("Ta réponse à Maëlys est écrite")).toBeVisible();
    expect(await messagesDuChat(email)).toHaveLength(14);
    expect(await compteDe(email)).toMatchObject({ bulles: 0 });
    /* Rechargée : l’historique rendu par le serveur (la page et ses données) la redonne telle quelle */
    await ouvrir(page);
    await expect(fil.locator("[data-verrouillee=reponse]")).toBeVisible();
    await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(7);
    avantLePaiement = [await page.content(), await page.locator("body").textContent()].join("\n");
  });

  const recharge = page.getByRole("dialog", { name: "Recharge tes bulles" });

  await test.step("le message suivant : refusé (402 « bulles »), BLUSH le dit, et la recharge s’ouvre", async () => {
    expect(await ecrireABlush(page, "allô ?")).toBe(402);
    await expect(fil.getByText("plus de bulles pour l’instant 🫧")).toBeVisible();
    await expect(recharge).toBeVisible();
    await feuilleSurOrdinateur(page, recharge);
    await expect(recharge.getByText("Ta réponse à Maëlys s’affiche dès que c’est payé.")).toBeVisible();
    expect(await messagesDuChat(email)).toHaveLength(14);
    await page.keyboard.press("Escape");
    await expect(recharge).toBeHidden();
  });

  await test.step("« Recharger pour la lire » rouvre la recharge : le bonus de la première recharge (④), le pack conseillé choisi", async () => {
    await fil.getByRole("button", { name: "Recharger pour la lire" }).click();
    await expect(recharge).toBeVisible();
    await expect(recharge.getByText("Ta 1re recharge\u00a0: +40 offertes")).toBeVisible();
    const conseille = recharge.getByRole("radio", { name: /70 bulles/ });
    await expect(conseille).toHaveAttribute("aria-checked", "true");
    await expect(conseille.getByText("120 bulles · 0,08\u00a0€ la bulle")).toBeVisible();
    await expect(recharge.getByText("+ 50 bulles offertes")).toBeVisible();
  });

  await test.step("payer (pas de case : la renonciation dite sous le bouton), la carte dans la feuille, puis le chat", async () => {
    const payer = recharge.getByRole("button", { name: "Payer · 9,90\u00a0€" });
    await expect(recharge.getByRole("checkbox")).toHaveCount(0);
    await expect(recharge.getByText("En payant, tu as tes bulles tout de suite et tu renonces au délai de rétractation.")).toBeVisible();
    await payer.click();
    await payerParCarte(page);
    /* La feuille attend la livraison, puis revient au chat, qui lit la réponse prête et retire `?recharge=` de l’adresse */
    await page.waitForURL((u) => u.pathname === "/app" && !u.search.includes("recharge"), { timeout: 2 * RESEAU });
  });

  await test.step("revenu : « +120 bulles, ta réponse est là », la réponse lue à sa place, sans débit : le compteur à 120 (l’ancien solde + 120)", async () => {
    await expect(page.getByRole("status").filter({ hasText: "+120 bulles, ta réponse est là" })).toBeVisible();
    await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(7);
    await expect(fil.locator("[data-verrouillee]")).toHaveCount(0);
    await expect(fil.getByText("Ta meilleure réponse")).toBeVisible();
    await expect(fil.getByRole("button", { name: "Copier" })).toBeVisible();
    /* Ni reçu sous elle (elle n’a rien coûté ; ceux d’avant ne sont pas gardés dans l’historique), ni débit */
    await expect(fil.locator("[data-recu]")).toHaveCount(0);
    await expect(compteur(120)).toBeVisible();
    await expect(page.getByText("Ta réponse à Maëlys est écrite")).toHaveCount(0);
    expect(await compteDe(email)).toMatchObject({ bulles: 120 });
    /* Rien de la réponse à envoyer n’était dans la page avant d’être payé */
    const envoi = (await fil.locator(".bg-toi-ink.font-message").allTextContents()).filter((t) => t.trim().length > 3);
    expect(envoi.length).toBeGreaterThan(0);
    for (const t of envoi) expect(avantLePaiement.includes(t), `« ${t} » était dans la page avant d’être payé`).toBe(false);
    /* Payée, l’historique la rend en entier */
    await ouvrir(page);
    await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(7);
    await expect(fil.locator("[data-verrouillee]")).toHaveCount(0);
    await expect(fil.getByText("Ta meilleure réponse")).toBeVisible();
  });

  await test.step("le bonus ④ ne vaut qu’une fois : la recharge suivante, sans lui", async () => {
    await compteur(120).click();
    await page.getByRole("dialog", { name: "C’est quoi une bulle\u00a0?" }).getByRole("button", { name: "Recharger · il t’en reste 120" }).click();
    await expect(recharge.getByRole("radio", { name: /70 bulles/ })).toBeVisible();
    await expect(recharge.getByText("Ta 1re recharge\u00a0: +40 offertes")).toHaveCount(0);
    await expect(recharge.getByText("80 bulles · 0,12\u00a0€ la bulle")).toBeVisible();
  });

  await test.step("Mon compte : le solde, et l’achat dans « Tes achats »", async () => {
    await ouvrir(page, "/compte");
    const main = page.getByRole("main");
    await expect(main.getByRole("region", { name: "Tes bulles" }).getByText("Tes bulles\u00a0: 120", { exact: true })).toBeVisible();
    const achats = main.getByRole("region", { name: "Tes achats" });
    await expect(achats.getByText("80 bulles", { exact: true })).toBeVisible();
    await expect(achats.getByText(/ · \+120 bulles$/)).toBeVisible();
    await expect(achats.getByText("9,90\u00a0€")).toBeVisible();
    await expect(achats.getByText("Payé")).toBeVisible();
  });
});

test("sans réponse à envoyer, la réponse prête se verrouille en entier ; « La lire » sur la carte : des bulles venues d’ailleurs (le solde la couvre), elle se lit d’un toucher, son coût débité", async ({
  page,
}, testInfo) => {
  const fil = filDuChat(page);
  const email = emailLibre(testInfo, "bulles-ailleurs");
  await lectureFaite(page, testInfo, email);
  await debloquerLaConv(email);
  await ouvrirLeRapport(page);
  await attendreTaches(email);

  await ouvrir(page, "/app");
  await expect(page.getByText("Tes bulles sont finies")).toBeVisible();
  expect(await ecrireABlush(page, "je lui réponds quoi ?")).toBe(200);
  await expect(fil.getByText("Ta réponse est prête")).toBeVisible();
  /* Une question sans réponse à envoyer : rien d’elle ne se lit, sa lecture comprise ; ni « Ta meilleure réponse » */
  await expect(fil.locator("[data-verrouillee=tout]")).toBeVisible();
  await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(0);
  await expect(fil.getByText("Ta meilleure réponse")).toHaveCount(0);

  /* Des bulles données ailleurs (l’équipe), la page relue : « La lire » sur la réponse et sur la carte */
  await donnerDesBulles(email, 3);
  await ouvrir(page);
  await expect(fil.getByRole("button", { name: "La lire" })).toBeVisible();
  const r = await reponseAuGeste(page, { chemin: "/api/chat/debloquer" }, () => page.getByRole("button", { name: "La lire" }).last().click());
  expect(r.status()).toBe(200);
  await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(1);
  await expect(fil.getByText("1 bulle · il t’en reste 2")).toBeVisible();
  await expect(page.getByText("Plus que 2 bulles")).toBeVisible();
  expect(await compteDe(email)).toMatchObject({ bulles: 2 });
});
