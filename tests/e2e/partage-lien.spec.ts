import type { Page, TestInfo } from "@playwright/test";
import { DESSIN, emailLibre, expect, exportWhatsApp, importerWhatsApp, lectureFaite, liensDe, mesurerCompteurs, ouvrirLePartage, reecrireVerdict, ROBOT_WHATSAPP, taillePng, test } from "./aide";

/*
 * Le lien public d’un verdict partagé (/v/<id>), tel que le voient les potes : la page (le verdict seul, le prénom de
 * l’autre en initiale, celui de qui partage en clair), son image (l’aperçu dans une conv, la story), « Analyser ma conv »,
 * et les compteurs du tableau de bord. La feuille qui crée le lien : partage-feuille.spec.ts.
 */

/** Une conv lue (Noé et Maëlys), puis « Partager mon verdict » ouvert dans le rapport : renvoie l’identifiant du lien. */
async function partagerUnVerdict(page: Page, testInfo: TestInfo, email: string, avant?: () => Promise<void>): Promise<string> {
  await lectureFaite(page, testInfo, email);
  await avant?.();
  await page.goto("/rapport");
  await mesurerCompteurs(() => ouvrirLePartage(page), { partage_ouvert: 1, lien_cree: 1 });
  const [id] = await liensDe(email);
  return id;
}

test("la page publique, sans compte : le verdict seul, le prénom de l’autre en initiale, le tien en clair", async ({ page, autreAppareil }, testInfo) => {
  const email = emailLibre(testInfo, "public");
  /* Le modèle factice ne nomme personne : le verdict est réécrit avec les deux prénoms, celui de l’autre suivi d’un point */
  const titre = "Maëlys attend que Noé se lance.";
  const sousTitre = "Noé, elle t’a tendu la perche. Pas vrai, Maëlys.";
  const titreMasque = "M. attend que Noé se lance.";
  const sousTitreMasque = "Noé, elle t’a tendu la perche. Pas vrai, M.";
  const id = await partagerUnVerdict(page, testInfo, email, () => reecrireVerdict(email, { titre, sousTitre }));

  await test.step("dans la feuille, l’aperçu montre déjà le verdict tel que les potes le verront", async () => {
    const feuille = page.getByRole("dialog", { name: "Partager ton verdict" });
    await expect(feuille.getByRole("figure")).toContainText(`🤏 ${titreMasque}`);
    await expect(feuille.getByRole("img", { name: `🤏 ${titreMasque}` })).toBeVisible();
    const whatsapp = await feuille.getByRole("link", { name: "WhatsApp" }).getAttribute("href");
    expect(new URL(whatsapp!).searchParams.get("text")).toContain(`«\u00a0${titreMasque}\u00a0»`);
    /* Le rapport, lui, garde les deux prénoms */
    await feuille.getByRole("button", { name: "Fermer" }).click();
    await expect(page.getByRole("main").getByText(titre).first()).toBeVisible();
  });

  /* Un pote, sur son téléphone : un autre navigateur, sans compte */
  const pote = await autreAppareil();
  await test.step("la page montre le verdict seul, Maëlys devenue « M. », Noé en clair", async () => {
    await mesurerCompteurs(async () => {
      await pote.goto(`/v/${id}`);
      await expect(pote.getByRole("heading", { level: 1, name: titreMasque })).toBeVisible();
    }, { lien_vu: 1 });
    const verdict = pote.getByRole("region", { name: titreMasque });
    await expect(verdict.getByText("j’ai lu toute leur conv 👀")).toBeVisible();
    await expect(verdict.getByText("verdict :")).toBeVisible();
    await expect(verdict.getByText(sousTitreMasque)).toBeVisible();
    await expect(pote.getByText("et la mienne, elle dit quoi ?")).toBeVisible();
    await expect(pote.getByText("Leur conv reste privée : seul le verdict est partagé, sans le prénom de l’autre.")).toBeVisible();
    await expect(pote.getByRole("heading", { level: 2, name: "Ta conv en dit plus que tu crois." })).toBeVisible();
    await expect(pote.getByRole("link", { name: "Analyser ma conv" })).toHaveAttribute("href", `/v/${id}/essayer`);
  });

  await test.step("rien d’autre : ni son prénom, ni un message, ni un chapitre", async () => {
    const corps = pote.locator("body");
    await expect(corps).not.toContainText("Maëlys");
    /* Des messages de la conv importée (aide/exports.ts) */
    await expect(corps).not.toContainText("marché aux puces");
    await expect(corps).not.toContainText("chocolatine");
    await expect(corps).not.toContainText("Chapitre");
  });

  await test.step("l’aperçu du lien dans une conv : le verdict masqué en titre, et son image", async () => {
    await expect(pote).toHaveTitle(`🤏 ${titreMasque}`);
    const meta = (nom: string) => pote.locator(`meta[property="${nom}"], meta[name="${nom}"]`);
    await expect(meta("og:title")).toHaveAttribute("content", `🤏 ${titreMasque}`);
    await expect(meta("og:description")).toHaveAttribute("content", sousTitreMasque);
    await expect(meta("description")).toHaveAttribute("content", "BLUSH a lu toute leur conv. Et la tienne, elle dit quoi\u00a0?");
    await expect(meta("og:image")).toHaveAttribute("content", `${testInfo.project.use.baseURL}/v/${id}/image`);
    await expect(meta("twitter:card")).toHaveAttribute("content", "summary_large_image");
  });
});

test("l’image du lien : un PNG pour l’aperçu et pour la story ; seul le robot de l’aperçu compte", async ({ page, request }, testInfo) => {
  /* Cinq images dessinées par le serveur */
  test.slow();
  const email = emailLibre(testInfo, "image");
  const id = await partagerUnVerdict(page, testInfo, email);

  await test.step("l’aperçu (1200 × 630) et la story (1080 × 1920) sont de vrais PNG", async () => {
    const carte = await request.get(`/v/${id}/image`, { timeout: DESSIN });
    expect(carte.status()).toBe(200);
    expect(carte.headers()["content-type"]).toBe("image/png");
    expect(taillePng(await carte.body())).toEqual({ largeur: 1200, hauteur: 630 });
    const story = await request.get(`/v/${id}/image?format=story`, { timeout: DESSIN });
    expect(story.status()).toBe(200);
    expect(story.headers()["content-type"]).toBe("image/png");
    expect(taillePng(await story.body())).toEqual({ largeur: 1080, hauteur: 1920 });
  });

  await test.step("le robot de WhatsApp lit l’aperçu dans la page, et son passage ne compte pas comme une visite", async () => {
    const robot = { "user-agent": ROBOT_WHATSAPP };
    await mesurerCompteurs(async () => {
      const pageVue = await request.get(`/v/${id}`, { headers: robot });
      expect(pageVue.status()).toBe(200);
      expect(await pageVue.text()).toContain(`<meta property="og:image" content="${testInfo.project.use.baseURL}/v/${id}/image"/>`);
      /* La story, demandée par un robot : jamais comptée */
      expect((await request.get(`/v/${id}/image?format=story`, { headers: robot, timeout: DESSIN })).status()).toBe(200);
      /* L’aperçu dessiné pour le robot : le lien vient d’être collé dans une conv */
      expect((await request.get(`/v/${id}/image`, { headers: robot, timeout: DESSIN })).status()).toBe(200);
      /* Une personne qui ouvre la page (après le robot : son compte à lui serait déjà là) */
      expect((await request.get(`/v/${id}`)).status()).toBe(200);
    }, { lien_apercu: 1, lien_vu: 1 });
  });

  await test.step("l’image demandée par une personne (la feuille de partage) ne compte pas", async () => {
    await mesurerCompteurs(async () => {
      expect((await request.get(`/v/${id}/image`, { timeout: DESSIN })).status()).toBe(200);
    }, {});
  });
});

test("un lien inconnu, ou l’ancien lien de démo : « Ce lien ne montre plus rien. », et pas d’image", async ({ page, request }) => {
  /* « demo » montrait le verdict de l’ancien mode démo : ce n’est pas un lien (un identifiant de partage a 12 caractères) */
  for (const id of ["demo", "abcdefghijkm", "pas-un-lien"]) {
    await test.step(`/v/${id}`, async () => {
      await mesurerCompteurs(async () => {
        await page.goto(`/v/${id}`);
        await expect(page.getByRole("heading", { level: 1, name: "Ce lien ne montre plus rien." })).toBeVisible();
      }, {});
      await expect(page).toHaveTitle("Lien désactivé · BLUSH");
      await expect(page.getByText("oups 🙈")).toBeVisible();
      await expect(page.getByText("La personne qui l’a partagé l’a désactivé. C’est elle qui décide.")).toBeVisible();
      /* La page invite quand même à essayer BLUSH */
      await expect(page.getByRole("link", { name: "Analyser ma conv" })).toBeVisible();
      await expect(page.getByText("Leur conv reste privée", { exact: false })).toHaveCount(0);
      expect((await request.get(`/v/${id}/image`)).status()).toBe(404);
      expect((await request.get(`/v/${id}/image?format=story`)).status()).toBe(404);
    });
  }
});

test("« Analyser ma conv » mène au début du parcours ; la conv importée ensuite compte comme venue du partage, une fois", async ({ page, autreAppareil }, testInfo) => {
  const email = emailLibre(testInfo, "essai");
  const id = await partagerUnVerdict(page, testInfo, email);

  const pote = await autreAppareil();
  await test.step("sans compte : la page, puis « Analyser ma conv », puis « Vous vous parlez où ? »", async () => {
    await mesurerCompteurs(async () => {
      await pote.goto(`/v/${id}`);
      await expect(pote.getByRole("heading", { level: 1, name: "Vous êtes à deux doigts." })).toBeVisible();
    }, { lien_vu: 1 });
    await mesurerCompteurs(async () => {
      await pote.getByRole("link", { name: "Analyser ma conv" }).click();
      await expect(pote).toHaveURL(/\/commencer$/);
      await expect(pote.getByRole("heading", { level: 1, name: "Vous vous parlez où ?" })).toBeVisible();
    }, {});
  });

  await test.step("sa conv importée compte comme venue d’un verdict partagé ; la suivante, non", async () => {
    const lina = { toi: "Lina", autre: "Sacha" };
    await mesurerCompteurs(() => importerWhatsApp(pote, exportWhatsApp(testInfo, { personnes: lina })), { import_partage: 1 });
    await mesurerCompteurs(() => importerWhatsApp(pote, exportWhatsApp(testInfo, { personnes: lina })), {});
  });

  await test.step("connecté, celui qui partage voit la même page, et « Analyser ma conv » mène aussi au début du parcours", async () => {
    await mesurerCompteurs(async () => {
      await page.goto(`/v/${id}`);
      await expect(page.getByRole("heading", { level: 1, name: "Vous êtes à deux doigts." })).toBeVisible();
    }, { lien_vu: 1 });
    await page.getByRole("link", { name: "Analyser ma conv" }).click();
    await expect(page).toHaveURL(/\/commencer$/);
    await expect(page.getByRole("heading", { level: 1, name: "Vous vous parlez où ?" })).toBeVisible();
  });
});

/*
 * Bug : la page d’un verdict partagé compte un essai (lien_essai) et pose la marque « venu du partage » dès qu’elle
 * s’affiche, sans que personne touche « Analyser ma conv ». Le bouton est un <Link> de Next (src/components/ui/Button.tsx:68),
 * que Next précharge en production : le préchargement appelle la route src/app/v/[id]/essayer/route.ts:9-10, qui compte
 * et pose le cookie. Le toucher, lui, reprend le préchargement et ne compte rien. Le bouton est à
 * src/app/v/[id]/page.tsx:90 (prefetch={false}, ou un simple <a>, corrigerait).
 */
test.fixme("voir la page ne compte pas d’essai : seul « Analyser ma conv » touché compte", async ({ page, autreAppareil }, testInfo) => {
  const email = emailLibre(testInfo, "precharge");
  const id = await partagerUnVerdict(page, testInfo, email);
  const pote = await autreAppareil();
  await mesurerCompteurs(async () => {
    await pote.goto(`/v/${id}`);
    await expect(pote.getByRole("link", { name: "Analyser ma conv" })).toBeVisible();
    /* Le temps qu’un éventuel préchargement parte et revienne */
    await pote.waitForLoadState("networkidle");
  }, { lien_vu: 1 }, { avecEssais: true });
  await mesurerCompteurs(async () => {
    await pote.getByRole("link", { name: "Analyser ma conv" }).click();
    await expect(pote).toHaveURL(/\/commencer$/);
  }, { lien_essai: 1 }, { avecEssais: true });
});

/*
 * Les espaces avant « : » et « ? » de la page publique et des feuilles du partage sont insécables (NBSP, src/lib/format.ts) :
 * sur un écran étroit, « ? » ou « : » ne part pas seul à la ligne. Le code, lui, est vérifié par scripts/verifier-typo.mjs.
 */
test("les espaces avant « : » et « ? » sont insécables, sur la page publique et dans les feuilles", async ({ page }, testInfo) => {
  const email = emailLibre(testInfo, "insecable");
  const id = await partagerUnVerdict(page, testInfo, email);
  const texte = (motif: RegExp) => page.getByText(motif).first().textContent();
  expect(await texte(/rien d’autre/)).toContain("rien d’autre\u00a0: ni vos messages");
  await page.getByRole("dialog", { name: "Partager ton verdict" }).getByRole("button", { name: "Fermer" }).click();
  await page.getByRole("main").getByRole("button", { name: "En savoir plus" }).click();
  expect(await texte(/au bout de 24/)).toContain("au bout de 24\u00a0h");
  /* Une visite compte (lien_vu) : mesurée comme les autres gestes du partage, pour ne pas fausser les compteurs d’un autre test */
  await mesurerCompteurs(async () => {
    await page.goto(`/v/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }, { lien_vu: 1 });
  expect(await texte(/^verdict/)).toBe("verdict\u00a0:");
  expect(await texte(/elle dit quoi/)).toBe("et la mienne, elle dit quoi\u00a0?");
  expect(await texte(/Leur conv reste privée/)).toContain("privée\u00a0: seul");
});
