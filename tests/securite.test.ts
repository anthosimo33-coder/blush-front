import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Captures, Memoire } from "@prompts/lib/schemas";

/*
 * Les correctifs de l’audit de sécurité du 9 octobre (S-01, S-02, S-03, S-05, S-06, et pour la connexion S-07, S-08,
 * S-09, S-16, S-32). Les routes sont appelées comme le ferait le navigateur : les cookies et les en-têtes de next/headers
 * sont simulés (`etat.cookies` est le navigateur du moment : en changer, c’est passer à un autre), et la bêta fermée se
 * règle par test.
 */
type Attributs = { secure?: boolean; path?: string; domain?: string; httpOnly?: boolean; expires?: Date };
const etat = vi.hoisted(() => ({ fermee: false, cookies: new Map<string, string>(), attributs: new Map<string, Attributs>(), apres: [] as (() => unknown)[] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (etat.cookies.has(n) ? { name: n, value: etat.cookies.get(n)! } : undefined),
    has: (n: string) => etat.cookies.has(n),
    set: (n: string, v: string, a: Attributs = {}) => {
      etat.cookies.set(n, v);
      etat.attributs.set(n, a);
    },
    delete: (n: string | ({ name: string } & Attributs)) => {
      if (typeof n !== "string") etat.attributs.set(n.name, n);
      etat.cookies.delete(typeof n === "string" ? n : n.name);
    },
  }),
  headers: async () => new Headers(),
}));
vi.mock("@/server/env", async (original) => {
  const m = await original<typeof import("@/server/env")>();
  return { ...m, env: () => ({ ...m.env(), BLUSH_BETA_FERMEE: etat.fermee }) };
});
/* after() de Next ne vit que dans une requête : ce qui devait partir après la réponse attend ici, lancé par lancerApres */
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => etat.apres.push(f) }));
/* Les alertes de l’équipe, relevées au lieu de partir */
const alertes = vi.hoisted(() => [] as string[]);
vi.mock("@/server/alertes", async (original) => ({ ...(await original<typeof import("@/server/alertes")>()), alerter: async (sujet: string) => void alertes.push(sujet) }));

import { POST as postCode } from "@/app/api/auth/code/route";
import { POST as postDeconnexion } from "@/app/api/auth/deconnexion/route";
import { POST as postVerifier } from "@/app/api/auth/verifier/route";
import { POST as postCaptures } from "@/app/api/captures/route";
import { POST as postVideo } from "@/app/api/captures/video/route";
import { PUT as putFiche } from "@/app/api/fiche/route";
import { GET as getReveil } from "@/app/api/reveil/route";
import { editionsBornees, type DonneesMemoire } from "@/server/analyse";
import { ouvrirSession } from "@/server/auth";
import { lecturePermise } from "@/server/captures";
import { chiffrer, chiffrerCompresse, dechiffrer, empreinte } from "@/server/chiffrement";
import { effacerSession, poserSession } from "@/server/cookies";
import { emailCanonique } from "@/server/email-canonique";
import { NOMS_DE_SESSION } from "@/lib/noms-cookies";
import { db, schema } from "@/server/db";
import { convDe, depuisFichier, importer, type LigneComplete, type Meta } from "@/server/histoires";
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

  it("un export importé est gardé compressé, et relu tel quel", async () => {
    const f = "01-a-deux-doigts.txt";
    const lu = await depuisFichier(new File([readFileSync(`prompts/evals/convs/${f}`)], f, { type: "text/plain" }));
    const { id } = await importer(lu);
    const [ligne] = await db().select().from(schema.stories).where(eq(schema.stories.id, id));
    expect(ligne.conv![0]).toBe(2);
    expect(ligne.conv!.length).toBeLessThan(Buffer.byteLength(lu.texte) / 2);
    expect(convDe(ligne as LigneComplete)).toBe(lu.texte);
    await db().delete(schema.stories).where(eq(schema.stories.id, id));
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

  it("une mémoire écrite avant la borne : le modèle ne reçoit que les 100 plus récentes", () => {
    const longue = { parToi: ["a"], supprimees: Array.from({ length: 150 }, (_, k) => `ancien ${k}`) };
    expect(editionsBornees(longue)!.supprimees).toEqual(longue.supprimees.slice(50));
    expect(editionsBornees(longue)!.parToi).toEqual(["a"]);
    const courte = { parToi: [], supprimees: ["x"] };
    expect(editionsBornees(courte)).toBe(courte);
    expect(editionsBornees(undefined)).toBeUndefined();
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

/* ———— La connexion (S-07, S-08, S-09, S-16, S-32) ———— */

/** Lance ce que les routes ont laissé pour après la réponse (les mails, la liste d’attente). */
const lancerApres = async () => {
  while (etat.apres.length) await etat.apres.shift()!();
};
/** Un autre navigateur, sans aucun cookie : il devient celui des requêtes suivantes. Renvoie le précédent. */
const autreNavigateur = () => {
  const avant = etat.cookies;
  etat.cookies = new Map();
  return avant;
};
const postJson = (chemin: string, corps: unknown, ip?: string) =>
  requete(chemin, { method: "POST", headers: { "content-type": "application/json", ...(ip ? { "x-forwarded-for": ip } : {}) }, body: JSON.stringify(corps) });

/* Les codes écrits par le serveur : sans Resend ni boîte des tests, ils s’affichent dans les logs (src/server/email.ts) */
const logs: string[] = [];
const codesEcrits = (email: string) => logs.flatMap((l) => l.match(new RegExp(`code de connexion pour ${email.replace(/[.+]/g, "\\$&")} : (\\d{6})$`))?.[1] ?? []);
/** Demande un code pour cet email, dans le navigateur du moment, et attend ce qui part après la réponse. */
async function demander(email: string, ip?: string): Promise<Response> {
  const r = await postCode(postJson("/api/auth/code", { email }, ip));
  await lancerApres();
  return r;
}
const verifier = async (email: string, code: string) => {
  const r = await postVerifier(postJson("/api/auth/verifier", { email, code }));
  return { statut: r.status, corps: await r.json() };
};
/** Le compte d’une limite (src/server/limites.ts), posé à `count` pour la fenêtre en cours. */
const poserLimite = (cle: string, count: number) =>
  db()
    .insert(schema.rateLimits)
    .values({ key: empreinte(`limite:${cle}`), windowStart: new Date(), count })
    .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count, windowStart: new Date() } });
const compteDeLimite = async (cle: string) => (await db().select().from(schema.rateLimits).where(eq(schema.rateLimits.key, empreinte(`limite:${cle}`))))[0]?.count ?? 0;

describe("la connexion : des codes liés au navigateur et bornés", () => {
  /** Un email du test (effacé à la fin, avec son compte et ses codes). */
  const email = (nom: string, domaine = "blush.test") => {
    const e = `${nom}-${n}@${domaine}`;
    emails.push(e);
    return e;
  };
  /* Une adresse IP fixe, propre à ce lancement : d’autres lancements dans l’heure ne la partagent pas */
  const ipFixe = (k: number) => `10.${n % 250}.${(n >> 8) % 250}.${240 + k}`;

  beforeAll(() => {
    vi.spyOn(console, "log").mockImplementation((...l: unknown[]) => void logs.push(l.join(" ")));
  });
  beforeEach(async () => {
    etat.fermee = false;
    autreNavigateur();
    /* Le plafond des mails de code, pour tous : la base des tests le garde d’un lancement à l’autre */
    await db().delete(schema.rateLimits).where(eq(schema.rateLimits.key, empreinte("limite:code:mails")));
  });
  afterAll(async () => {
    vi.mocked(console.log).mockRestore();
    await db().delete(schema.loginCodes).where(inArray(schema.loginCodes.email, emails));
    await db().delete(schema.rateLimits).where(eq(schema.rateLimits.key, empreinte("limite:code:mails")));
  });

  it("S-08 · un code ne vaut que dans le navigateur qui l’a demandé, et la demande d’un autre ne le remplace pas", async () => {
    const e = email("navigateur");
    expect((await demander(e)).status).toBe(200);
    const [codeA] = codesEcrits(e);
    const navigateurA = autreNavigateur();
    expect((await demander(e)).status).toBe(200);
    const [, codeB] = codesEcrits(e);
    expect(codeB).toMatch(/^\d{6}$/);
    /* Le code de A, tapé dans B (le téléphone de quelqu’un d’autre) : rien */
    if (codeA !== codeB) expect(await verifier(e, codeA)).toEqual({ statut: 200, corps: { ok: false } });
    /* Sans aucun cookie de code : rien non plus */
    autreNavigateur();
    expect(await verifier(e, codeB)).toEqual({ statut: 200, corps: { ok: false } });
    /* A garde le sien, et entre */
    etat.cookies = navigateurA;
    expect(await verifier(e, codeA)).toEqual({ statut: 200, corps: { ok: true, email: e } });
    expect(etat.cookies.get(NOMS_DE_SESSION[1])).toBeTruthy();
  });

  it("S-09 · pas plus d’un mail par minute pour un même navigateur, tant que son code marche", async () => {
    const e = email("minute");
    await demander(e);
    await demander(e);
    expect(codesEcrits(e)).toHaveLength(1);
    /* Le même code, toujours bon */
    expect((await verifier(e, codesEcrits(e)[0])).corps).toMatchObject({ ok: true });
  });

  it("S-07 · vingt essais ratés par jour pour un email, alias compris : un nouveau code n’y change rien, un bon code ne compte pas", async () => {
    const e = email("essais", "gmail.com");
    const alias = e.replace("essais", "es.sais").replace("@", "+blush@");
    emails.push(alias);
    const echecs = `code:echecs:${emailCanonique(e)}`;
    expect(emailCanonique(alias)).toBe(emailCanonique(e));

    /* Un bon code rend son essai */
    await poserLimite(echecs, 5);
    await demander(e);
    expect((await verifier(e, codesEcrits(e)[0])).corps).toMatchObject({ ok: true });
    expect(await compteDeLimite(echecs)).toBe(5);

    /* Dix-neuf essais ratés : le vingtième, raté aussi, passe encore ; le suivant, même bon, est refusé */
    autreNavigateur();
    await poserLimite(echecs, 19);
    await demander(alias);
    const [code] = codesEcrits(alias);
    expect(await verifier(alias, String((Number(code) + 1) % 1_000_000).padStart(6, "0"))).toEqual({ statut: 200, corps: { ok: false } });
    expect(await verifier(alias, code)).toEqual({ statut: 429, corps: { erreur: "essais" } });
    /* Un nouveau code, d’un autre navigateur : toujours trop pour aujourd’hui */
    autreNavigateur();
    await demander(e);
    expect(await verifier(e, codesEcrits(e).at(-1)!)).toEqual({ statut: 429, corps: { erreur: "essais" } });
    await db().delete(schema.rateLimits).where(eq(schema.rateLimits.key, empreinte(`limite:${echecs}`)));
  });

  it("S-09 · un email a sept codes par jour d’une même adresse IP, dix de partout, alias compris : puis « codes »", async () => {
    const e = email("codes");
    const canonique = emailCanonique(e);
    await poserLimite(`code:email-ip:${canonique}:${ipFixe(0)}`, 7);
    expect(await (await demander(e, ipFixe(0))).json()).toEqual({ erreur: "codes" });
    /* D’une autre adresse, il en reste : la réserve de l’email */
    expect((await demander(e, ipFixe(1))).status).toBe(200);
    await poserLimite(`code:email:${canonique}`, 10);
    const trop = await demander(e.replace("@", "+autre@"));
    expect([trop.status, await trop.json()]).toEqual([429, { erreur: "codes" }]);
    await db()
      .delete(schema.rateLimits)
      .where(inArray(schema.rateLimits.key, [empreinte(`limite:code:email-ip:${canonique}:${ipFixe(0)}`), empreinte(`limite:code:email:${canonique}`)]));
  });

  it("S-09 · le plafond des mails de code du jour : l’équipe prévenue à 80 %, puis « codes » pour tout le monde", async () => {
    const e = email("plafond");
    alertes.length = 0;
    await poserLimite("code:mails", 63);
    await demander(e);
    expect(codesEcrits(e)).toHaveLength(1);
    expect(alertes).toEqual(["mails de code : 80 % du plafond du jour"]);
    await poserLimite("code:mails", 80);
    const r = await demander(email("plafond-apres"));
    expect([r.status, await r.json()]).toEqual([429, { erreur: "codes" }]);
  });
});

describe("S-16 · la session : glissante, et fermée partout d’un geste", () => {
  let compte = "";
  const sessions = async () => db().select().from(schema.sessions).where(eq(schema.sessions.userId, compte));

  beforeAll(async () => {
    const e = `session-${n}@blush.test`;
    emails.push(e);
    [{ id: compte }] = await db().insert(schema.users).values({ email: e }).returning();
  });

  it("se déconnecter ferme la session de cet appareil ; « partout », toutes celles du compte. La réponse fait oublier le navigateur", async () => {
    const [a, b, c] = [await ouvrirSession(compte), await ouvrirSession(compte), await ouvrirSession(compte)];
    etat.cookies = new Map([[NOMS_DE_SESSION[1], a.secret]]);
    const seul = await postDeconnexion(postJson("/api/auth/deconnexion", {}));
    expect(seul.headers.get("clear-site-data")).toBe('"cache", "storage"');
    expect(etat.cookies.has(NOMS_DE_SESSION[1])).toBe(false);
    expect(await sessions()).toHaveLength(2);

    etat.cookies = new Map([[NOMS_DE_SESSION[1], b.secret]]);
    expect((await postDeconnexion(postJson("/api/auth/deconnexion", { partout: true }))).status).toBe(200);
    expect(await sessions()).toHaveLength(0);
    /* Celle d’un autre appareil aussi */
    expect(await db().select().from(schema.sessions).where(eq(schema.sessions.id, empreinte(c.secret)))).toHaveLength(0);
  });

  it("une visite prolonge la session d’un mois, et son cookie avec elle, une fois par jour au plus ; une session expirée ne revient pas", async () => {
    const { secret } = await ouvrirSession(compte);
    const ici = eq(schema.sessions.id, empreinte(secret));
    await db().update(schema.sessions).set({ expiresAt: new Date(Date.now() + 10 * 86400e3) }).where(ici);
    etat.cookies = new Map([[NOMS_DE_SESSION[1], secret]]);
    etat.attributs.clear();
    expect((await getReveil()).status).toBe(200);
    const [prolongee] = await db().select().from(schema.sessions).where(ici);
    expect(prolongee.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86400e3);
    expect(etat.attributs.get(NOMS_DE_SESSION[1])?.expires?.getTime()).toBe(prolongee.expiresAt.getTime());
    /* Le même jour : rien de plus */
    etat.attributs.clear();
    await getReveil();
    expect(etat.attributs.size).toBe(0);
    /* Expirée : la visite ne la rouvre pas */
    await db().update(schema.sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(ici);
    await getReveil();
    expect((await db().select().from(schema.sessions).where(ici))[0].expiresAt.getTime()).toBeLessThan(Date.now());
    await db().delete(schema.sessions).where(eq(schema.sessions.userId, compte));
  });
});

describe("S-32 · en https, les cookies du serveur portent le préfixe __Host-", () => {
  it("Secure, pour tout le site, sans Domain, à la pose comme à l’effacement ; en http (dev, tests), les noms sans préfixe", async () => {
    etat.cookies = new Map();
    etat.attributs.clear();
    vi.stubEnv("NODE_ENV", "production");
    try {
      await poserSession("un-secret", new Date(Date.now() + 86400e3));
      expect([...etat.cookies.keys()]).toEqual(["__Host-blush-session"]);
      expect(etat.attributs.get("__Host-blush-session")).toMatchObject({ secure: true, path: "/", httpOnly: true });
      expect(etat.attributs.get("__Host-blush-session")).not.toHaveProperty("domain");
      etat.attributs.clear();
      await effacerSession();
      expect(etat.cookies.size).toBe(0);
      expect(etat.attributs.get("__Host-blush-session")).toMatchObject({ secure: true, path: "/" });
    } finally {
      vi.unstubAllEnvs();
    }
    await poserSession("un-secret", new Date(Date.now() + 86400e3));
    expect(etat.cookies.has("blush-session")).toBe(true);
    expect(NOMS_DE_SESSION).toEqual(["__Host-blush-session", "blush-session"]);
  });
});
