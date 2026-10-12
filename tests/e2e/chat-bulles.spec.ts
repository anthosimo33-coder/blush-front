import {
  attendreTaches,
  compteDe,
  debloquerLaConv,
  donnerDesBulles,
  ecrireABlush,
  emailLibre,
  expect,
  filDuChat,
  lectureFaite,
  messagesDuChat,
  ouvrir,
  ouvrirLeRapport,
  reponseAuGeste,
  test,
} from "./aide";

/*
 * Les bulles dans le chat (/app), pour un compte qui paie (pas de l’équipe) : chaque réponse de BLUSH coûte une bulle,
 * débitée par le serveur ; à 0, sa réponse s’écrit mais reste verrouillée (rien d’elle n’arrive au navigateur), une seule
 * à la fois ; rechargé, « La lire » la montre. Le modèle factice répond toujours « elle te cherche 👀 » en premier.
 * Le dessin du prototype des bulles (le compteur, la carte, la réponse floutée, la recharge) viendra avec la vague des
 * écrans : ici, juste ce qu’il faut.
 */

const PREMIERE_BULLE = "elle te cherche 👀";

test("un compte à 2 bulles : deux réponses payées, la troisième verrouillée (même rechargée), la quatrième attend ; rechargé, elle se lit", async ({ page }, testInfo) => {
  const fil = filDuChat(page);
  const email = emailLibre(testInfo, "bulles");

  await test.step("un compte qui paie : sa conv lue, son rapport débloqué (un achat), 2 bulles", async () => {
    await lectureFaite(page, testInfo, email);
    await debloquerLaConv(email);
    await ouvrirLeRapport(page);
    await attendreTaches(email);
    await donnerDesBulles(email, 2);
  });

  await test.step("deux messages : BLUSH répond à chacun, une bulle chacun", async () => {
    await ouvrir(page, "/app");
    expect(await ecrireABlush(page, "on s’est parlé ce matin")).toBe(200);
    await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(1);
    expect(await compteDe(email)).toMatchObject({ bulles: 1 });
    expect(await ecrireABlush(page, "et là elle m’écrit plus")).toBe(200);
    await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(2);
    expect(await compteDe(email)).toMatchObject({ bulles: 0 });
  });

  await test.step("à 0 bulle : BLUSH écrit sa réponse, mais elle reste verrouillée, sans rien d’elle à l’écran", async () => {
    expect(await ecrireABlush(page, "je lui réponds quoi ?")).toBe(200);
    await expect(fil.getByText("Ta réponse est prête")).toBeVisible();
    await expect(fil.getByText("Recharge tes bulles pour la lire.")).toBeVisible();
    await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(2);
    /* L’échange est gardé en base (la réponse écrite, chiffrée), rien n’est débité */
    expect(await messagesDuChat(email)).toEqual(["toi", "blush", "toi", "blush", "toi", "blush"]);
    expect(await compteDe(email)).toMatchObject({ bulles: 0 });
  });

  await test.step("rechargée, la page la montre encore verrouillée : l’historique ne la rend pas", async () => {
    await ouvrir(page);
    await expect(fil.getByText("Ta réponse est prête")).toBeVisible();
    await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(2);
    await expect(fil.getByText("je lui réponds quoi ?")).toBeVisible();
  });

  await test.step("une réponse verrouillée attend déjà : le message suivant ne part pas, BLUSH dit qu’il n’y a plus de bulles", async () => {
    expect(await ecrireABlush(page, "allô ?")).toBe(402);
    await expect(fil.getByText("plus de bulles pour l’instant 🫧")).toBeVisible();
    expect(await messagesDuChat(email)).toHaveLength(6);
  });

  await test.step("« La lire » sans bulles : elle reste verrouillée, BLUSH le redit", async () => {
    const r = await reponseAuGeste(page, { chemin: "/api/chat/debloquer" }, () => fil.getByRole("button", { name: "La lire" }).click());
    expect(r.status()).toBe(402);
    await expect(fil.getByText("plus de bulles pour l’instant 🫧 recharge, et je te réponds")).toBeVisible();
    await expect(fil.getByText("Ta réponse est prête")).toBeVisible();
  });

  await test.step("rechargé (3 bulles) : « La lire » la montre à sa place, pour une bulle", async () => {
    await donnerDesBulles(email, 3);
    const r = await reponseAuGeste(page, { chemin: "/api/chat/debloquer" }, () => fil.getByRole("button", { name: "La lire" }).click());
    expect(r.status()).toBe(200);
    await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(3);
    await expect(fil.getByText("Ta réponse est prête")).toHaveCount(0);
    expect(await compteDe(email)).toMatchObject({ bulles: 2 });
    /* Payée, l’historique la rend en entier */
    await ouvrir(page);
    await expect(fil.getByText(PREMIERE_BULLE)).toHaveCount(3);
    await expect(fil.getByText("Ta réponse est prête")).toHaveCount(0);
  });
});
