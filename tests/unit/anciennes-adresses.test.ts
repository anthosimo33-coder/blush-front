import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { describe, expect, it } from "vitest";
import nextConfig, { ANCIENNES_ADRESSES } from "../../next.config";

/*
 * Les anciennes adresses de Vercel (crush-front, blush-front) : leurs pages mènent à askblush.com, seul domaine que
 * connaissent le CAPTCHA et Apple Pay. Les redirections de next.config.ts, lues telles que Next les reçoit, et leur source
 * passée au moteur de Next : les routes /api (les crons, les webhooks) et les fichiers de Next restent servis.
 */
describe("les anciennes adresses", async () => {
  const regles = (await nextConfig.redirects!()).filter((r) => r.has?.some((h) => h.type === "host"));

  it("chacune mène au site, temporairement", () => {
    expect(regles.map((r) => r.has)).toEqual(ANCIENNES_ADRESSES.map((value) => [{ type: "host", value }]));
    for (const r of regles) {
      expect(new URL(r.destination).origin).toBe("https://www.askblush.com");
      expect(r.permanent).toBe(false);
    }
  });

  it("les pages partent, les routes /api et les fichiers de Next restent", () => {
    const correspond = getPathMatch(regles[0]!.source, { strict: true, removeUnnamedParams: true });
    for (const page of ["/", "/importer/captures", "/v/abc123", "/admin"]) expect(correspond(page), page).toBeTruthy();
    for (const servi of ["/api/captcha", "/api/cron/relances", "/api/paiement/webhook", "/_next/static/chunks/a.js"]) expect(correspond(servi), servi).toBe(false);
  });
});
