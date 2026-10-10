import { createHash } from "node:crypto";
import { test as base, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { nouvelAppareil, suivreLeNavigateur } from "./page";

/*
 * Tout ce que les tests de bout en bout importent, d’ici seulement : `test` et `expect` de Playwright (avec l’IP propre à
 * chaque test, des pages qui attendent d’être vivantes après chaque chargement, et d’autres appareils refermés à la fin),
 * les réglages des serveurs, et les aides.
 * import { expect, test, … } from "./aide";
 */

/**
 * L’adresse IP d’un test, une par test (et par nouvel essai) : 10.x.y.z. Les limites anti-abus comptent par IP (les
 * imports, les codes : src/server/limites.ts), et tous les navigateurs des tests viennent de la même machine.
 */
function ipDuTest(testInfo: TestInfo): string {
  const [a, b, c] = createHash("sha256").update(`${testInfo.testId}:${testInfo.repeatEachIndex}:${testInfo.retry}`).digest();
  return `10.${a}.${b}.${c}`;
}

/* Le second argument d’une fixture s’appelle `fournir` ici : nommé `use`, la règle des hooks React le prend pour un hook */
export const test = base.extend<{ autreAppareil: () => Promise<Page> }>({
  /*
   * Chaque requête du test (la page, ses fetch, `request`, et les navigateurs ouverts par browser.newContext) porte son IP
   * dans x-forwarded-for, que le serveur lit (ipDe)
   */
  extraHTTPHeaders: async ({ extraHTTPHeaders }, fournir, testInfo) => {
    await fournir({ ...extraHTTPHeaders, "x-forwarded-for": ipDuTest(testInfo) });
  },
  /* Chaque page du navigateur du test attend d’être vivante après un chargement (aide/page.ts) */
  context: async ({ context }, fournir) => {
    suivreLeNavigateur(context);
    await fournir(context);
  },
  /*
   * Un autre appareil (un pote, le mail ouvert ailleurs, un intrus) : un navigateur à part, sans les cookies du test.
   * `const pote = await autreAppareil()` ; tous ceux du test sont refermés à sa fin, qu’il passe ou non.
   */
  autreAppareil: async ({ browser }, fournir) => {
    const ouverts: BrowserContext[] = [];
    await fournir(async () => {
      const page = await nouvelAppareil(browser);
      ouverts.push(page.context());
      return page;
    });
    await Promise.all(ouverts.map((c) => c.close().catch(() => {})));
  },
});
export { devices, expect } from "@playwright/test";

/* Les réglages des serveurs des tests (tests/e2e/reglages.ts) dont les tests ont besoin */
export { CRON_SECRET, DOMAINE, INVITES, URL_APPLI, URL_BETA } from "../reglages";

export * from "./base";
export * from "./beta";
export * from "./boite";
export * from "./chat-fiche";
export * from "./compte";
export * from "./emails";
export * from "./exports";
export * from "./import";
export * from "./instagram-captures";
export * from "./lecture";
export * from "./page";
export * from "./parcours";
export * from "./partage";
export * from "./public-admin";
export * from "./rapport";
