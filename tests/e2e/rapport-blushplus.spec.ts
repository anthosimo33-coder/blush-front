import {
  allerAuChapitre,
  attendreMail,
  DEFILEMENT_DOUX,
  demanderCode,
  ecoutesDuVocal,
  expect,
  filDuChat,
  histoiresDe,
  lectureComplete,
  litLeMp3,
  mailsPour,
  ouvrirLeRapport,
  saisirLeCodeRecu,
  suivreLeDefilement,
  surOrdinateur,
  test,
  URL_APPLI,
} from "./aide";

/*
 * Le rapport d’un compte de l’équipe (un invité de la bêta, BLUSH_ACCES_LIBRE : tout ouvert) : les huit chapitres écrits par le modèle
 * factice (« Chapitre N », « Assieds-toi. », « Le soir où tout a basculé. », « Et voilà. »), le mail « ton rapport est
 * prêt », le vocal de BLUSH, et la reprise de la lecture.
 */

const SUJET_PRET = "📖 Ton rapport BLUSH est prêt";

test("un rapport ouvert : les huit chapitres se lisent, le chat et ta question sont à portée, et le mail « prêt » mène au rapport", async ({ page, autreAppareil }, testInfo) => {
  const email = await lectureComplete(page, testInfo);
  const rapport = await ouvrirLeRapport(page);

  await test.step("l’en-tête dit que le rapport est complet, et le vocal de BLUSH l’ouvre", async () => {
    await expect(rapport.getByText("Complet", { exact: true })).toBeVisible();
    await expect(rapport.getByText("Aperçu gratuit", { exact: true })).toHaveCount(0);
    await expect(rapport.getByRole("button", { name: /^Écouter le vocal de BLUSH/ })).toBeVisible();
  });

  await test.step("les huit chapitres sont là, en entier, et rien n’est fermé", async () => {
    await expect(rapport.getByRole("region", { name: /^Chapitre \d : / })).toHaveCount(8);
    const chapitre1 = rapport.getByRole("region", { name: "Chapitre 1 : Le verdict" });
    await expect(chapitre1.getByText("Vous êtes à deux doigts.", { exact: true })).toBeVisible();
    for (let n = 2; n <= 8; n++) {
      const chapitre = rapport.getByRole("region", { name: `Chapitre ${n} : Chapitre ${n}` });
      await expect(chapitre.getByText("Assieds-toi.")).toBeVisible();
      await expect(chapitre.getByText("Le soir où tout a basculé.")).toBeVisible();
      await expect(chapitre.getByText("Et voilà.")).toBeVisible();
    }
    await expect(rapport.getByRole("button", { name: /\(verrouillé\)$/ })).toHaveCount(0);
    await expect(rapport.getByText(/^La suite de ton rapport/)).toHaveCount(0);
    await expect(rapport.getByRole("button", { name: "Lire la suite" })).toHaveCount(0);
  });

  await test.step("après la lecture : ta question à BLUSH, et le chat", async () => {
    await expect(rapport.getByRole("link", { name: "Poser ma question à BLUSH" })).toHaveAttribute("href", "/rapport/question");
    /* Le bouton du bas, et la bulle du chat (en bas à droite) qui s’efface quand le bouton est à l’écran */
    await expect(rapport.getByRole("link", { name: "Parler à BLUSH" }).first()).toHaveAttribute("href", "/app?depuis=rapport");
  });

  await test.step("« Parler à BLUSH » ouvre le chat, et le retour ramène au rapport", async () => {
    await rapport.getByRole("link", { name: "Parler à BLUSH" }).first().click();
    await expect(page).toHaveURL(/\/app\?depuis=rapport$/);
    await expect(filDuChat(page)).toBeVisible();
    /* Sur téléphone, le retour en haut à gauche ; sur ordinateur, « Ton rapport » à gauche de la fenêtre du chat */
    await (surOrdinateur(page) ? page.getByRole("link", { name: "Ton rapport" }) : page.getByRole("button", { name: "Revenir au rapport" })).click();
    await expect(page).toHaveURL(/\/rapport$/);
    await expect(rapport.getByRole("heading", { level: 1, name: "Noé & Maëlys" })).toBeVisible();
  });

  const histoire = (await histoiresDe(email))[0]!;
  const lien = `${URL_APPLI}/ouvrir/${histoire.id}`;

  await test.step("le rapport et la mémoire faits, la conv brute n’est plus gardée (« effacée après ton rapport »)", async () => {
    expect(histoire.convGardee).toBe(false);
  });

  await test.step("le mail « ton rapport est prêt » est arrivé une fois, avec le lien de ce rapport, et de la conv seulement son prénom", async () => {
    /* L’invité repart d’une boîte vide (nouvelInvite) : tous ses mails viennent de ce test */
    const mail = await attendreMail(email, { filtre: (m) => m.sujet === SUJET_PRET });
    expect(mailsPour(email).filter((m) => m.sujet === SUJET_PRET)).toHaveLength(1);
    expect(mail.texte).toContain("Ton rapport est prêt\u00a0: 8 chapitres");
    expect(mail.texte).toContain(lien);
    expect(mail.html).toContain(`href="${lien}"`);
    expect(mail.html).toContain("Lire mon rapport");
    /* Ni verdict, ni message, ni ton prénom ; le sien une fois, au sommaire (le titre de son chapitre, comme dans le rapport) */
    for (const prive of ["Noé", "Vous êtes à deux doigts", "esquivé", "marché aux puces"]) expect(`${mail.sujet}\n${mail.texte}\n${mail.html}`).not.toContain(prive);
    expect(mail.html.match(/Maëlys/g)).toHaveLength(1);
    /* Ce que montre l’écran verrouillé (le sujet, le texte brut) ne dit aucun prénom */
    expect(`${mail.sujet}\n${mail.texte}`).not.toContain("Maëlys");
  });

  await test.step("le lien du mail ouvre le rapport", async () => {
    await page.goto(lien);
    await expect(page).toHaveURL(/\/rapport$/);
    await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "Noé & Maëlys" })).toBeVisible();
  });

  await test.step("ouvert sur un autre appareil, sans session : la connexion d’abord, puis le rapport", async () => {
    const autre = await autreAppareil();
    await autre.goto(lien);
    await expect(autre).toHaveURL(`/connexion?suite=${encodeURIComponent(`/ouvrir/${histoire.id}`)}`);
    await saisirLeCodeRecu(autre, email, await demanderCode(autre, email));
    /* Le code vérifié, puis le lien du mail, puis le rapport : trois allers-retours */
    await expect(autre).toHaveURL(/\/rapport$/);
    await expect(autre.getByRole("main").getByRole("region", { name: "Chapitre 8 : Chapitre 8" })).toBeVisible();
  });
});

test("un rapport ouvert : le vocal de BLUSH s’écoute en grand, avec ses sous-titres ; l’écoute est notée, et un son qui ne vient pas est dit", async ({ page }, testInfo) => {
  const email = await lectureComplete(page, testInfo);
  const rapport = await ouvrirLeRapport(page);
  const histoire = (await histoiresDe(email))[0]!;
  const audio = `/api/vocal/audio?conv=${histoire.id}`;
  const tuile = rapport.getByRole("button", { name: /^Écouter le vocal de BLUSH, \d+ secondes$/ });
  const story = page.getByRole("dialog", { name: "Le vocal de BLUSH" });

  await test.step("le MP3 se lit aussi par morceaux (une plage, comme Safari la demande)", async () => {
    const plage = await page.request.get(audio, { headers: { range: "bytes=0-99" } });
    expect(plage.status()).toBe(206);
    expect(plage.headers()["content-type"]).toBe("audio/mpeg");
    expect(plage.headers()["content-range"]).toMatch(/^bytes 0-99\/\d+$/);
    expect((await plage.body()).length).toBe(100);
  });

  await test.step("la tuile ouvre le vocal en grand : BLUSH, vos prénoms, et le premier sous-titre", async () => {
    await tuile.click();
    await expect(story).toBeVisible();
    await expect(story.getByText("Noé & Maëlys")).toBeVisible();
    /* Le sous-titre, dit aux lecteurs d’écran en entier, et affiché mot à mot */
    await expect(story.getByText("Bon. Faut qu’on parle.", { exact: true }).first()).toBeAttached();
    await expect(story.getByRole("button", { name: "Revenir 5 secondes en arrière" })).toBeVisible();
    await expect(story.getByRole("button", { name: "Passer et lire le rapport" })).toBeVisible();
  });

  await test.step("là où le navigateur lit le son : « Mettre en pause », puis « Reprendre le vocal »", async () => {
    /* Le silence en MP3 du modèle factice : partout où le navigateur sait le lire (WebKit sans décodeur MP3 ne joue rien, et le dit par « Reprendre le vocal ») */
    if (await litLeMp3(page, audio)) {
      await story.getByRole("button", { name: "Mettre en pause" }).click();
      await expect(story.getByRole("button", { name: "Reprendre le vocal" })).toBeVisible();
    } else await expect(story.getByRole("button", { name: "Reprendre le vocal" })).toBeVisible();
  });

  await test.step("« Fermer et revenir au rapport » le referme ; l’écoute commencée puis fermée est notée", async () => {
    await story.getByRole("button", { name: "Fermer et revenir au rapport" }).click();
    await expect(story).toBeHidden();
    await expect(rapport.getByRole("heading", { level: 1, name: "Noé & Maëlys" })).toBeVisible();
    await expect.poll(() => ecoutesDuVocal(email)).toEqual(["debut", "ferme"]);
  });

  await test.step("le son ne vient pas (réseau coupé) : la story le dit, au lieu d’un silence", async () => {
    await page.route("**/api/vocal/audio**", (r) => r.abort("internetdisconnected"));
    /* Une page neuve : le son déjà chargé n’est plus là */
    await ouvrirLeRapport(page);
    await tuile.click();
    await expect(story.getByRole("alert")).toHaveText("Le vocal ne charge pas. Vérifie ta connexion, puis relance-le.");
    await expect(story.getByRole("button", { name: "Reprendre le vocal" })).toBeVisible();
  });
});

test("un rapport ouvert : « Reprendre ta lecture » propose de revenir au chapitre où tu t’étais arrêté, sans y sauter tout seul", async ({ page }, testInfo) => {
  await lectureComplete(page, testInfo);
  /* Jusqu’où chaque page a défilé depuis son chargement : un saut tout seul se verrait, même parti puis revenu */
  const defilement = await suivreLeDefilement(page);
  const rapport = await ouvrirLeRapport(page);
  const chapitre3 = rapport.getByRole("heading", { level: 2, name: "Chapitre 3 : Chapitre 3" });
  const reprendre = page.getByRole("button", { name: /^Reprendre ta lecture/ });

  await test.step("on lit jusqu’au chapitre 3, puis on s’en va", async () => {
    await allerAuChapitre(page, 3, "Ch. 3");
    /* Une autre page, puis le rapport de nouveau : une nouvelle visite, qui commence en haut */
    await page.goto("about:blank");
    await ouvrirLeRapport(page);
  });

  await test.step("de retour, BLUSH propose de reprendre au chapitre 3, et la page reste en haut", async () => {
    await expect(reprendre).toBeVisible();
    await expect(reprendre).toContainText("Chapitre 3 · Ch. 3");
    /* Le temps qu’un saut vers le chapitre 3, s’il partait tout seul, se fasse : la page n’a pas bougé */
    await new Promise((r) => setTimeout(r, DEFILEMENT_DOUX));
    expect(await defilement()).toBe(0);
    await expect(chapitre3).not.toBeInViewport();
  });

  await test.step("sur un téléphone, la bulle du chat se pose au-dessus de la proposition, à sa hauteur et 20 px plus haut", async () => {
    /* Sur grand écran, l’une est au centre, l’autre à droite : rien à empiler */
    if ((page.viewportSize()?.width ?? 0) >= 1024) return;
    const pastille = reprendre.locator("xpath=..");
    const bulle = page.locator("a[aria-label='Parler à BLUSH']");
    /* La proposition arrive en sautant (data-popin) : on mesure une fois posée */
    await expect(async () => {
      const [p, b] = [await pastille.boundingBox(), await bulle.boundingBox()];
      expect(p!.y - (b!.y + b!.height)).toBeCloseTo(20, 0);
    }).toPass();
  });

  await test.step("« Reprendre ta lecture » mène au chapitre 3, et la proposition s’efface", async () => {
    await reprendre.click();
    await expect(chapitre3).toBeInViewport();
    await expect(reprendre).toBeHidden();
  });

  await test.step("« Ne pas reprendre » efface la proposition, et on reste en haut du rapport", async () => {
    await page.goto("about:blank");
    await ouvrirLeRapport(page);
    await expect(reprendre).toBeVisible();
    await page.getByRole("button", { name: "Ne pas reprendre" }).click();
    await expect(reprendre).toBeHidden();
    await new Promise((r) => setTimeout(r, DEFILEMENT_DOUX));
    expect(await defilement()).toBe(0);
    await expect(chapitre3).not.toBeInViewport();
  });
});
