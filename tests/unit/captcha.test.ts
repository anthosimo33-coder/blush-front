import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLES_DE_TEST_TURNSTILE, ENTETE_CAPTCHA, estCleDeTest, JETON_DE_TEST } from "@/lib/captcha";

/*
 * La vérification du CAPTCHA (src/server/captcha.ts) sur un faux fetch : rien ne part chez Cloudflare. Ce que dit
 * siteverify (bon, refusé, une autre action, sa clé secrète refusée), et Cloudflare injoignable (le réseau, le délai, une
 * panne, une réponse illisible) : la requête passe alors, et l’équipe est prévenue (décidé, voir l’en-tête du module).
 * Les clés de test de Cloudflare répondent sans appel, hors de Vercel. Sans base : les alertes sont relevées.
 */
const etat = vi.hoisted(() => ({
  secret: undefined as string | undefined,
  apres: [] as (() => unknown)[],
  alertes: [] as { sujet: string; importante: boolean }[],
}));
vi.mock("@/server/env", async (original) => {
  const m = await original<typeof import("@/server/env")>();
  return { ...m, env: () => ({ ...m.env(), TURNSTILE_SECRET_KEY: etat.secret, NEXT_PUBLIC_TURNSTILE_SITE_KEY: etat.secret && "0x4AAAAAAAcle-publique" }) };
});
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => etat.apres.push(f) }));
vi.mock("@/server/alertes", () => ({
  alerter: async (sujet: string, _lignes: string[], o?: { importante?: boolean }) => void etat.alertes.push({ sujet, importante: !!o?.importante }),
}));

import { DELAI_SITEVERIFY_MS, jetonRefuse, SITEVERIFY, verifierJeton } from "@/server/captcha";

/** Une clé secrète qui n’est pas une clé de test : la vérification appelle (le faux) Cloudflare. */
const SECRET = "0x4AAAAAAAsecret-fictif";
/** Ce que (le faux) Cloudflare a reçu : l’adresse, et le corps JSON. */
const recus: { url: string; corps: Record<string, unknown>; signal: AbortSignal | null | undefined }[] = [];

/** Cloudflare répond ce JSON (statut 200 par défaut), ou rejette. */
function cloudflare(reponse: unknown | Error, statut = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    recus.push({ url: String(url), corps: JSON.parse(String(init?.body)) as Record<string, unknown>, signal: init?.signal });
    if (reponse instanceof Error) throw reponse;
    return typeof reponse === "string" ? new Response(reponse, { status: statut }) : Response.json(reponse, { status: statut });
  });
}

const requete = (entetes: Record<string, string> = {}) => new Request("http://localhost/api/auth/code", { method: "POST", headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1", ...entetes } });

beforeEach(() => {
  etat.secret = SECRET;
  etat.apres.length = 0;
  etat.alertes.length = 0;
  recus.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sans clé secrète : pas de CAPTCHA", () => {
  it("tout passe, sans rien demander à Cloudflare", async () => {
    etat.secret = undefined;
    const f = cloudflare({ success: false });
    expect(await verifierJeton(null, { ip: null, action: "code" })).toBe("ok");
    expect(await jetonRefuse(requete(), "code")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("siteverify répond", () => {
  it("un bon jeton passe : Cloudflare reçoit la clé secrète, le jeton et l’adresse IP de la requête (telle quelle), avec un délai court", async () => {
    cloudflare({ success: true, action: "code", hostname: "www.askblush.com" });
    expect(await jetonRefuse(requete({ [ENTETE_CAPTCHA]: "jeton-du-widget" }), "code")).toBeNull();
    expect(recus).toHaveLength(1);
    expect(recus[0]!.url).toBe(SITEVERIFY);
    expect(recus[0]!.corps).toEqual({ secret: SECRET, response: "jeton-du-widget", remoteip: "203.0.113.7" });
    expect(recus[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(DELAI_SITEVERIFY_MS).toBeLessThanOrEqual(3000);
  });

  it("un jeton refusé : 403 « captcha », et rien de plus", async () => {
    cloudflare({ success: false, "error-codes": ["invalid-input-response"] });
    const r = await jetonRefuse(requete({ [ENTETE_CAPTCHA]: "jeton-faux" }), "code");
    expect([r?.status, await r?.json()]).toEqual([403, { erreur: "captcha" }]);
    expect(etat.apres).toHaveLength(0);
  });

  it("un jeton déjà utilisé, ou tiré pour une autre action (un import, pas une demande de code) : refusé", async () => {
    cloudflare({ success: false, "error-codes": ["timeout-or-duplicate"] });
    expect(await verifierJeton("jeton", { ip: null, action: "code" })).toBe("refuse");
    vi.restoreAllMocks();
    cloudflare({ success: true, action: "import" });
    expect(await verifierJeton("jeton", { ip: null, action: "code" })).toBe("refuse");
    expect(await verifierJeton("jeton", { ip: null, action: "import" })).toBe("ok");
  });

  it("sans jeton, ou un jeton trop long : refusé sans appeler Cloudflare", async () => {
    const f = cloudflare({ success: true });
    expect(await verifierJeton(null, { ip: null, action: "code" })).toBe("refuse");
    expect(await verifierJeton("", { ip: null, action: "code" })).toBe("refuse");
    expect(await verifierJeton("x".repeat(2049), { ip: null, action: "code" })).toBe("refuse");
    const r = await jetonRefuse(requete(), "code");
    expect(r?.status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it("notre clé secrète refusée par Cloudflare : plus rien ne passe, et l’équipe reçoit une alerte importante", async () => {
    cloudflare({ success: false, "error-codes": ["invalid-input-secret"] });
    expect(await verifierJeton("jeton", { ip: null, action: "code" })).toBe("refuse");
    await Promise.all(etat.apres.map((f) => f()));
    expect(etat.alertes).toEqual([{ sujet: "CAPTCHA : clé secrète refusée", importante: true }]);
  });
});

describe("Cloudflare injoignable : la requête passe, et l’équipe est prévenue", () => {
  it.each([
    ["le réseau", new TypeError("fetch failed")],
    ["le délai dépassé", new DOMException("The operation was aborted due to timeout", "TimeoutError")],
  ])("%s", async (_cas, erreur) => {
    cloudflare(erreur);
    expect(await verifierJeton("jeton", { ip: "203.0.113.7", action: "code" })).toBe("injoignable");
    expect(await jetonRefuse(requete({ [ENTETE_CAPTCHA]: "jeton" }), "code")).toBeNull();
    await Promise.all(etat.apres.map((f) => f()));
    expect(etat.alertes).toEqual([{ sujet: "CAPTCHA : Cloudflare injoignable", importante: false }]);
  });

  it("une panne chez Cloudflare (5xx), une réponse illisible ou son erreur interne : injoignable", async () => {
    cloudflare({ success: false }, 503);
    expect(await verifierJeton("jeton", { ip: null, action: "code" })).toBe("injoignable");
    vi.restoreAllMocks();
    cloudflare("<html>pas du JSON</html>");
    expect(await verifierJeton("jeton", { ip: null, action: "code" })).toBe("injoignable");
    vi.restoreAllMocks();
    cloudflare({ success: false, "error-codes": ["internal-error"] });
    expect(await verifierJeton("jeton", { ip: null, action: "code" })).toBe("injoignable");
    vi.restoreAllMocks();
    /* Une requête qu’il refuse (4xx) : la nôtre est fausse, pas une panne */
    cloudflare({ success: false, "error-codes": ["bad-request"] }, 400);
    expect(await verifierJeton("jeton", { ip: null, action: "code" })).toBe("refuse");
  });

  it("le délai court est vraiment posé : un Cloudflare qui ne répond jamais est abandonné", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_ok, rejeter) => {
          init?.signal?.addEventListener("abort", () => rejeter(init.signal!.reason));
        }),
    );
    const debut = Date.now();
    expect(await verifierJeton("jeton", { ip: null, action: "code" })).toBe("injoignable");
    expect(Date.now() - debut).toBeGreaterThanOrEqual(DELAI_SITEVERIFY_MS - 100);
  }, 10_000);
});

describe("les clés de test de Cloudflare", () => {
  const [passe, echoue, dejaVu] = CLES_DE_TEST_TURNSTILE.secretes;

  it("hors de Vercel, le serveur répond lui-même, comme Cloudflare le documente : sans appel", async () => {
    const f = cloudflare({ success: false });
    etat.secret = passe;
    expect(await verifierJeton(JETON_DE_TEST, { ip: null, action: "code" })).toBe("ok");
    /* Même la clé qui passe toujours veut un jeton : le widget doit avoir répondu */
    expect(await verifierJeton(null, { ip: null, action: "code" })).toBe("refuse");
    etat.secret = echoue;
    expect(await verifierJeton(JETON_DE_TEST, { ip: null, action: "code" })).toBe("refuse");
    etat.secret = dejaVu;
    expect(await verifierJeton(JETON_DE_TEST, { ip: null, action: "code" })).toBe("refuse");
    expect(f).not.toHaveBeenCalled();
  });

  it("sur Vercel (une préversion), c’est Cloudflare qui répond pour elles", async () => {
    vi.stubEnv("VERCEL", "1");
    const f = cloudflare({ success: true });
    etat.secret = passe;
    expect(await verifierJeton(JETON_DE_TEST, { ip: null, action: "code" })).toBe("ok");
    expect(f).toHaveBeenCalledOnce();
  });

  it("estCleDeTest les reconnaît toutes, publiques et secrètes, et rien d’autre", () => {
    for (const cle of [...CLES_DE_TEST_TURNSTILE.publiques, ...CLES_DE_TEST_TURNSTILE.secretes]) expect(estCleDeTest(cle)).toBe(true);
    expect(estCleDeTest(SECRET)).toBe(false);
    expect(estCleDeTest("")).toBe(false);
  });
});
