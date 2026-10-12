import type { APIRequestContext, BrowserContext, TestInfo } from "@playwright/test";
import { ENTETE_CAPTCHA, JETON_DE_TEST, SCRIPT_TURNSTILE } from "../../../src/lib/captcha";

/*
 * Le CAPTCHA dans les tests de bout en bout. Les serveurs ont les clés de test de Cloudflare (playwright.config.ts,
 * tests/e2e/construire.mjs) : le serveur répond lui-même à la clé secrète qui passe toujours (src/server/captcha.ts), sans
 * appeler Cloudflare. Dans le navigateur, le script de Cloudflare ne part pas non plus sur le réseau : chaque navigateur
 * du test reçoit à sa place un faux widget (fauxCloudflare), qui rend le jeton factice des clés de test, comme le vrai
 * avec elles. Les routes appelées directement (aide/compte.ts, la galerie) portent ce jeton elles-mêmes.
 */

/**
 * Le faux script de Cloudflare : `turnstile.render` rend le jeton factice peu après (comme un widget géré qui passe sans
 * geste), `reset` en rend un autre. Ce qu’il a dessiné se lit dans `window.__turnstile` (les actions, les jetons rendus).
 */
const FAUX_SCRIPT = `(() => {
  const widgets = new Map();
  let n = 0;
  const suivi = (window.__turnstile = { actions: [], rendus: 0 });
  const rendre = (o) => setTimeout(() => { suivi.rendus++; o.callback && o.callback(${JSON.stringify(JETON_DE_TEST)}); }, 30);
  window.turnstile = {
    render(conteneur, o) {
      const id = "faux-" + ++n;
      widgets.set(id, o);
      suivi.actions.push(o.action);
      rendre(o);
      return id;
    },
    reset(id) {
      const o = widgets.get(id);
      if (o) rendre(o);
    },
    remove(id) {
      widgets.delete(id);
    },
  };
})();`;

/** Ce que le faux widget a fait dans la page : les actions de ses widgets, et les jetons rendus. */
export type SuiviDuWidget = { actions: string[]; rendus: number };

/** Le script de Cloudflare, demandé par un navigateur du test, reçoit le faux à sa place : rien ne part sur le réseau. */
export async function fauxCloudflare(contexte: BrowserContext): Promise<void> {
  await contexte.route(`${new URL(SCRIPT_TURNSTILE).origin}/**`, (route) =>
    route.request().url() === SCRIPT_TURNSTILE ? route.fulfill({ contentType: "text/javascript", body: FAUX_SCRIPT }) : route.abort(),
  );
}

/** L’en-tête du jeton factice, pour une demande de code faite sans l’écran. */
export const ENTETE_DU_JETON = { [ENTETE_CAPTCHA]: JETON_DE_TEST };

/**
 * Le laissez-passer du CAPTCHA pour un import fait sans l’écran (POST /api/captcha, avec le jeton factice) : un cookie que
 * `request` garde (page.request : celui du navigateur du test), pour un import et son nouvel essai.
 */
export async function prouverHumain(request: APIRequestContext, testInfo: TestInfo): Promise<void> {
  const r = await request.post("/api/captcha", { headers: { origin: String(testInfo.project.use.baseURL), ...ENTETE_DU_JETON } });
  if (r.status() !== 200) throw new Error(`le laissez-passer du CAPTCHA est refusé : ${r.status()} ${await r.text()}`);
}
