import { readdirSync } from "node:fs";
import { ARTICLES, articlesDu, cheminDe } from "../../src/contenu/articles";
import { NB_CHAPITRES } from "../../src/contenu/chapitres";
import { PHRASE_D_IDENTITE } from "../../src/contenu/identite";
import { TEMOIGNAGES } from "../../src/contenu/landing";
import { EDITEUR } from "../../src/contenu/mentions-legales";
import { pagesPubliques } from "../../src/lib/referencement";
import { NUMEROS_D_URGENCE } from "../../src/contenu/aide";
import { bullesSurPlusieursLignes, debordements, desactiverPartage, expect, partageIllisible, test } from "./aide";

/*
 * Les pages publiques, sans compte : la landing (la promesse, les convs d’exemple, le quotidien, les boutons vers le
 * parcours), la confidentialité, le choix de l’appli, la page introuvable et celle d’une page qui plante, puis ce que
 * voient les moteurs (chaque page publique, registre des articles compris, sa barre finale, /llms.txt) et la signature
 * des articles publiés, sans aucun nom. Elles figent
 * le comportement d’aujourd’hui (le back-end, la bêta ouverte).
 */

const NB = "\u00a0";

test("la landing : la promesse, les boutons vers le parcours, les faits, sans faux avis", async ({ page }) => {
  await test.step("la promesse, et le bouton principal deux fois (en haut, puis dans le pied de page)", async () => {
    const reponse = await page.goto("/");
    expect(reponse?.status()).toBe(200);
    await expect(page).toHaveTitle("BLUSH · Analyse ta conv\u00a0: ce qui se passe vraiment entre vous");
    const main = page.getByRole("main");
    const titre = main.getByRole("heading", { level: 1 });
    await expect(titre).toContainText("en dit plus");
    await expect(titre).toContainText("que tu crois");
    /* Sous le titre, ce que BLUSH lit, en toutes lettres (la seule phrase visible qui le dit en entier), et les mots du titre de la page */
    await expect(main.getByText(`Captures d’écran, export Instagram ou WhatsApp${NB}: BLUSH te dit ce qui se passe vraiment entre vous, et quoi répondre.`)).toBeVisible();
    await expect(main.getByRole("link", { name: "Analyser ma conv" })).toHaveAttribute("href", "/commencer");
    await expect(main.getByText("Paiement unique · Ta conv reste confidentielle")).toBeVisible();
    /* Le pied de page fait le dernier appel : son titre géant, le bouton blanc et la même ligne, puis ses liens */
    const pied = page.getByRole("contentinfo");
    await expect(pied.getByRole("heading", { level: 2, name: "ta conv sait tout." })).toBeAttached();
    const boutons = pied.getByRole("link", { name: "Analyser ma conv" });
    await expect(boutons).toHaveCount(2);
    for (const bouton of await boutons.all()) await expect(bouton).toHaveAttribute("href", "/commencer");
    await expect(pied.getByText("Paiement unique · Ta conv reste confidentielle")).toBeAttached();
  });

  await test.step("les faits, et les témoignages des testeurs", async () => {
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 2, name: "Rapide. Complet. Discret." })).toBeVisible();
    /* Les faits disent ce que dit la page Confidentialité : le nombre de chapitres de la règle, la conv brute effacée après le rapport (pas « 0 message ») */
    await expect(main.getByRole("listitem").filter({ hasText: "chapitres dans ton rapport" })).toContainText(`${NB_CHAPITRES}`);
    await expect(main.getByRole("listitem").filter({ hasText: "conv brute gardée après ton rapport" })).toContainText("0");
    await expect(main.getByText("message gardé après ton rapport")).toHaveCount(0);
    await expect(main.getByRole("heading", { name: TEMOIGNAGES.titre })).toBeVisible();
    for (const prenom of ["Mattheo", "Sonia", "Charlotte"]) await expect(main.getByText(prenom, { exact: true }).first()).toBeAttached();
  });

  await test.step("l’en-tête et le pied de page : se connecter, commencer, la confidentialité", async () => {
    const entete = page.getByRole("banner");
    await expect(entete.getByRole("link", { name: "Se connecter" })).toHaveAttribute("href", "/connexion");
    await expect(entete.getByRole("link", { name: "Commencer", exact: true })).toHaveAttribute("href", "/commencer");
    const pied = page.getByRole("navigation", { name: "Pied de page" });
    await expect(pied.getByRole("link", { name: "Analyser ma conv" })).toHaveAttribute("href", "/commencer");
    await expect(pied.getByRole("link", { name: "Se connecter" })).toHaveAttribute("href", "/connexion");
    await expect(pied.getByRole("link", { name: "Confidentialité" })).toHaveAttribute("href", "/confidentialite");
  });

  await test.step("le bouton du haut mène au choix de l’appli", async () => {
    await page.getByRole("main").getByRole("link", { name: "Analyser ma conv" }).first().click();
    await expect(page).toHaveURL(/\/commencer$/);
    await expect(page.getByRole("heading", { level: 1, name: "Vous vous parlez où ?" })).toBeVisible();
  });
});

test("une conv d’exemple qui défile montre le verdict de BLUSH, qui se ferme ou mène au parcours", async ({ page }) => {
  /*
   * Les convs défilent sans arrêt : Playwright ne clique que sur un élément immobile. Avec « réduire les animations »
   * (un réglage de l’appareil), elles restent en place et glissent au doigt : c’est ce parcours-là qu’on suit.
   */
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByText("Choisis une conv, je te donne mon verdict.")).toBeVisible();

  await test.step("Léa : son verdict d’exemple, puis « Fermer »", async () => {
    await page.getByRole("button", { name: /Léa.*voir le verdict de BLUSH/ }).click();
    const feuille = page.getByRole("dialog", { name: "Léa", exact: true });
    await expect(feuille).toBeVisible();
    await expect(feuille.getByText("Vous êtes à deux doigts.")).toBeVisible();
    await expect(feuille.getByText("Elle te tend des perches depuis trois semaines.")).toBeVisible();
    await expect(feuille.getByText("on refait un verre quand tu veux, mais cette fois c’est toi qui choisis le bar")).toBeVisible();
    /* Sa carte « Ton prochain pas » (le titre revient, plus bas, dans « La suite de son rapport ») */
    await expect(feuille.getByText("Ton prochain pas").first()).toBeVisible();
    await expect(feuille.getByText("Choisis le bar, et propose-lui un soir précis.")).toBeVisible();
    await feuille.getByRole("button", { name: "Fermer" }).click();
    await expect(feuille).toBeHidden();
  });

  await test.step("Théo : un autre verdict, et son bouton mène au parcours", async () => {
    await page.getByRole("button", { name: /Théo.*voir le verdict de BLUSH/ }).click();
    const feuille = page.getByRole("dialog", { name: "Théo", exact: true });
    await expect(feuille.getByText("Il est partant.")).toBeVisible();
    await expect(feuille.getByText("Il propose de se voir, avec un jour et une heure.")).toBeVisible();
    await feuille.getByRole("link", { name: "Analyser ma conv" }).click();
    await expect(page).toHaveURL(/\/commencer$/);
    await expect(page.getByRole("heading", { level: 1, name: "Vous vous parlez où ?" })).toBeVisible();
  });
});

test("une conv de la copie qui boucle s’ouvre aussi au toucher (elle est à l’écran une bonne part du tour)", async ({ page }, testInfo) => {
  await page.goto("/");
  /*
   * La première rangée arrêtée là où la copie est à l’écran (45 % de la piste, qui glisse de 0 à −50 %) : Playwright ne
   * vise pas un élément qui bouge. Le toucher se fait à l’endroit de la conv, comme un doigt : c’est la page qui dit ce
   * qu’il y a dessous (une liste `inert` laissait passer le toucher, et rien ne s’ouvrait).
   */
  await page.addStyleTag({ content: "[data-marquee] { animation: none !important; transform: translateX(-45%) !important; }" });
  const copie = page.locator("[data-marquee]").first().locator("ul").nth(1);
  await expect(copie).toHaveAttribute("aria-hidden", "true");
  const conv = copie.getByRole("button", { includeHidden: true }).first();
  /* Hors du clavier et des lecteurs d’écran, comme avant */
  await expect(conv).toHaveAttribute("tabindex", "-1");
  const nom = (await conv.locator("span span").first().textContent())!;
  const boite = (await conv.boundingBox())!;
  const x = boite.x + boite.width / 2;
  const y = boite.y + boite.height / 2;
  expect(x).toBeGreaterThan(0);
  expect(x).toBeLessThan(page.viewportSize()!.width);
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  const feuille = page.getByRole("dialog", { name: nom, exact: true });
  await expect(feuille).toBeVisible();
  await expect(feuille.getByText("Ton prochain pas").first()).toBeVisible();
});

test("le bloc du quotidien : une question touchée ouvre sa réponse et referme la précédente", async ({ page }) => {
  await page.goto("/");
  const bloc = page.getByRole("region", { name: /un nouveau\s*message/ });
  await expect(bloc.getByText("Ensuite, avec tes bulles")).toBeVisible();
  const sens = bloc.getByRole("region", { name: `ça veut dire quoi${NB}?` });
  const repondre = bloc.getByRole("region", { name: `je lui réponds quoi${NB}?` });

  /* La première réponse est ouverte d’office */
  await expect(sens).toBeVisible();
  await expect(sens.getByText("Elle est partante, mais fatiguée.")).toBeVisible();
  await expect(repondre).toBeHidden();

  await bloc.getByRole("button", { name: `je lui réponds quoi${NB}?` }).click();
  await expect(repondre).toBeVisible();
  await expect(repondre.getByText(`Courage pour jeudi. Samedi pour fêter ça${NB}?`)).toBeVisible();
  await expect(sens).toBeHidden();
});

test("la confidentialité : ce qui part, qui le lit, combien de temps, sans nommer d’IA ni de voix", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Pied de page" }).getByRole("link", { name: "Confidentialité" }).click();
  await expect(page).toHaveURL(/\/confidentialite$/);
  await expect(page).toHaveTitle("Ta conv, en sécurité · BLUSH");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Ta conv, en sécurité." })).toBeVisible();
  for (const titre of ["Ce que tu nous envoies", "Qui la lit", "Comment on la protège", "Combien de temps", "Nos prestataires"]) {
    await expect(main.getByRole("heading", { level: 2, name: titre, exact: true })).toBeVisible();
  }
  await expect(main.getByText("BLUSH, et seulement lui")).toBeVisible();
  await expect(main.getByText("La conv brute, effacée après ton rapport")).toBeVisible();
  /* Le partage, comme la feuille « En savoir plus » du rapport le résume : le lien comme l’image */
  await expect(main.getByText("Rien ne sort sans toi")).toBeVisible();
  await expect(main.getByText(/ton verdict, par un lien, ou en image une réponse de BLUSH/)).toBeVisible();
  await expect(main.getByText("BLUSH est ouvert dès 15 ans.")).toBeVisible();
  /* Le CAPTCHA, nommé comme l’hébergement et les mails : ce qu’il voit (« Pas de robots »), et sa ligne parmi les prestataires */
  await expect(main.getByText(/Cloudflare vérifie que tu n’es pas un robot/)).toBeVisible();
  await expect(main.getByText("La vérification anti-robots, aux États-Unis")).toBeVisible();
  await expect(main.getByRole("link", { name: /Une question\s*\? Écris-nous/ })).toHaveAttribute("href", "mailto:bonjour@askblush.com");
  /* Les prestataires d’IA et de voix ne sont jamais nommés (choix du 9 octobre 2026) */
  const texte = await main.innerText();
  for (const nom of ["Anthropic", "Claude", "ElevenLabs", "Mistral", "OpenAI"]) expect(texte, nom).not.toContain(nom);
});

test("la confidentialité : « Retour » ramène d’où l’on vient, et à la landing quand on l’ouvre directement", async ({ page }) => {
  /* La flèche du mobile ou le lien du desktop : celui que montre l’écran */
  const retour = page.getByRole("link", { name: "Retour" }).locator("visible=true");

  await test.step("venu de la landing : le retour y revient, en arrière (l’historique ne garde pas la confidentialité devant)", async () => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Pied de page" }).getByRole("link", { name: "Confidentialité" }).click();
    await expect(page).toHaveURL(/\/confidentialite$/);
    await retour.click();
    await expect(page).toHaveURL(/\/$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/confidentialite$/);
  });

  /* Avant, le lien du desktop visait la landing quelle que soit la page d’avant : « Comment ça marche » de l’import y menait */
  await test.step("venue d’un écran de l’import (« Comment ça marche ») : le retour y revient, pas à la landing", async () => {
    await page.goto("/commencer");
    await page.getByRole("link", { name: "Comment ça marche" }).click();
    await expect(page).toHaveURL(/\/confidentialite$/);
    await retour.click();
    await expect(page).toHaveURL(/\/commencer$/);
    await expect(page.getByRole("heading", { level: 1, name: "Vous vous parlez où ?" })).toBeVisible();
  });

  await test.step("ouverte directement (un lien, un nouvel onglet) : le retour mène à la landing, sans quitter BLUSH", async () => {
    await page.goto("/confidentialite");
    await expect(retour).toHaveAttribute("href", "/");
    await retour.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("main").getByRole("link", { name: "Analyser ma conv" }).first()).toBeVisible();
  });
});

test("/commencer : trois applis et « Captures d’écran », chacune vers son import (Instagram par son export), sans bandeau de bêta privée", async ({ page }) => {
  const reponse = await page.goto("/commencer");
  expect(reponse?.status()).toBe(200);
  await expect(page).toHaveTitle("Vous vous parlez où ? · BLUSH");
  await expect(page.getByRole("heading", { level: 1, name: "Vous vous parlez où ?" })).toBeVisible();
  const applis = page.getByRole("navigation", { name: "Ton appli" });
  await expect(applis.getByRole("link")).toHaveCount(4);
  const attendues: [string, string][] = [
    ["WhatsApp", "/importer/export?app=whatsapp"],
    ["iMessage", "/importer/captures?app=imessage"],
    ["Instagram", "/importer/export?app=instagram"],
    ["Captures d’écran", "/importer/captures?app=autre"],
  ];
  for (const [nom, href] of attendues) await expect(applis.getByRole("link", { name: nom })).toHaveAttribute("href", href);
  await expect(page.getByRole("link", { name: "Comment ça marche" })).toHaveAttribute("href", "/confidentialite");
  /* La bêta est ouverte sur ce serveur : ni bandeau, ni liste d’attente */
  await expect(page.getByText("Bêta privée, sur invitation")).toHaveCount(0);

  await applis.getByRole("link", { name: "Instagram" }).click();
  await expect(page).toHaveURL(/\/importer\/export\?app=instagram$/);
  await expect(page.getByRole("heading", { level: 1, name: "Exporte votre conv." })).toBeVisible();
});

test("les anciennes adresses du chat (son message, le brouillon) mènent à l’accueil", async ({ request }) => {
  /* L’écran 14 vit dans le chat de l’accueil, l’écran 15 a été retiré (next.config.ts) : un vieux lien ne casse pas */
  for (const ancienne of ["/app/message/1", "/app/message/msg-42", "/app/brouillon"]) {
    const r = await request.get(ancienne, { maxRedirects: 0 });
    expect.soft(r.status(), ancienne).toBe(307);
    expect.soft(r.headers().location, ancienne).toBe("/app");
  }
});

test("une adresse inconnue : la page introuvable (404), qui ramène à l’accueil", async ({ page }) => {
  const reponse = await page.goto("/une-adresse-qui-n-existe-pas");
  expect(reponse?.status()).toBe(404);
  await expect(page).toHaveTitle("Page introuvable · BLUSH");
  await expect(page.getByRole("heading", { level: 1, name: "Cette page n’existe pas." })).toBeVisible();
  await expect(page.getByText("Le lien est peut-être incomplet. Ta conv, elle, t’attend sur l’accueil.")).toBeVisible();
  await page.getByRole("link", { name: "Revenir à l’accueil" }).click();
  await expect(page).toHaveURL(/:\d+\/$/);
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toContainText("en dit plus");
});

test("une page qui plante : « Ça a coincé de notre côté. », puis « Réessayer » la recharge une fois le souci passé", async ({ page }) => {
  /* Aucun écran ne fait planter une page : un lien de partage dont le verdict ne se déchiffre plus le fait */
  const partage = await partageIllisible();
  try {
    await test.step("la page plante : 500, et l’écran d’erreur de BLUSH", async () => {
      const reponse = await page.goto(`/v/${partage.id}`);
      expect(reponse?.status()).toBe(500);
      await expect(page.getByRole("heading", { level: 1, name: "Ça a coincé de notre côté." })).toBeVisible();
      await expect(page.getByText("Ta conv est en sécurité. Réessaie dans un instant.")).toBeVisible();
    });

    await test.step("le souci passé (le lien a été désactivé entre-temps), « Réessayer » affiche la page", async () => {
      await desactiverPartage(partage.id);
      await page.getByRole("button", { name: "Réessayer" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Ce lien ne montre plus rien." })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Ça a coincé de notre côté." })).toHaveCount(0);
    });
  } finally {
    await partage.effacer();
  }
});

test("les pages de l’équipe s’ouvrent hors de Vercel, et n’y montrent rien de réel sans leurs variables locales", async ({ request }) => {
  /* Un seul critère, « jamais sur Vercel » : src/proxy.ts y sert la page introuvable (tests/proxy.test.ts). Ce serveur de test n’y est pas */
  const styleguide = await request.get("/styleguide");
  expect(styleguide.status()).toBe(200);
  expect(await styleguide.text()).toContain("Les briques de BLUSH");
  /* Des données fictives seulement */
  for (const chemin of [
    "/apercu/admin",
    "/apercu/admin?p=1&suivi=0",
    "/apercu/admin?p=30&calme=1",
    "/apercu/admin?p=1&ventes=1",
    "/apercu/admin?du=2026-09-21&au=2026-10-04",
    "/apercu/admin?version=actuelle",
    "/apercu/admin/direct",
    "/apercu/ecriture",
    "/apercu/instagram",
    "/apercu/mail",
  ]) {
    expect((await request.get(chemin)).status(), chemin).toBe(200);
  }
  /* Le gabarit des guides et du lexique, sur des articles d’exemple inventés (le guide dans ses trois zones), jamais dans les moteurs */
  for (const chemin of ["/apercu/guide", "/apercu/guide?zone=orange", "/apercu/guide?zone=rouge", "/apercu/lexique"]) {
    const r = await request.get(chemin);
    expect(r.status(), chemin).toBe(200);
    const html = await r.text();
    expect(html, chemin).toContain("exemple inventé");
    expect(html, chemin).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  }
  const carte = await request.get("/apercu/carte?cas=court");
  expect(carte.status(), "/apercu/carte").toBe(200);
  expect(carte.headers()["content-type"], "/apercu/carte").toBe("image/png");
  /*
   * Les rapports écrits par les prompts (BLUSH_APERCU) et le vrai modèle (BLUSH_DEMANDER) : sans leur variable, rien.
   * tests/e2e/serveur.mjs refuse de lancer les tests si un fichier .env les définit.
   */
  for (const chemin of ["/apercu", "/apercu/liste", "/apercu/accueil", "/apercu/fiche"]) {
    expect((await request.get(chemin)).status(), chemin).toBe(404);
  }
  expect((await request.post("/apercu/demander", { data: { text: "elle m’a répondu « on verra »" } })).status(), "/apercu/demander").toBe(404);
});

test("les moteurs de recherche : chaque page publique s’indexe (canonique, aperçu complet, données structurées), le parcours non ; robots.txt et le plan du site répondent", async ({
  page,
  request,
}) => {
  /* Toutes les pages publiques, registre des articles compris (src/lib/referencement.ts) : chacune dans le plan du site, avec sa date */
  const pages = pagesPubliques();
  const plan = await (await request.get("/sitemap.xml")).text();
  for (const { chemin, misAJourLe } of pages) {
    await page.goto(chemin);
    await expect(page.locator('meta[name="robots"]'), chemin).toHaveAttribute("content", /^index, follow/);
    await expect(page.locator('link[rel="canonical"]'), chemin).toHaveCount(1);
    /* Hors de Vercel, sans metadataBase (src/app/layout.tsx), l’adresse canonique s’écrit sans son domaine */
    expect(new URL((await page.locator('link[rel="canonical"]').getAttribute("href"))!, page.url()).pathname, chemin).toBe(chemin);
    await expect(page.locator('meta[property="og:image"]'), chemin).toHaveCount(1);
    await expect(page.locator('meta[property="og:site_name"]'), chemin).toHaveAttribute("content", "BLUSH");
    await expect(page.locator('meta[property="og:locale"]'), chemin).toHaveAttribute("content", "fr_FR");
    await expect(page.locator('meta[property="og:type"]'), chemin).toHaveAttribute("content", /^(website|article)$/);
    expect(plan, chemin).toMatch(new RegExp(`<loc>https?://[^/<]+${chemin === "/" ? "" : chemin}</loc>\\s*<lastmod>${misAJourLe}`));
  }
  await page.goto("/");
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}") as { "@graph"?: { "@type": string }[] };
  expect(ld["@graph"]?.map((n) => n["@type"])).toEqual(["Organization", "WebSite", "WebApplication"]);
  /* Une rubrique sans article n’existe pas : la page introuvable, hors du plan du site */
  for (const [genre, hub] of [
    ["guide", "/guides"],
    ["lexique", "/lexique"],
  ] as const)
    if (!articlesDu(genre).length) {
      expect((await request.get(hub)).status(), hub).toBe(404);
      expect(plan, hub).not.toContain(`${hub}</loc>`);
    }
  /* Le parcours reste hors des moteurs */
  await page.goto("/commencer");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  /* L’image d’aperçu se dessine, robots.txt répond (hors de Vercel, il n’ouvre rien) */
  const og = await request.get("/opengraph-image");
  expect([og.status(), og.headers()["content-type"]]).toEqual([200, "image/png"]);
  expect((await request.get("/robots.txt")).status()).toBe(200);
});

test("les guides et le lexique publiés : « Par l’équipe BLUSH », sans aucun nom ni « relu par » hors de l’expert, ni dans la page ni dans ses données structurées", async ({
  page,
}) => {
  for (const a of ARTICLES) {
    const chemin = cheminDe(a);
    await page.goto(chemin);
    const html = await page.content();
    await expect(page.locator("article > header"), chemin).toContainText(/Par l’équipe BLUSH · (relu par [^·]+ · )?mis à jour le .+ · Notre méthode/);
    /* Un seul h1, au texte du registre : ses bulles (la situation, l’action) ne font que l’habiller */
    await expect(page.locator("h1"), chemin).toHaveCount(1);
    expect(await page.locator("h1").textContent(), chemin).toBe(a.titre);
    await expect(page.locator("h1").getByText(a.surligne.situation, { exact: true }), chemin).toBeVisible();
    await expect(page.locator("h1").getByText(a.surligne.action, { exact: true }), chemin).toBeVisible();
    /* Le nom, nulle part dans le HTML, charge RSC comprise (elle redit chaque texte de la page) ; « relu par » se compte
       dans le texte affiché, une fois pour l’expert d’une page rouge */
    expect(html.toLocaleLowerCase("fr"), chemin).not.toContain(EDITEUR.directeurPublication.toLocaleLowerCase("fr"));
    expect((await page.locator("body").innerText()).match(/relu par/gi) ?? [], chemin).toHaveLength(a.expert ? 1 : 0);
    const ld = (await page.locator('script[type="application/ld+json"]').textContent()) ?? "";
    expect(ld, chemin).toContain(`"lastReviewed":"${a.valideLe}"`);
    expect(ld, chemin).not.toMatch(/relu par/i);
  }
});

test("les guides et le lexique au téléphone : rien ne déborde à 320 ni à 375 px, chaque bulle du titre tient sur une ligne ; la zone rouge, sobre, a ses numéros d’urgence dans le premier écran, ni bouton, ni prix, ni bloc rose, un simple lien", async ({
  page,
}) => {
  const chemins = [
    ...(articlesDu("guide").length ? ["/guides"] : []),
    ...ARTICLES.map(cheminDe),
    "/apercu/guide",
    "/apercu/guide?zone=orange",
    "/apercu/guide?zone=rouge",
    "/apercu/lexique",
  ];
  /* Le cadre coupe ce qui dépasse (la page ne défile jamais de côté) : chaque élément est mesuré, là où il se voit (aide/mise-en-page.ts) */
  for (const largeur of [320, 375]) {
    await page.setViewportSize({ width: largeur, height: 667 });
    for (const chemin of chemins) {
      await page.goto(chemin);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${chemin} à ${largeur} px`).toBeLessThanOrEqual(0);
      expect(await debordements(page), `${chemin} à ${largeur} px`).toEqual([]);
      expect(await bullesSurPlusieursLignes(page), `${chemin} à ${largeur} px`).toEqual([]);
    }
  }
  /* La zone rouge : les numéros d’urgence entiers dans le premier écran, sur un ordinateur (à côté du titre) comme au téléphone */
  for (const [largeur, hauteur] of [
    [1280, 800],
    [375, 667],
  ] as const) {
    await page.setViewportSize({ width: largeur, height: hauteur });
    await page.goto("/apercu/guide?zone=rouge");
    for (const n of Object.values(NUMEROS_D_URGENCE)) await expect(page.locator(`main a[href="tel:${n}"]`), `${n} à ${largeur} px`).toBeInViewport({ ratio: 1 });
  }
  /* Sobre : ni couverture, ni bulle dans le titre */
  await expect(page.locator("[data-couverture]")).toHaveCount(0);
  await expect(page.locator("h1 .inline-block")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: `Besoin d’en parler${NB}?` })).toBeVisible();
  await expect(page.getByText("Analyser ma conv")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Commencer" })).toHaveCount(0);
  await expect(page.getByText(/Le rapport\s*:/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Importe-la sur BLUSH" })).toBeVisible();
  /* Ailleurs, la fin rose de la landing : son bouton, ses deux promesses et le prix tiré du code */
  await page.goto("/apercu/guide?zone=orange");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Analyser ma conv" })).toBeVisible();
  await expect(page.getByRole("contentinfo").getByText(/Le rapport\s*:/)).toBeVisible();
});

test("une seule adresse par page publique : sa barre finale mène à la même sans (308), et rien d’autre ne bouge (le relais de PostHog, l’API, le proxy)", async ({ request }) => {
  /* Les pages publiques, et les adresses des articles avant même qu’ils existent (la redirection passe avant la page) */
  for (const chemin of new Set(["/guides", "/lexique/ghosting", ...pagesPubliques().map((p) => p.chemin)].filter((c) => c !== "/"))) {
    const r = await request.get(`${chemin}/?depuis=test`, { maxRedirects: 0 });
    expect(r.status(), `${chemin}/`).toBe(308);
    expect(r.headers()["location"], `${chemin}/`).toBe(`${chemin}?depuis=test`);
  }
  /* Les requêtes de PostHog gardent leur barre : sans sa clé, ce serveur n’a pas de relais (404), jamais une redirection */
  for (const chemin of ["/ingest/e/", "/ingest/s/"]) expect((await request.post(chemin, { data: "{}", maxRedirects: 0 })).status(), chemin).toBe(404);
  expect((await request.get("/api/reveil/", { maxRedirects: 0 })).status()).not.toBe(308);
  /* Les pages du proxy ont leur propre redirection (src/proxy.ts) */
  const commencer = await request.get("/commencer/", { maxRedirects: 0 });
  expect([commencer.status(), commencer.headers()["location"]]).toEqual([308, expect.stringMatching(/\/commencer$/)]);
});

test("/llms.txt présente BLUSH par sa phrase et ses pages publiques ; la clé IndexNow est servie à la racine", async ({ request }) => {
  const llms = await request.get("/llms.txt");
  expect([llms.status(), llms.headers()["content-type"]]).toEqual([200, "text/plain; charset=utf-8"]);
  const texte = await llms.text();
  expect(texte).toContain(`> ${PHRASE_D_IDENTITE}`);
  for (const { nom } of pagesPubliques()) expect(texte, nom).toContain(`[${nom}](`);
  const [cle] = readdirSync("public").filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  const fichier = await request.get(`/${cle}`);
  expect([fichier.status(), await fichier.text()]).toEqual([200, cle!.replace(/\.txt$/, "")]);
});
