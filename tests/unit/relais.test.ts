import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Le relais de la chaîne des tâches (src/server/relais.ts) et sa route (GET /api/cron/chaine) : la chaîne à court de
 * temps passe la main à une nouvelle fonction, par le secret CRON_SECRET, qui la reprend après sa réponse. Sans base :
 * l’appel est un faux fetch, la chaîne reprise une fonction notée.
 */

const etat = vi.hoisted(() => ({ secret: "secret-fictif-du-relais-du-test" as string | undefined, apres: [] as (() => unknown)[], reprises: [] as [string, unknown][] }));
vi.mock("@/server/env", async (original) => {
  const m = await original<typeof import("@/server/env")>();
  return { ...m, env: () => ({ ...m.env(), CRON_SECRET: etat.secret, BLUSH_URL: "https://blush.test" }) };
});
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => void etat.apres.push(f) }));
vi.mock("@/server/pipeline", () => ({ relancerChaine: async (histoire: string, options: unknown) => void etat.reprises.push([histoire, options]) }));

import { GET } from "@/app/api/cron/chaine/route";
import { passerLaMain, RELAIS_MAX } from "@/server/relais";

const HISTOIRE = "0b7e3f4c-0000-4000-8000-000000000042";

beforeEach(() => {
  etat.secret = "secret-fictif-du-relais-du-test";
  etat.apres.length = 0;
  etat.reprises.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("passer la main (passerLaMain)", () => {
  /** Le faux fetch : chaque appel noté (l’adresse, l’en-tête du secret), et sa réponse. */
  const appels: { url: string; authorization: string | null }[] = [];
  const repondre = (reponse: () => Response) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL, init: RequestInit) => {
        appels.push({ url: String(url), authorization: new Headers(init.headers).get("authorization") });
        return reponse();
      }),
    );
  beforeEach(() => void (appels.length = 0));

  it("appelle la route du relais du site, avec le secret, l’histoire et le rang du relais ; vrai si elle le prend", async () => {
    repondre(() => Response.json({ ok: true }));
    expect(await passerLaMain(HISTOIRE, 1)).toBe(true);
    expect(appels).toEqual([{ url: `https://blush.test/api/cron/chaine?histoire=${HISTOIRE}&relais=1`, authorization: "Bearer secret-fictif-du-relais-du-test" }]);
  });

  it("refusé, ou injoignable : faux, et le journal le dit (sans le secret)", async () => {
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => {});
    repondre(() => Response.json({ erreur: "interdit" }, { status: 401 }));
    expect(await passerLaMain(HISTOIRE, 1)).toBe(false);
    repondre(() => {
      throw new TypeError("fetch failed");
    });
    expect(await passerLaMain(HISTOIRE, 2)).toBe(false);
    const lignes = erreurs.mock.calls.map((c) => String(c[0]));
    expect(lignes.some((l) => l.includes("relais refusé") && l.includes('"statut":401'))).toBe(true);
    expect(lignes.some((l) => l.includes("relais impossible"))).toBe(true);
    expect(lignes.join()).not.toContain("secret-fictif");
  });

  it("sans secret (en local), ou au-delà de RELAIS_MAX d’affilée : rien n’est appelé, faux (une boucle s’arrête là, et le dit)", async () => {
    repondre(() => Response.json({ ok: true }));
    const alertes = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await passerLaMain(HISTOIRE, RELAIS_MAX + 1)).toBe(false);
    expect(alertes.mock.calls.map((c) => String(c[0])).some((l) => l.includes("trop de relais"))).toBe(true);
    etat.secret = undefined;
    expect(await passerLaMain(HISTOIRE, 1)).toBe(false);
    expect(appels).toEqual([]);
  });
});

describe("la route du relais (GET /api/cron/chaine)", () => {
  const appeler = (requete: string, authorization?: string) =>
    GET(new Request(`https://blush.test/api/cron/chaine${requete}`, { headers: authorization ? { authorization } : {} }));

  it("le secret CRON_SECRET seulement : sans lui, ou un autre, 401 « interdit », et rien n’est repris", async () => {
    for (const faux of [undefined, "Bearer secret-fictif-du-relais-du-tes", "secret-fictif-du-relais-du-test", "Bearer "]) {
      const r = await appeler(`?histoire=${HISTOIRE}&relais=1`, faux);
      expect([r.status, await r.json()], String(faux)).toEqual([401, { erreur: "interdit" }]);
    }
    etat.secret = undefined;
    expect((await appeler(`?histoire=${HISTOIRE}&relais=1`, "Bearer ")).status).toBe(401);
    expect(etat.apres).toEqual([]);
  });

  it("une histoire qui n’est pas un identifiant, ou un rang hors de 1 à RELAIS_MAX : 422 « invalide »", async () => {
    for (const requete of ["", "?histoire=x&relais=1", `?histoire=${HISTOIRE}`, `?histoire=${HISTOIRE}&relais=0`, `?histoire=${HISTOIRE}&relais=${RELAIS_MAX + 1}`])
      expect([(await appeler(requete, "Bearer secret-fictif-du-relais-du-test")).status, requete]).toEqual([422, requete]);
    expect(etat.apres).toEqual([]);
  });

  it("le bon secret : { ok: true } tout de suite, puis la chaîne reprise après la réponse, avec le rang du relais", async () => {
    const r = await appeler(`?histoire=${HISTOIRE}&relais=2`, "Bearer secret-fictif-du-relais-du-test");
    expect([r.status, await r.json()]).toEqual([200, { ok: true }]);
    expect(etat.reprises).toEqual([]);
    for (const f of etat.apres) await f();
    expect(etat.reprises).toEqual([[HISTOIRE, { relais: 2 }]]);
  });
});
