import { describe, expect, it } from "vitest";
import nextConfig, { FICHIER_APPLE_PAY } from "../../next.config";

/*
 * Le fichier qui fait vérifier askblush.com chez Apple (Apple Pay dans nos pages) : la réécriture de next.config.ts, lue
 * telle que Next la reçoit. Le fichier lui-même vient de Whop : jamais de copie dans le dépôt.
 */
describe("le fichier d’Apple Pay", () => {
  it("servi à l’adresse qu’Apple lit, tel que Whop le publie, avant les pages de l’appli", async () => {
    expect(FICHIER_APPLE_PAY.source).toBe("/.well-known/apple-developer-merchantid-domain-association");
    expect(new URL(FICHIER_APPLE_PAY.destination).origin).toBe("https://whop.com");
    const reecritures = await nextConfig.rewrites!();
    expect(Array.isArray(reecritures) ? reecritures : reecritures.beforeFiles).toContainEqual(FICHIER_APPLE_PAY);
  });
});
