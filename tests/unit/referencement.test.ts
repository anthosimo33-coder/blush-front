import { afterEach, describe, expect, it, vi } from "vitest";

/* Ce que les moteurs de recherche voient (src/lib/referencement.ts, src/app/robots.ts, src/app/sitemap.ts) : les pages publiques, rien de privé */

afterEach(() => vi.unstubAllEnvs());

describe("le référencement", () => {
  it("une page publique dit elle-même qu’elle s’indexe, avec son adresse canonique, son titre et sa description dans les aperçus", async () => {
    const { pagePublique } = await import("@/lib/referencement");
    const m = pagePublique("/conditions", { title: "Conditions", description: "Les conditions." });
    expect(m.robots).toMatchObject({ index: true, follow: true });
    expect(m.alternates?.canonical).toBe("/conditions");
    expect(m.openGraph).toMatchObject({ title: "Conditions", description: "Les conditions.", url: "/conditions" });
    expect(pagePublique("/", { title: "BLUSH", description: "x" }).title).toEqual({ absolute: "BLUSH" });
  });

  it("robots.txt : en ligne, les pages publiques lisibles, l’API et les pages privées écartées, le plan du site cité ; hors de Vercel, rien", async () => {
    const { default: robots } = await import("@/app/robots");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    vi.stubEnv("VERCEL", "1");
    const r = robots();
    const regles = Array.isArray(r.rules) ? r.rules[0]! : r.rules;
    expect(regles.allow).toBe("/");
    expect(regles.disallow).toEqual(expect.arrayContaining(["/api/", "/app", "/rapport", "/compte", "/admin", "/apercu"]));
    /* Les verdicts partagés restent lisibles par les robots des aperçus (leur page dit noindex elle-même) */
    expect(regles.disallow).not.toContain("/v");
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it("le plan du site : les quatre pages publiques, la landing en tête", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const s = sitemap();
    expect(s.map((p) => new URL(p.url).pathname)).toEqual(["/", "/confidentialite", "/conditions", "/mentions-legales"]);
    expect(s[0]!.priority).toBe(1);
  });
});
