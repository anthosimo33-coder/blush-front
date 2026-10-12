import { describe, expect, it, vi } from "vitest";

/*
 * Le réveil (GET /api/reveil) quand la base ne répond pas : 503 `{ ok: false }` au navigateur, comme avant, et une ligne
 * au journal, qui n’en voyait rien. Sans base : le dépôt est simulé.
 */
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, has: () => false }), headers: async () => new Headers() }));
vi.mock("@/server/depot", async (original) => ({
  ...(await original<typeof import("@/server/depot")>()),
  reveillerLaBase: async () => Promise.reject(Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:5432"), { code: "ECONNREFUSED" })),
}));

import { GET } from "@/app/api/reveil/route";

describe("le réveil, la base injoignable", () => {
  it("répond 503 sans détail, et le journal garde le nom et le code de l’erreur, sans son message", async () => {
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await GET();
    expect([r.status, await r.json()]).toEqual([503, { ok: false }]);
    const lignes = erreurs.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
    expect(lignes).toContainEqual(expect.objectContaining({ evenement: "réveil sans base", niveau: "erreur", code: "ECONNREFUSED" }));
    expect(JSON.stringify(lignes)).not.toContain("10.0.0.1");
  });
});
