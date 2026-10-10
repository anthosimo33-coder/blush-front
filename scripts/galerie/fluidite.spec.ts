import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, lectureBlushPlus, test, URL_APPLI } from "../../tests/e2e/aide";

/*
 * Le banc de fluidité de l’accueil (scripts/fluidite/fluidite.mjs) sur le vrai back-end : un compte BLUSH+ semé comme
 * ceux de la galerie (sa conv lue, toute la suite écrite par le modèle factice), sur le serveur des tests (le build de
 * production, `npm run e2e:build`). Le banc ouvre l’accueil avec le cookie de session de ce compte. Seulement avec
 * BLUSH_GALERIE=1 (le projet galerie-fluidite de playwright.config.ts) : `npm run fluidite`.
 * CPU, RUNS, ONLY, DEBUG, NORAF et OUT passent au banc tels quels.
 */
test("le banc de fluidité de l’accueil, sur un compte BLUSH+", async ({ page }, testInfo) => {
  /* Chaque passage rejoue huit scénarios, le processeur ralenti */
  test.setTimeout(30 * 60_000);
  await lectureBlushPlus(page, testInfo);
  const session = (await page.context().cookies()).find((c) => c.name === "blush-session")?.value;
  expect(session, "la session du compte BLUSH+").toBeTruthy();
  const banc = spawnSync(process.execPath, [resolve(__dirname, "../fluidite/fluidite.mjs")], {
    stdio: "inherit",
    env: { ...process.env, BASE: URL_APPLI, SESSION: session },
  });
  expect(banc.status, "le banc de fluidité").toBe(0);
});
