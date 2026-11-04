import { NUMEROS_D_URGENCE, URGENCES } from "../../src/contenu/aide";
import { PHRASE_D_IDENTITE } from "../../src/contenu/identite";
import { EDITEUR } from "../../src/contenu/mentions-legales";
import { A_PROPOS, GROUPES_D_AIDE, METHODE, PAGE_AIDE } from "../../src/contenu/pages-de-confiance";
import { debordements, expect, test, URL_APPLI } from "./aide";

/*
 * Les pages de confiance (/a-propos, /methode, /aide ; leurs textes : src/contenu/pages-de-confiance.ts), ouvertes dans
 * un vrai navigateur, dans l’habit des guides : lisibles sans JavaScript (les robots des assistants n’en exécutent pas),
 * chaque numéro de /aide à un toucher, les urgences dans le premier écran d’un téléphone, rien à vendre sur /aide, rien
 * qui déborde à 320 ni à 375 px, des cibles de 44 px, et les liens qui y mènent (le pied de la landing, puis de l’une à
 * l’autre). Leur index, leur adresse canonique et leur barre finale : public-admin-pages.spec.ts, qui parcourt toutes
 * les pages publiques ; leur texte et ses garde-fous : tests/unit/pages-de-confiance.test.ts.
 */

/** Les trois pages, leur adresse et leurs textes. */
const PAGES = [
  { chemin: "/a-propos", ...A_PROPOS },
  { chemin: "/methode", ...METHODE },
  { chemin: "/aide", ...PAGE_AIDE },
] as const;

test("sans JavaScript, les trois pages se lisent en entier : leur titre, leur contenu, et chaque numéro de /aide à un toucher", async ({ browser }) => {
  const contexte = await browser.newContext({ baseURL: URL_APPLI, javaScriptEnabled: false });
  try {
    const page = await contexte.newPage();
    for (const { chemin, court, titre, surligne } of PAGES) {
      const reponse = await page.goto(chemin);
      expect(reponse?.status(), chemin).toBe(200);
      await expect(page, chemin).toHaveTitle(`${court} · BLUSH`);
      /* Un seul h1, au texte de la page, insécables comprises : sa bulle ne fait que l’habiller */
      await expect(page.locator("h1"), chemin).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 }), chemin).toHaveText(titre);
      expect(await page.locator("h1").textContent(), chemin).toBe(titre);
      await expect(page.locator("h1").getByText(surligne.mots, { exact: true }), chemin).toBeVisible();
      /* Rien de la page ne mène au parcours d’achat */
      await expect(page.locator('main a[href^="/commencer"], main a[href^="/paiement"]'), chemin).toHaveCount(0);
    }

    await test.step("/a-propos : la phrase de BLUSH, son éditeur sans le nom du directeur de la publication, où lui écrire", async () => {
      await page.goto("/a-propos");
      const main = page.getByRole("main");
      await expect(main.getByText(PHRASE_D_IDENTITE, { exact: true })).toBeVisible();
      await expect(main.getByRole("region", { name: A_PROPOS.editeur })).toContainText(EDITEUR.nom);
      await expect(page.locator("body")).not.toContainText(EDITEUR.directeurPublication);
      await expect(main.getByRole("link", { name: new RegExp(EDITEUR.email.replace(/\./g, "\\.")) })).toHaveAttribute("href", `mailto:${EDITEUR.email}`);
    });

    await test.step("/methode : relu et validé sous la responsabilité du directeur de la publication, sans le nommer, et où signaler une erreur", async () => {
      await page.goto("/methode");
      const main = page.getByRole("main");
      const relecture = METHODE.sections.find((s) => s.id === "relecture")!;
      await expect(main.getByRole("region", { name: relecture.titre })).toContainText("sous la responsabilité du directeur de la publication");
      await expect(page.locator("body")).not.toContainText(EDITEUR.directeurPublication);
      await expect(main.getByRole("link", { name: new RegExp(METHODE.mentions) })).toHaveAttribute("href", "/mentions-legales");
      await expect(main.getByRole("link", { name: new RegExp(METHODE.signaler) })).toHaveAttribute("href", `mailto:${EDITEUR.email}`);
    });

    await test.step("/aide : la phrase des urgences, puis chaque numéro de src/contenu/aide.ts à un toucher, par groupe", async () => {
      await page.goto("/aide");
      const main = page.getByRole("main");
      await expect(main.getByText(URGENCES, { exact: true })).toBeVisible();
      for (const g of GROUPES_D_AIDE) {
        const groupe = main.getByRole("region", { name: g.titre });
        await expect(groupe).toBeVisible();
        for (const l of g.lignes) {
          const lien = groupe.locator(`a[href="${l.lien}"]`);
          await expect(lien, l.lien).toBeVisible();
          if (!l.tchat) {
            await expect(lien, l.lien).toContainText(l.nom);
            continue;
          }
          /* Une ligne qui s’appelle ou s’écrit (le 3018) : son nom, puis deux boutons, l’appel et son tchat */
          await expect(groupe.getByText(l.nom, { exact: true })).toBeVisible();
          await expect(groupe.getByRole("link", { name: `Appeler le ${l.label}` })).toHaveAttribute("href", l.lien);
          await expect(groupe.getByRole("link", { name: `Écrire en tchat au ${l.label}` })).toHaveAttribute("href", l.tchat);
        }
      }
      await expect(main.locator('a[href^="tel:"], a[href^="sms:"], a[href^="https:"]')).toHaveCount(
        GROUPES_D_AIDE.flatMap((g) => g.lignes.flatMap((l) => (l.tchat ? [l.lien, l.tchat] : [l.lien]))).length,
      );
    });
  } finally {
    await contexte.close();
  }
});

test("la landing y mène par son pied de page, puis chaque page mène aux deux autres", async ({ page }) => {
  await page.goto("/");
  /* Une ligne à part dans le pied de la landing, sous ses liens */
  const pied = page.getByRole("contentinfo").getByRole("navigation", { name: "À propos de BLUSH" });
  for (const { nom, href } of [
    { nom: A_PROPOS.court, href: "/a-propos" },
    { nom: METHODE.court, href: "/methode" },
    { nom: PAGE_AIDE.court, href: "/aide" },
  ])
    await expect(pied.getByRole("link", { name: nom, exact: true })).toHaveAttribute("href", href);
  await pied.getByRole("link", { name: METHODE.court, exact: true }).click();
  await expect(page).toHaveURL(/\/methode$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(METHODE.titre);

  const voisines = page.getByRole("navigation", { name: "À propos de BLUSH" });
  await expect(voisines.getByRole("link")).toHaveCount(2);
  await voisines.getByRole("link", { name: PAGE_AIDE.court }).click();
  await expect(page).toHaveURL(/\/aide$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(PAGE_AIDE.titre);
  /* Le pied des pages légales garde ses trois liens */
  await expect(page.getByRole("navigation", { name: "Pages légales" }).getByRole("link")).toHaveCount(3);

  await page.getByRole("navigation", { name: "À propos de BLUSH" }).getByRole("link", { name: A_PROPOS.court }).click();
  await expect(page).toHaveURL(/\/a-propos$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(A_PROPOS.titre);
  await page
    .getByRole("region", { name: A_PROPOS.plusLoin })
    .getByRole("link", { name: new RegExp(METHODE.court) })
    .click();
  await expect(page).toHaveURL(/\/methode$/);
});

test("au téléphone : rien ne déborde à 320 ni à 375 px, chaque lien du contenu fait 44 px, et /aide montre ses trois numéros d’urgence dès le premier écran", async ({ page }) => {
  for (const [largeur, hauteur] of [
    [320, 568],
    [375, 667],
  ] as const) {
    await page.setViewportSize({ width: largeur, height: hauteur });
    for (const { chemin } of PAGES) {
      await page.goto(chemin);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${chemin} à ${largeur} px`).toBeLessThanOrEqual(0);
      /* Le cadre coupe ce qui dépasse : chaque élément est mesuré, là où il se voit (aide/mise-en-page.ts) */
      expect(await debordements(page), `${chemin} à ${largeur} px`).toEqual([]);
      /* Les liens du contenu et du pied, sommaire d’ordinateur à part (caché au téléphone) : 44 px de haut au moins. Le
         logo du pied dessine 34 px, mais sa zone de toucher en fait 46 (son ::after, src/components/brand/Logo.tsx) */
      const petits = await page.evaluate(() =>
        [...document.querySelectorAll('main a, footer a:not([aria-label="blush, accueil"])')]
          .map((a) => ({ texte: (a.textContent ?? "").trim(), haut: a.getBoundingClientRect().height }))
          .filter((a) => a.haut > 0 && a.haut < 44),
      );
      expect(petits, `${chemin} à ${largeur} px`).toEqual([]);
    }
    /* Sur /aide, sans défiler : la phrase des urgences et un bouton entier par numéro (le 17, le 112, le 3114) */
    await page.goto("/aide");
    await expect(page.getByText(URGENCES, { exact: true })).toBeInViewport();
    for (const n of Object.values(NUMEROS_D_URGENCE)) {
      const bouton = page.getByRole("main").locator(`a[href="tel:${n}"]`);
      await expect(bouton, `${n} à ${largeur} px`).toBeInViewport({ ratio: 1 });
      expect((await bouton.boundingBox())?.height, n).toBeGreaterThanOrEqual(44);
    }
  }
});

test("/a-propos et /methode finissent sur la fin rose de la landing, leur seul appel ; /aide n’a ni bouton, ni prix, ni appel à importer", async ({ page }) => {
  for (const chemin of ["/a-propos", "/methode"]) {
    await page.goto(chemin);
    await expect(page.getByRole("banner").getByRole("link", { name: "Commencer" }), chemin).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("link", { name: "Analyser ma conv" }), chemin).toHaveCount(0);
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Analyser ma conv" }), chemin).toBeVisible();
    await expect(page.getByRole("contentinfo").getByText(/Le rapport\s*:/), chemin).toBeVisible();
  }
  await page.goto("/aide");
  await expect(page.getByRole("link", { name: "Commencer" })).toHaveCount(0);
  await expect(page.getByText("Analyser ma conv")).toHaveCount(0);
  await expect(page.getByText(/Le rapport\s*:/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Importe/ })).toHaveCount(0);
  await expect(page.locator('a[href^="/commencer"], a[href^="/importer"], a[href^="/paiement"]')).toHaveCount(0);
});
