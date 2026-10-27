import { inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Le CAPTCHA aux portes sans compte (src/server/captcha.ts), les routes appelées comme le ferait le navigateur : la
 * demande de code (le jeton du widget, un par demande), le laissez-passer des imports (/api/captcha, puis un import et
 * son nouvel essai, ou les lots d’un enregistrement), toujours vérifiés AVANT toute limite comptée. Cloudflare est un
 * faux fetch ; les cookies, la clé secrète et le mode de la lecture partielle sont simulés (`etat`). Chaque import porte
 * la case de l’import cochée (src/server/juridique.ts), vérifiée avant le CAPTCHA.
 */
type Attributs = { expires?: Date; httpOnly?: boolean };
const etat = vi.hoisted(() => ({
  secret: "0x4AAAAAAAsecret-fictif" as string | undefined,
  cookies: new Map<string, string>(),
  attributs: new Map<string, Attributs>(),
  apres: [] as (() => unknown)[],
  mode: "0" as "0" | "mesure" | "ab",
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (etat.cookies.has(n) ? { name: n, value: etat.cookies.get(n)! } : undefined),
    has: (n: string) => etat.cookies.has(n),
    set: (n: string, v: string, a: Attributs = {}) => {
      etat.cookies.set(n, v);
      etat.attributs.set(n, a);
    },
    delete: (n: string | { name: string }) => etat.cookies.delete(typeof n === "string" ? n : n.name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("@/server/env", async (original) => {
  const m = await original<typeof import("@/server/env")>();
  return {
    ...m,
    env: () => ({ ...m.env(), TURNSTILE_SECRET_KEY: etat.secret, NEXT_PUBLIC_TURNSTILE_SITE_KEY: etat.secret && "0x4AAAAAAAcle-publique", BLUSH_LECTURE_PARTIELLE: etat.mode }),
  };
});
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => etat.apres.push(f) }));
vi.mock("@/server/alertes", async (original) => ({ ...(await original<typeof import("@/server/alertes")>()), alerter: async () => {} }));

import { POST as postCode } from "@/app/api/auth/code/route";
import { POST as postCaptcha } from "@/app/api/captcha/route";
import { POST as postCapturesRoute } from "@/app/api/captures/route";
import { POST as postLot } from "@/app/api/captures/lot/route";
import { POST as postVideo } from "@/app/api/captures/video/route";
import { POST as postImport } from "@/app/api/import/route";
import { CASE_IMPORT } from "@/contenu/consentements";
import { ENTETE_CAPTCHA } from "@/lib/captcha";
import { nomDuCookie } from "@/lib/noms-cookies";
import { ouvrirSession } from "@/server/auth";
import { humainRefuse } from "@/server/captcha";
import { empreinte } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { compteDe as compteDeLimite } from "@/server/limites";
import { lotVideo } from "./aide/fabriques";
import { convDeTest } from "./aide/fichiers";
import { compteDeTest } from "./aide/fixtures";

const HUMAIN = nomDuCookie("humain", false);
const SESSION = nomDuCookie("session", false);
const n = Date.now();
let ip = 0;
const adresses: string[] = [];
/** Une adresse IP par requête : les limites de l’une ne gênent pas l’autre. */
const adresse = () => {
  const a = `10.77.${n % 250}.${++ip}`;
  adresses.push(a);
  return a;
};
const requete = (chemin: string, init: RequestInit & { ip?: string }) =>
  new Request(`http://localhost${chemin}`, {
    ...init,
    headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "x-forwarded-for": init.ip ?? adresse(), ...init.headers },
  });
const corpsDe = async (r: Response) => [r.status, await r.json()] as const;

/**
 * Cloudflare répond `succes` (true : le jeton passe, tiré pour `action`), ou rejette (injoignable). Ce qu’il a reçu :
 * `recus`.
 */
const recus: Record<string, unknown>[] = [];
function cloudflare(succes: boolean | Error, action: "code" | "import" = "import") {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    recus.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    if (succes instanceof Error) throw succes;
    return Response.json(succes ? { success: true, action } : { success: false, "error-codes": ["invalid-input-response"] });
  });
}

/* Les histoires créées par les imports de ce fichier (des brouillons sans compte) */
const histoires: string[] = [];
const importer = async (entetes: { ip?: string } = {}) => {
  const fd = new FormData();
  fd.append("fichier", convDeTest("01-a-deux-doigts.txt"));
  fd.append("consentement", CASE_IMPORT.version);
  const r = await postImport(requete("/api/import", { method: "POST", body: fd, ...entetes }));
  if (r.status === 200) histoires.push(((await r.clone().json()) as { story: { id: string } }).story.id);
  return r;
};
const laissezPasser = (jeton: string | null = "jeton-du-widget", ipDeLaRequete?: string) =>
  postCaptcha(requete("/api/captcha", { method: "POST", headers: jeton ? { [ENTETE_CAPTCHA]: jeton } : {}, ...(ipDeLaRequete && { ip: ipDeLaRequete }) }));

beforeEach(() => {
  etat.secret = "0x4AAAAAAAsecret-fictif";
  etat.mode = "0";
  etat.cookies.clear();
  etat.attributs.clear();
  etat.apres.length = 0;
  recus.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  if (histoires.length) await db().delete(schema.stories).where(inArray(schema.stories.id, histoires));
  const cles = adresses.flatMap((a) => [`code:ip:${a}`, `import:ip:${a}`, `captcha:ip:${a}`, `import:ko:ip:${a}`, `lot:ip:${a}`]);
  await db()
    .delete(schema.rateLimits)
    .where(
      inArray(
        schema.rateLimits.key,
        cles.map((c) => empreinte(`limite:${c}`)),
      ),
    );
});

describe("la demande de code : le jeton du widget, avant toute limite", () => {
  it("sans jeton, ou refusé par Cloudflare : 403 « captcha », et la limite de l’adresse n’a rien compté", async () => {
    cloudflare(false);
    for (const entetes of [{}, { [ENTETE_CAPTCHA]: "jeton-faux" }] as Record<string, string>[]) {
      const ici = adresse();
      const r = await postCode(requete("/api/auth/code", { method: "POST", body: JSON.stringify({ email: `captcha-${n}@blush.test` }), headers: entetes, ip: ici }));
      expect(await corpsDe(r)).toEqual([403, { erreur: "captcha" }]);
      expect(await compteDeLimite(`code:ip:${ici}`, { fenetreS: 3600 })).toBe(0);
    }
    /* Sans jeton, Cloudflare n’a pas été appelé ; le faux, une fois */
    expect(recus).toHaveLength(1);
    /* Rien n’est parti après la réponse : ni code, ni mail */
    expect(etat.apres).toHaveLength(0);
  });

  it("un email mal formé est refusé pour ça, sans user le jeton (il resservira)", async () => {
    cloudflare(true);
    const r = await postCode(requete("/api/auth/code", { method: "POST", body: JSON.stringify({ email: "pas-un-email" }), headers: { [ENTETE_CAPTCHA]: "jeton" } }));
    expect(await corpsDe(r)).toEqual([422, { erreur: "email" }]);
    expect(recus).toHaveLength(0);
  });

  it("un bon jeton : le code part (la limite de l’adresse compte alors) ; Cloudflare injoignable : aussi", async () => {
    for (const reponse of [true, new TypeError("fetch failed")]) {
      cloudflare(reponse, "code");
      const ici = adresse();
      const r = await postCode(
        requete("/api/auth/code", { method: "POST", body: JSON.stringify({ email: `captcha-ok-${n}@blush.test` }), headers: { [ENTETE_CAPTCHA]: "jeton" }, ip: ici }),
      );
      expect(r.status).toBe(200);
      expect(await compteDeLimite(`code:ip:${ici}`, { fenetreS: 3600 })).toBe(1);
      vi.restoreAllMocks();
    }
    /* Le travail d’après la réponse (le code, son mail) n’est pas le sujet ici */
    etat.apres.length = 0;
  });

  it("un jeton tiré pour un import ne sert pas à demander un code", async () => {
    cloudflare(true, "import");
    const r = await postCode(requete("/api/auth/code", { method: "POST", body: JSON.stringify({ email: `captcha-ok-${n}@blush.test` }), headers: { [ENTETE_CAPTCHA]: "jeton" } }));
    expect(await corpsDe(r)).toEqual([403, { erreur: "captcha" }]);
  });

  it("sans clé secrète (le dev sans clés, la bêta fermée d’aujourd’hui) : pas de CAPTCHA", async () => {
    etat.secret = undefined;
    const r = await postCode(requete("/api/auth/code", { method: "POST", body: JSON.stringify({ email: `sans-captcha-${n}@blush.test` }) }));
    expect(r.status).toBe(200);
    etat.apres.length = 0;
  });
});

describe("le laissez-passer des imports sans compte", () => {
  it("sans laissez-passer : 403 « captcha », avant la limite de l’adresse et le budget d’octets", async () => {
    const ici = adresse();
    expect(await corpsDe(await importer({ ip: ici }))).toEqual([403, { erreur: "captcha" }]);
    expect(await compteDeLimite(`import:ip:${ici}`, { fenetreS: 3600 })).toBe(0);
    expect(await compteDeLimite(`import:ko:ip:${ici}`, { fenetreS: 86400 })).toBe(0);
  });

  it("/api/captcha : sans jeton ou refusé, 403 et pas de cookie ; un bon jeton, un cookie httpOnly de 20 minutes", async () => {
    cloudflare(false);
    expect(await corpsDe(await laissezPasser(null))).toEqual([403, { erreur: "captcha" }]);
    expect(await corpsDe(await laissezPasser("jeton-faux"))).toEqual([403, { erreur: "captcha" }]);
    expect(etat.cookies.has(HUMAIN)).toBe(false);
    vi.restoreAllMocks();
    cloudflare(true);
    const ici = adresse();
    expect(await corpsDe(await laissezPasser("jeton", ici))).toEqual([200, { ok: true, planDesVideos: false }]);
    expect(recus.at(-1)).toMatchObject({ response: "jeton", remoteip: ici });
    expect(etat.attributs.get(HUMAIN)?.httpOnly).toBe(true);
    const fin = etat.attributs.get(HUMAIN)!.expires!.getTime() - Date.now();
    expect(fin).toBeGreaterThan(19 * 60e3);
    expect(fin).toBeLessThanOrEqual(20 * 60e3);
  });

  it("il vaut pour un import et son nouvel essai, pas un troisième ; les lots d’un enregistrement ont leur propre compte", async () => {
    cloudflare(true);
    await laissezPasser();
    expect((await importer()).status).toBe(200);
    expect((await importer()).status).toBe(200);
    expect(await corpsDe(await importer())).toEqual([403, { erreur: "captcha" }]);
    expect(await humainRefuse("lot")).toBeNull();
    /* Un nouveau laissez-passer (un nouvel import, à l’écran) : de nouveau deux */
    await laissezPasser();
    expect((await importer()).status).toBe(200);
  });

  it("un laissez-passer forgé, abîmé ou expiré ne vaut rien", async () => {
    cloudflare(true);
    await laissezPasser();
    const [id, fin, signature] = etat.cookies.get(HUMAIN)!.split(".");
    const passe = Date.now() - 1000;
    for (const faux of [
      `${id}.${Number(fin) + 60e3}.${signature}`,
      `${id}.${fin}.${signature!.slice(1)}x`,
      `${id}.${passe}.${empreinte(`humain:${id}.${passe}`)}x`,
      "n-importe-quoi",
      "",
    ]) {
      etat.cookies.set(HUMAIN, faux);
      expect((await humainRefuse("brouillon"))?.status, faux).toBe(403);
    }
    /* Bien signé mais expiré : refusé aussi */
    etat.cookies.set(HUMAIN, `${id}.${passe}.${empreinte(`humain:${id}.${passe}`)}`);
    expect((await humainRefuse("brouillon"))?.status).toBe(403);
  });

  it("il dit au navigateur si une longue vidéo demande son plan : seulement dans l’A/B de la lecture partielle (« ab »)", async () => {
    cloudflare(true);
    const plans: unknown[] = [];
    for (const mode of ["0", "mesure", "ab"] as const) {
      etat.mode = mode;
      plans.push((await corpsDe(await laissezPasser("jeton")))[1]);
    }
    expect(plans).toEqual([
      { ok: true, planDesVideos: false },
      { ok: true, planDesVideos: false },
      { ok: true, planDesVideos: true },
    ]);
  });

  it("un compte connecté n’en a pas besoin : ni jeton vérifié, ni cookie posé", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    const u = await compteDeTest("captcha");
    etat.cookies.set(SESSION, (await ouvrirSession(u.id)).secret);
    expect(await corpsDe(await laissezPasser(null))).toEqual([200, { ok: true, planDesVideos: false }]);
    expect(etat.cookies.has(HUMAIN)).toBe(false);
    expect(await humainRefuse("brouillon")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("Cloudflare injoignable : le laissez-passer est donné quand même", async () => {
    cloudflare(new TypeError("fetch failed"));
    expect((await laissezPasser()).status).toBe(200);
    expect(await humainRefuse("brouillon")).toBeNull();
  });
});

describe("les captures et l’enregistrement d’écran sans compte : le laissez-passer, avant toute limite", () => {
  /* Une capture (la signature d’un PNG suffit au serveur), un lot d’images d’un enregistrement, les lots lus rassemblés */
  const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "c.png", { type: "image/png" });
  const formulaire = () => {
    const fd = new FormData();
    fd.append("captures", png());
    fd.append("app", "instagram");
    fd.append("consentement", CASE_IMPORT.version);
    return fd;
  };
  const envoyer = {
    captures: (ip: string) => postCapturesRoute(requete("/api/captures", { method: "POST", body: formulaire(), ip })),
    lot: (ip: string) => postLot(requete("/api/captures/lot", { method: "POST", body: formulaire(), ip })),
    video: (ip: string) =>
      postVideo(
        requete("/api/captures/video", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ app: "imessage", lots: [lotVideo("Léa", 0), lotVideo("Léa", 100)], cle: crypto.randomUUID(), consentement: CASE_IMPORT.version }),
          ip,
        }),
      ),
  };
  /* La limite d’adresse que chaque route compte après le CAPTCHA */
  const limiteDe = { captures: "import", lot: "lot", video: "import" } as const;

  it.each(["captures", "lot", "video"] as const)("%s : sans laissez-passer, 403 « captcha », et la limite de l’adresse n’a rien compté", async (route) => {
    const ici = adresse();
    expect(await corpsDe(await envoyer[route](ici))).toEqual([403, { erreur: "captcha" }]);
    expect(await compteDeLimite(`${limiteDe[route]}:ip:${ici}`, { fenetreS: 3600 })).toBe(0);
  });

  it("avec un laissez-passer : les lots, puis leur rassemblement en une histoire", async () => {
    cloudflare(true);
    await laissezPasser();
    expect((await envoyer.lot(adresse())).status).toBe(200);
    const r = await envoyer.video(adresse());
    expect(r.status).toBe(200);
    histoires.push(((await r.json()) as { story: { id: string } }).story.id);
  });
});
