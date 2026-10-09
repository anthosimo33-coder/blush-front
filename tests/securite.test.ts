import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Captures, Memoire } from "@prompts/lib/schemas";

/*
 * Les correctifs de l’audit de sécurité du 9 octobre (S-01, S-02, S-03, S-05, S-06). Les routes sont appelées comme
 * le ferait le navigateur : les cookies et les en-têtes de next/headers sont simulés, et la bêta fermée se règle par test.
 */
const etat = vi.hoisted(() => ({ fermee: false, cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (etat.cookies.has(n) ? { name: n, value: etat.cookies.get(n)! } : undefined),
    has: (n: string) => etat.cookies.has(n),
    set: (n: string, v: string) => etat.cookies.set(n, v),
    delete: (n: string) => etat.cookies.delete(n),
  }),
  headers: async () => new Headers(),
}));
vi.mock("@/server/env", async (original) => {
  const m = await original<typeof import("@/server/env")>();
  return { ...m, env: () => ({ ...m.env(), BLUSH_BETA_FERMEE: etat.fermee }) };
});

import { POST as postCaptures } from "@/app/api/captures/route";
import { POST as postVideo } from "@/app/api/captures/video/route";
import { PUT as putFiche } from "@/app/api/fiche/route";
import type { DonneesMemoire } from "@/server/analyse";
import { ouvrirSession } from "@/server/auth";
import { lecturePermise } from "@/server/captures";
import { chiffrer, chiffrerCompresse, dechiffrer, empreinte } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { depuisFichier, importer, type Meta } from "@/server/histoires";
import { definirFactice } from "@/server/ia/claude";
import { fournisseurFactice } from "@/server/ia/factice";
import { suiteSure } from "@/lib/suite";

const n = Date.now();
const emails = [`securite-${n}@blush.test`];
let ip = 0;
/** Une requête du navigateur : même origine, une adresse IP à elle (les limites par IP ne se mélangent pas d’un test à l’autre). */
const requete = (chemin: string, init: RequestInit) =>
  new Request(`http://localhost${chemin}`, {
    ...init,
    headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "x-forwarded-for": `10.${n % 250}.${(n >> 8) % 250}.${++ip}`, ...init.headers },
  });
const cles = ["capturesAnonymesParJour", "lotsAnonymesParJour"].map((c) => empreinte(`limite:${c}`));
const appelsAuModele: unknown[] = [];

let userId = "";
let secretSession = "";

beforeAll(async () => {
  definirFactice((req) => {
    appelsAuModele.push(req);
    return fournisseurFactice(req);
  });
  await db().delete(schema.rateLimits).where(inArray(schema.rateLimits.key, cles));
  const [u] = await db().insert(schema.users).values({ email: emails[0], plan: "blushplus" }).returning();
  userId = u.id;
  secretSession = (await ouvrirSession(u.id)).secret;
});
afterAll(async () => {
  await db().delete(schema.users).where(inArray(schema.users.email, emails));
  await db().delete(schema.rateLimits).where(inArray(schema.rateLimits.key, cles));
  definirFactice(null);
});

describe("S-06 · « suite » après la connexion ne mène jamais hors du site", () => {
  it("garde les adresses de l’appli", () => {
    expect(suiteSure("/rapport")).toBe("/rapport");
    expect(suiteSure("/ouvrir/abc123")).toBe("/ouvrir/abc123");
    expect(suiteSure("/importer/captures?app=hinge&mode=ajout")).toBe("/importer/captures?app=hinge&mode=ajout");
  });
  it("refuse un autre site, même déguisé (tabulation, retour à la ligne, barre oblique inverse, espaces)", () => {
    for (const piege of ["//evil.com", "/.//evil.com", "/..//evil.com", "/%2e//evil.com", "/%2E%2E//evil.com", "/a/..//evil.com", "/./\\evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/\r\n/evil.com", "/\t\\evil.com", "/ /evil.com", "/ /evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "", null, 42])
      expect(suiteSure(piege)).toBeNull();
  });
});

describe("S-02 · la conv brute est compressée avant d’être chiffrée", () => {
  it("relit les deux formats, et un texte répétitif ne prend plus sa pleine taille", () => {
    const texte = "Léa: coucou\n".repeat(800_000);
    const compresse = chiffrerCompresse(texte);
    expect(compresse[0]).toBe(2);
    expect(compresse.length).toBeLessThan(texte.length / 100);
    expect(dechiffrer<string>(compresse)).toBe(texte);
    expect(dechiffrer<{ a: number }>(chiffrer({ a: 1 }))).toEqual({ a: 1 });
    const inconnue = Buffer.from(compresse);
    inconnue[0] = 9;
    expect(() => dechiffrer(inconnue)).toThrow(/Version de chiffrement inconnue/);
  });
});

describe("S-02 · un nom de participant démesuré n’entre pas dans ce qu’on garde", () => {
  it("un export dont un nom fait 150 caractères (ou contient un caractère de contrôle) est refusé", async () => {
    const f = "01-a-deux-doigts.txt";
    const lu = await depuisFichier(new File([readFileSync(`prompts/evals/convs/${f}`)], f, { type: "text/plain" }));
    const { id, meta } = await importer(lu);
    await db().delete(schema.stories).where(eq(schema.stories.id, id));
    const nom = meta.participants[0].nom;
    for (const autre of ["N".repeat(150), "Nom\u0001"]) await expect(importer({ ...lu, texte: lu.texte.split(`${nom}:`).join(`${autre}:`) })).rejects.toMatchObject({ code: "fichier" });
  });
});

/** Un lot d’enregistrement d’écran, tel que /api/captures/lot le renvoie. */
const lot = (autre: string, k0 = 0): Captures => ({
  appli: "instagram",
  autre,
  captures: [{ numero: 1, place: 1, hors_sujet: false }],
  blocs: [
    {
      repere: { date: "2026-09-08", heure: "21:40" },
      messages: Array.from({ length: 15 }, (_, k) => ({ de: k % 2 ? ("moi" as const) : ("autre" as const), texte: `message ${k0 + k}`, media: null, coupe: false, reaction: null })),
    },
  ],
  profil: [],
  doutes: [],
});

describe("S-01 · lire des captures (le modèle payant) avant l’email", () => {
  it("bêta fermée, sans compte : refusé avant tout appel au modèle", async () => {
    etat.fermee = true;
    etat.cookies.clear();
    const fd = new FormData();
    fd.append("captures", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "c.png", { type: "image/png" }));
    const avant = appelsAuModele.length;
    const r = await postCaptures(requete("/api/captures", { method: "POST", body: fd }));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ erreur: "connexion" });
    expect(appelsAuModele.length).toBe(avant);
  });

  it("bêta fermée, avec un compte invité : permis", async () => {
    etat.fermee = true;
    etat.cookies.set("blush-session", secretSession);
    expect(await lecturePermise("captures")).toBe("ok");
  });

  it("bêta ouverte, sans compte : un plafond pour tous et par jour ; un compte connecté n’y est pas soumis", async () => {
    etat.fermee = false;
    etat.cookies.clear();
    await db()
      .insert(schema.rateLimits)
      .values({ key: cles[0], windowStart: new Date(), count: 49 })
      .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count: 49, windowStart: new Date() } });
    expect(await lecturePermise("captures")).toBe("ok");
    expect(await lecturePermise("captures")).toBe("trop");
    etat.cookies.set("blush-session", secretSession);
    expect(await lecturePermise("captures")).toBe("ok");
  });
});

describe("S-03 · un enregistrement d’écran forgé ne gonfle plus en mémoire", () => {
  it("bêta fermée, sans compte : refusé", async () => {
    etat.fermee = true;
    etat.cookies.clear();
    const r = await postVideo(requete("/api/captures/video", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app: "imessage", lots: [lot("Léa")] }) }));
    expect(r.status).toBe(401);
  });

  it("un nom de l’autre démesuré est refusé ; un vrai enregistrement passe", async () => {
    etat.fermee = false;
    etat.cookies.set("blush-session", secretSession);
    const enorme = await postVideo(requete("/api/captures/video", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app: "imessage", lots: [lot("L".repeat(170_000))] }) }));
    expect(enorme.status).toBe(422);
    const trop = { ...lot("Léa"), profil: Array.from({ length: 51 }, () => "x") };
    expect((await postVideo(requete("/api/captures/video", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app: "imessage", lots: [trop] }) }))).status).toBe(422);
    const bon = await postVideo(requete("/api/captures/video", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app: "imessage", lots: [lot("Léa"), lot("Léa", 100)] }) }));
    expect(bon.status).toBe(200);
    const { story } = (await bon.json()) as { story: { id: string } };
    await db().delete(schema.stories).where(eq(schema.stories.id, story.id));
  });
});

describe("S-05 · corriger sa fiche : limité, et la liste des infos retirées ne grossit plus sans fin", () => {
  const memoire: Memoire = {
    alerte: null,
    rien_de_neuf: false,
    memoire: { ou_on_en_est: "Vus deux fois.", moments: [], son_mode: [], ton_mode: [], conseils: [], a_venir: [] },
    fiche: { portrait: "la Taquine", phrase: "p", phrase_courte: "p", faits: [{ section: "infos", texte: "Fait 0", preuves: [], statut: "garde" }] },
    niveau: { niveau: "voit", tendance: null, pourquoi: "vus", preuves: [] },
    questions: ["a", "b", "c", "d"],
  };
  let storyId = "";

  beforeAll(async () => {
    const meta: Meta = {
      appli: "whatsapp",
      format: "whatsapp-ios",
      fichier: "conv.txt",
      participants: [
        { nom: "Hugo", prenom: "Hugo", messages: 10 },
        { nom: "Léa", prenom: "Léa", messages: 10 },
      ],
      resume: { debut: "2026-09-01", fin: "2026-09-30", total: 20, vocaux: 0 },
      moi: 0,
      pronom: "il",
    };
    const [s] = await db().insert(schema.stories).values({ userId, messageCount: 20, meta: chiffrer(meta) }).returning();
    storyId = s.id;
    const donnees: DonneesMemoire = { etat: memoire, lignes: [], suivant: 21, editions: { parToi: [], supprimees: Array.from({ length: 150 }, (_, k) => `ancien ${k}`) } };
    await db().insert(schema.memories).values({ storyId, data: chiffrer(donnees) });
  });

  const corriger = () =>
    putFiche(requete("/api/fiche", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts: [{ section: "infos", text: "Fait 1" }] }) }));

  it("les infos retirées gardent les 100 plus récentes", async () => {
    etat.fermee = false;
    etat.cookies.set("blush-session", secretSession);
    const r = await corriger();
    expect(r.status).toBe(200);
    const [ligne] = await db().select().from(schema.memories).where(eq(schema.memories.storyId, storyId));
    const supprimees = dechiffrer<DonneesMemoire>(ligne.data).editions!.supprimees;
    expect(supprimees).toHaveLength(100);
    expect(supprimees.at(-1)).toBe("Fait 0");
  });

  it("au-delà de la limite du jour : « trop »", async () => {
    await db()
      .insert(schema.rateLimits)
      .values({ key: empreinte(`limite:fiche:${userId}`), windowStart: new Date(), count: 60 })
      .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count: 60, windowStart: new Date() } });
    const r = await corriger();
    expect(r.status).toBe(429);
    await db().delete(schema.rateLimits).where(eq(schema.rateLimits.key, empreinte(`limite:fiche:${userId}`)));
  });
});
