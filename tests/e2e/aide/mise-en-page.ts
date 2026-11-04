import type { Page } from "@playwright/test";

/*
 * Les mesures de mise en page des pages éditoriales (les guides, le lexique, les pages de confiance), au téléphone. Le
 * cadre de ces pages coupe ce qui dépasse sur les côtés (overflow-x: clip, src/components/article/cadre.tsx) : la page ne
 * défile jamais de côté, et document.documentElement.scrollWidth ne voit donc plus rien. On mesure chaque élément, là
 * où il se voit vraiment.
 */

/**
 * Ce qui dépasse de l’écran sur les côtés, coupé par le cadre : chaque élément de la barre du haut, du contenu et du pied,
 * et chaque texte (un texte qui ne passe pas à la ligne déborde de sa boîte sans l’agrandir), dont la part visible (son
 * rectangle, rogné par ses ancêtres qui coupent ce qui dépasse) sort de l’écran de plus d’un demi-pixel. Les décors
 * cachés aux lecteurs d’écran (aria-hidden : la lueur de la fin rose, « blush » en très grand) ont le droit d’en sortir.
 * Rend le début du texte de chaque morceau qui dépasse, et de combien : [] si rien ne dépasse.
 */
export async function debordements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const largeur = window.innerWidth;
    const fautes: string[] = [];
    /* Les morceaux mesurés : chaque élément (rogné à partir de son parent), puis chaque texte (rogné à partir de son élément) */
    const morceaux: { dans: Element; rogne: Element | null; rect: DOMRect; texte: string }[] = [];
    for (const racine of document.querySelectorAll("header, main, footer")) {
      for (const e of racine.querySelectorAll("*")) morceaux.push({ dans: e, rogne: e.parentElement, rect: e.getBoundingClientRect(), texte: e.textContent ?? "" });
      const textes = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
      for (let n = textes.nextNode(); n; n = textes.nextNode()) {
        if (!n.textContent?.trim() || !n.parentElement) continue;
        const plage = document.createRange();
        plage.selectNodeContents(n);
        morceaux.push({ dans: n.parentElement, rogne: n.parentElement, rect: plage.getBoundingClientRect(), texte: n.textContent });
      }
    }
    for (const { dans, rogne, rect, texte } of morceaux) {
      if (dans.closest('[aria-hidden="true"]') || dans.closest(".sr-only")) continue;
      if (rect.width === 0 || rect.height === 0) continue;
      let gauche = rect.left;
      let droite = rect.right;
      /* La part visible : rognée par chaque ancêtre qui coupe ce qui dépasse, sauf le cadre de la page (c’est lui qu’on vérifie) */
      for (let a = rogne; a && a !== document.body; a = a.parentElement) {
        const style = getComputedStyle(a);
        if (style.overflowX === "visible" || a.matches("[class*='overflow-x-clip']")) continue;
        const ra = a.getBoundingClientRect();
        gauche = Math.max(gauche, ra.left);
        droite = Math.min(droite, ra.right);
      }
      if (droite <= gauche) continue;
      const depasse = Math.max(droite - largeur, -gauche);
      if (depasse > 0.5) fautes.push(`« ${texte.trim().slice(0, 30)} » (${dans.tagName.toLowerCase()}) dépasse de ${Math.round(depasse)} px`);
    }
    return fautes;
  });
}

/**
 * Les bulles du titre (h1) qui passent sur plusieurs lignes : une bulle surlignée doit tenir sur une ligne du
 * téléphone (SURLIGNE_MAX, tests/aide/articles.ts) ; trop longue, elle passerait à la ligne dans sa bulle. Rend le texte
 * de chacune, [] si toutes tiennent.
 */
export async function bullesSurPlusieursLignes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("h1 span.inline-block")]
      .filter((b) => {
        const style = getComputedStyle(b);
        const hauteurDUneLigne = Number.parseFloat(style.lineHeight) + Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
        return (b as HTMLElement).offsetHeight > hauteurDUneLigne * 1.5;
      })
      .map((b) => (b.textContent ?? "").trim()),
  );
}
