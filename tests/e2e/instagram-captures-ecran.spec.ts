import { readFileSync } from "node:fs";
import { auMoins } from "../aide/listes";
import {
  attendreLaScene,
  attendreLecture,
  captureIllisible,
  capturesPng,
  carteDuVerdict,
  centreDeLaVignette,
  choisirFichier,
  compteDe,
  demanderCode,
  emailLibre,
  expect,
  grilleDesCaptures,
  histoiresDe,
  LECTURE_DES_CAPTURES,
  ordreAffiche,
  saisirLeCodeRecu,
  surOrdinateur,
  tachesDe,
  test,
  vignette as capture,
} from "./aide";

/*
 * Les captures d’écran (/importer/captures) : on les choisit, on en ajoute, on en retire, on règle leur ordre (au clavier,
 * au pointeur), puis BLUSH les lit toutes d’un coup au clic sur Continuer. Le modèle factice lit toujours la même conv :
 * 24 messages avec Elias (src/server/ia/factice.ts). Sur des captures, on est « Moi » : « Qui es-tu ? » demande le prénom.
 */

test("captures : choisir, en ajouter, en retirer ; la grille les numérote et en garde 20 au plus", async ({ page }, testInfo) => {
  /* Toutes écrites d’avance : réécrire un fichier déjà choisi le rend illisible au navigateur (Chromium compare sa date) */
  const fichiers = capturesPng(testInfo, 22);
  const [c1, c2, c3, c4, c5] = auMoins(fichiers, 5);

  await test.step("la tuile Hinge mène aux captures", async () => {
    await page.goto("/commencer");
    await page.getByRole("link", { name: "Hinge Captures d’écran" }).click();
    await expect(page).toHaveURL(/\/importer\/captures\?app=hinge$/);
    await expect(page.getByRole("heading", { level: 1, name: "Choisis tes captures." })).toBeVisible();
  });

  await test.step("trois captures choisies : trois vignettes numérotées, dans l’ordre choisi", async () => {
    await choisirFichier(page, [c1, c2, c3], "Choisir mes captures");
    await expect(capture(page, 3, 3)).toBeVisible();
    await expect(page.getByText("3 captures prêtes")).toBeVisible();
    await expect(page.getByText("Maintiens une capture et glisse-la pour changer l’ordre. BLUSH les remettra aussi dans l’ordre des dates.")).toBeVisible();
    expect(await ordreAffiche(page)).toEqual([1, 2, 3]);
    await expect(page.getByRole("button", { name: "Continuer" })).toBeEnabled();
  });

  await test.step("deux de plus avec « Ajouter des captures » : elles se mettent à la suite", async () => {
    await choisirFichier(page, [c4, c5], "Ajouter des captures");
    await expect(capture(page, 5, 5)).toBeVisible();
    await expect(page.getByText("5 captures prêtes")).toBeVisible();
    expect(await ordreAffiche(page)).toEqual([1, 2, 3, 4, 5]);
  });

  await test.step("la croix retire la capture 2 : les autres se renumérotent", async () => {
    await page.getByRole("button", { name: "Retirer la capture 2", exact: true }).click();
    await expect(capture(page, 4, 4)).toBeVisible();
    await expect(capture(page, 5, 5)).toHaveCount(0);
    await expect(page.getByText("4 captures prêtes")).toBeVisible();
    await expect(page.getByText("Capture retirée.")).toBeAttached();
    expect(await ordreAffiche(page)).toEqual([1, 3, 4, 5]);
  });

  await test.step("au-delà de 20 captures, les 20 premières sont gardées, et c’est dit ; en retirer une efface le message", async () => {
    /* 4 déjà là, 17 de plus : 21 */
    await choisirFichier(page, fichiers.slice(5), "Ajouter des captures");
    await expect(capture(page, 20, 20)).toBeVisible();
    await expect(grilleDesCaptures(page).getByRole("button", { name: /^Capture \d+ sur \d+$/ })).toHaveCount(20);
    const trop = page.getByText(/^20 captures au plus\s: on a gardé les 20 premières\. Retires-en pour en ajouter d’autres\.$/);
    await expect(trop).toBeVisible();
    await expect(page.getByText("20 captures prêtes")).toBeVisible();
    /* Les quatre premières n’ont pas bougé */
    expect((await ordreAffiche(page)).slice(0, 4)).toEqual([1, 3, 4, 5]);
    await page.getByRole("button", { name: "Retirer la capture 20", exact: true }).click();
    await expect(capture(page, 19, 19)).toBeVisible();
    await expect(trop).toHaveCount(0);
  });
});

test("captures : au clavier, les flèches déplacent la capture (le focus la suit) et Suppr la retire", async ({ page }, testInfo) => {
  await page.goto("/importer/captures?app=autre");
  await choisirFichier(page, capturesPng(testInfo, 4), "Choisir mes captures");
  expect(await ordreAffiche(page)).toEqual([1, 2, 3, 4]);

  await test.step("→ : la capture 1 passe en 2e place", async () => {
    await capture(page, 1, 4).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("Capture déplacée en position 2.")).toBeAttached();
    await expect(capture(page, 2, 4)).toBeFocused();
    expect(await ordreAffiche(page)).toEqual([2, 1, 3, 4]);
  });

  await test.step("↓ : une rangée plus bas (trois places), arrêtée à la dernière", async () => {
    await page.keyboard.press("ArrowDown");
    await expect(page.getByText("Capture déplacée en position 4.")).toBeAttached();
    await expect(capture(page, 4, 4)).toBeFocused();
    expect(await ordreAffiche(page)).toEqual([2, 3, 4, 1]);
  });

  await test.step("↑ puis ← : une rangée plus haut, puis une place à gauche, arrêtée à la première", async () => {
    await page.keyboard.press("ArrowUp");
    await expect(capture(page, 1, 4)).toBeFocused();
    expect(await ordreAffiche(page)).toEqual([1, 2, 3, 4]);
    await page.keyboard.press("ArrowLeft");
    await expect(capture(page, 1, 4)).toBeFocused();
    expect(await ordreAffiche(page)).toEqual([1, 2, 3, 4]);
  });

  await test.step("Suppr : la capture retirée, et c’est annoncé", async () => {
    await page.keyboard.press("Delete");
    await expect(capture(page, 3, 3)).toBeVisible();
    await expect(page.getByText("Capture retirée.")).toBeAttached();
    await expect(page.getByText("3 captures prêtes")).toBeVisible();
    expect(await ordreAffiche(page)).toEqual([2, 3, 4]);
  });
});

test("captures : au pointeur, on attrape une capture et on la pose sur une autre", async ({ page }, testInfo) => {
  /*
   * Sans les glissements animés (réglage « réduire les animations ») : la capture posée est aussitôt sous le pointeur. Avec
   * eux, on peut lâcher sur une vignette encore en mouvement, ou entre deux, et le glisser reste accroché (le bug plus bas).
   */
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/importer/captures?app=autre");
  await choisirFichier(page, capturesPng(testInfo, 3), "Choisir mes captures");
  expect(await ordreAffiche(page)).toEqual([1, 2, 3]);

  const depart = await centreDeLaVignette(page, 1, 3);
  await page.mouse.move(depart.x, depart.y);
  await page.mouse.down();
  /* Quelques pixels : la capture se soulève (sa croix s’efface) */
  await page.mouse.move(depart.x + 12, depart.y);
  await expect(page.getByRole("button", { name: "Retirer la capture 1", exact: true })).toHaveCSS("opacity", "0");
  const arrivee = await centreDeLaVignette(page, 3, 3);
  await page.mouse.move(arrivee.x, arrivee.y);
  /* Les autres captures se décalent : on lâche une fois la capture à sa nouvelle place, comme on la voit */
  await expect.poll(() => ordreAffiche(page)).toEqual([2, 3, 1]);
  await page.mouse.up();

  await expect(page.getByText("Capture déplacée en position 3.")).toBeAttached();
  await expect(page.getByRole("button", { name: "Retirer la capture 3", exact: true })).toHaveCSS("opacity", "1");
  expect(await ordreAffiche(page)).toEqual([2, 3, 1]);
});

test("captures : des fichiers glissés sur la zone d’ajout, seules les images entrent", async ({ page }, testInfo) => {
  test.skip(!surOrdinateur(page), "glisser des fichiers depuis le bureau sur la page : un geste d’ordinateur");
  const c1 = capturesPng(testInfo, 1)[0]!;
  await page.goto("/importer/captures?app=hinge");
  /* Une capture et une note .txt, glissées ensemble depuis le bureau */
  const fichiers = await page.evaluateHandle(
    ({ png }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], "capture-1.png", { type: "image/png" }));
      dt.items.add(new File(["une note"], "note.txt", { type: "text/plain" }));
      return dt;
    },
    { png: readFileSync(c1).toString("base64") },
  );
  const zone = page.getByRole("button", { name: /^Ajoute tes captures/ });
  await zone.dispatchEvent("dragover", { dataTransfer: fichiers });
  await zone.dispatchEvent("drop", { dataTransfer: fichiers });
  await expect(capture(page, 1, 1)).toBeVisible();
  await expect(page.getByText("1 capture prête")).toBeVisible();
  expect(await ordreAffiche(page)).toEqual([1]);
});

test("captures seules, jusqu’au rapport : BLUSH les lit, « Qui es-tu ? » demande le prénom, le rapport est celui de Jade et Elias", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "captures");

  await test.step("« Autre appli » : trois captures, lues au clic sur Continuer", async () => {
    await page.goto("/commencer");
    await page.getByRole("link", { name: "Autre appli Messenger, Tinder, Bumble… par captures d’écran" }).click();
    await expect(page).toHaveURL(/\/importer\/captures\?app=autre$/);
    await choisirFichier(page, capturesPng(testInfo, 3), "Choisir mes captures");
    await expect(page.getByText("3 captures prêtes")).toBeVisible();
    await page.getByRole("button", { name: "Continuer" }).click();
  });

  await test.step("qui es-tu : pas de choix entre deux personnes, mais le prénom (on est à droite des captures, face à Elias)", async () => {
    /* Pas d’écran « C’est bon, on a votre conv. » : les captures mènent droit à « Qui es-tu ? », une fois lues */
    await expect(page).toHaveURL(/\/qui$/, { timeout: LECTURE_DES_CAPTURES });
    await expect(page.getByRole("heading", { level: 1, name: "Qui es-tu dans cette conv\u00a0?" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Qui es-tu dans cette conv\u00a0?" })).toHaveCount(0);
    const prenom = page.getByLabel("Ton prénom (dans votre conv avec Elias, tu es à droite)");
    await expect(prenom).toBeVisible();
    const continuer = page.getByRole("button", { name: "Continuer" });
    await page.getByRole("radio", { name: "Une fille" }).click();
    await page.getByRole("radio", { name: "C’est flou" }).click();
    await page.getByRole("radio", { name: "Juste comprendre" }).click();
    await expect(continuer).toBeDisabled();
    /* Des espaces ne font pas un prénom */
    await prenom.fill("   ");
    await expect(continuer).toBeDisabled();
    await prenom.fill("Jade");
    await expect(continuer).toBeEnabled();
    await continuer.click();
  });

  await test.step("l’email, le code, puis la lecture des 24 messages lus sur les captures", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "On t’envoie ton rapport où\u00a0?" })).toBeVisible();
    await saisirLeCodeRecu(page, email, await demanderCode(page, email));
    await attendreLecture(page);
    await expect(page.getByRole("heading", { level: 1, name: /BLUSH analyse tes\s*24\s*messages/ })).toBeVisible();
    await page.getByRole("link", { name: "Voir mon rapport" }).click();
  });

  await test.step("le verdict, puis le rapport : « Jade & Elias »", async () => {
    /* « Voir mon rapport » recharge toute la page : la scène répond une fois vivante */
    await attendreLaScene(page, 24);
    for (let k = 0; k < 3; k++) await page.getByRole("button", { name: "Suivant" }).click();
    await expect(carteDuVerdict(page, 4, 4, "Ton rapport est prêt.")).toBeVisible();
    await page.getByRole("link", { name: "Voir mon rapport" }).click();
    await expect(page).toHaveURL(/\/rapport$/);
    await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "Jade & Elias" })).toBeVisible();
  });

  await test.step("côté serveur : une histoire de 24 messages, lue (le verdict seul : compte gratuit)", async () => {
    expect(await compteDe(email)).toMatchObject({ bulles: 0, debloquees: 0 });
    expect(await histoiresDe(email)).toEqual([expect.objectContaining({ messages: 24 })]);
    expect((await tachesDe(email)).map((t) => [t.genre, t.statut])).toEqual([["verdict", "fini"]]);
  });
});

test("captures : une capture illisible, l’écran d’erreur le dit, et « Choisir d’autres captures » ramène aux captures", async ({ page }, testInfo) => {
  const c1 = capturesPng(testInfo, 1)[0]!;
  await page.goto("/importer/captures?app=hinge");
  await choisirFichier(page, [c1, captureIllisible(testInfo)], "Choisir mes captures");
  await expect(capture(page, 2, 2)).toBeVisible();
  await page.getByRole("button", { name: "Continuer" }).click();

  const erreur = page.getByRole("alertdialog", { name: "Cette capture est illisible." });
  await expect(erreur).toBeVisible();
  await expect(erreur.getByText("On ne voit pas bien les messages. Refais la capture en entier, sans la recadrer.")).toBeVisible();
  await expect(page).toHaveURL(/\/importer\/captures\?app=hinge&erreur=capture$/);
  await erreur.getByRole("link", { name: "Choisir d’autres captures" }).click();
  await expect(page).toHaveURL(/\/importer\/captures\?app=hinge$/);
  await expect(erreur).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Choisis tes captures." })).toBeVisible();
  /* Aujourd’hui, la grille reste telle quelle : la capture illisible y est encore, sans rien qui la désigne (à retirer soi-même) */
  await expect(capture(page, 2, 2)).toBeVisible();
  await expect(page.getByText("2 captures prêtes")).toBeVisible();
});

/*
 * Dès que la capture qu’on glisse change de place, React déplace son élément dans la liste et le navigateur lui retire
 * le pointeur (lostpointercapture, dans Chromium comme dans WebKit). La fin du glisser s’écoute donc sur la fenêtre
 * (src/components/ui/ReorderGrid.tsx) : lâchée ailleurs que sur une vignette (au-dessus de la grille, entre deux
 * vignettes), la capture se pose, c’est annoncé, et le simple survol d’une autre vignette, bouton relâché, ne la déplace plus.
 */
test("captures : au pointeur, lâcher la capture hors de la grille la pose, et survoler ensuite ne déplace plus rien", async ({ page }, testInfo) => {
  await page.goto("/importer/captures?app=autre");
  await choisirFichier(page, capturesPng(testInfo, 3), "Choisir mes captures");
  const depart = await centreDeLaVignette(page, 1, 3);
  await page.mouse.move(depart.x, depart.y);
  await page.mouse.down();
  await page.mouse.move(depart.x + 12, depart.y);
  await expect(page.getByRole("button", { name: "Retirer la capture 1", exact: true })).toHaveCSS("opacity", "0");
  const arrivee = await centreDeLaVignette(page, 3, 3);
  await page.mouse.move(arrivee.x, arrivee.y);
  await expect.poll(() => ordreAffiche(page)).toEqual([2, 3, 1]);
  /* On continue jusqu’au titre, et on lâche là */
  const titre = (await page.getByRole("heading", { level: 1, name: "Choisis tes captures." }).boundingBox())!;
  await page.mouse.move(titre.x + 20, titre.y + titre.height / 2);
  await page.mouse.up();
  await expect(page.getByText("Capture déplacée en position 3.")).toBeAttached();
  await expect(page.getByRole("button", { name: "Retirer la capture 3", exact: true })).toHaveCSS("opacity", "1");
  /* Bouton relâché, passer sur la première vignette ne déplace rien */
  const premiere = await centreDeLaVignette(page, 1, 3);
  await page.mouse.move(premiere.x, premiere.y, { steps: 3 });
  expect(await ordreAffiche(page)).toEqual([2, 3, 1]);
});

/*
 * Retirer une capture au clavier (Suppr, ou Entrée sur sa croix) ne fait pas retomber le focus sur la page : il va à
 * la capture qui prend sa place (ou à la précédente), comme un déplacement aux flèches le garde sur la capture. La
 * dernière retirée, il va à la zone d’ajout qui remplace la grille.
 */
test("captures : après Suppr ou la croix au clavier, le focus reste dans la grille, puis va à la zone d’ajout", async ({ page }, testInfo) => {
  await page.goto("/importer/captures?app=autre");
  await choisirFichier(page, capturesPng(testInfo, 4), "Choisir mes captures");
  await capture(page, 2, 4).focus();
  await page.keyboard.press("Delete");
  await expect(capture(page, 3, 3)).toBeVisible();
  await expect(
    grilleDesCaptures(page)
      .getByRole("button", { name: /^Capture \d+ sur 3$/ })
      .and(page.locator(":focus")),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Retirer la capture 1", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(capture(page, 2, 2)).toBeVisible();
  await expect(
    grilleDesCaptures(page)
      .getByRole("button", { name: /^Capture \d+ sur 2$/ })
      .and(page.locator(":focus")),
  ).toHaveCount(1);
  /* La dernière retirée, la grille part : le focus va à la zone d’ajout qui revient */
  await capture(page, 1, 2).focus();
  await page.keyboard.press("Delete");
  await capture(page, 1, 1).focus();
  await page.keyboard.press("Delete");
  await expect(page.getByRole("button", { name: /^Ajoute tes captures/ })).toBeFocused();
});
