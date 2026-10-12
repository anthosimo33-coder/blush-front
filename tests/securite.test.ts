import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Les correctifs de l’audit de sécurité du 9 octobre (S-01, S-02, S-03, S-05, S-06, pour la connexion S-07, S-08, S-09,
 * S-16, S-32, et pour les limites et le compte S-04, S-10, S-28, S-29). Les routes sont appelées comme le ferait le navigateur : les cookies et les en-têtes de next/headers
 * sont simulés (`etat.cookies` est le navigateur du moment : en changer, c’est passer à un autre), et la bêta fermée se
 * règle par test.
 */
type Attributs = { secure?: boolean; path?: string; domain?: string; httpOnly?: boolean; expires?: Date };
const etat = vi.hoisted(() => ({
  fermee: false,
  cookies: new Map<string, string>(),
  attributs: new Map<string, Attributs>(),
  apres: [] as (() => unknown)[],
  /* Une panne simulée pendant la demande d’un code : la base (preparerCode), ou Resend qui refuse le mail */
  panne: null as "base" | "resend" | null,
  /* Les emails retirés de la bêta depuis l’ouverture de leur session (peutEntrer les refuse) */
  retires: new Set<string>(),
}));
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
  return { ...m, env: () => ({ ...m.env(), BLUSH_BETA_FERMEE: etat.fermee }), peutEntrer: (email: string) => !etat.retires.has(email) && m.peutEntrer(email) };
});
/* after() de Next ne vit que dans une requête : ce qui devait partir après la réponse attend ici, lancé par lancerApres */
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => etat.apres.push(f) }));
/* Les alertes de l’équipe, relevées au lieu de partir */
const alertes = vi.hoisted(() => [] as { sujet: string; lignes: string[]; importante?: true }[]);
vi.mock("@/server/alertes", async (original) => ({
  ...(await original<typeof import("@/server/alertes")>()),
  alerter: async (sujet: string, lignes: string[], o?: { importante?: boolean }) => void alertes.push({ sujet, lignes, ...(o?.importante && { importante: true as const }) }),
}));
vi.mock("@/server/auth", async (original) => {
  const m = await original<typeof import("@/server/auth")>();
  return { ...m, preparerCode: (...a: Parameters<typeof m.preparerCode>) => (etat.panne === "base" ? Promise.reject(new Error("la base ne répond pas")) : m.preparerCode(...a)) };
});
vi.mock("@/server/email", async (original) => {
  const m = await original<typeof import("@/server/email")>();
  return {
    ...m,
    envoyerCodeParEmail: (...a: Parameters<typeof m.envoyerCodeParEmail>) => (etat.panne === "resend" ? Promise.reject(new m.ErreurResend(500)) : m.envoyerCodeParEmail(...a)),
  };
});

import { POST as postAnalyse } from "@/app/api/analyse/route";
import { POST as postCode } from "@/app/api/auth/code/route";
import { POST as postDeconnexion } from "@/app/api/auth/deconnexion/route";
import { POST as postVerifier } from "@/app/api/auth/verifier/route";
import { DELETE as deleteCompte, GET as getCompte } from "@/app/api/compte/route";
import CompteLayout from "@/app/compte/layout";
import Connecte from "@/app/connexion/connecte/page";
import Effacer from "@/app/effacer/page";
import { POST as postCaptures } from "@/app/api/captures/route";
import { POST as postVideo } from "@/app/api/captures/video/route";
import { PUT as putFiche } from "@/app/api/fiche/route";
import { POST as postImport } from "@/app/api/import/route";
import { GET as getReveil } from "@/app/api/reveil/route";
import { editionsBornees, type DonneesMemoire } from "@/server/stockage/types";
import { empreinteDeLaListe, inscrire } from "@/server/attente";
import { envoyerCode, ouvrirSession, preparerCode } from "@/server/auth";
import { lecturePermise } from "@/server/captures";
import { chiffrer, chiffrerCompresse, dechiffrer, empreinte } from "@/server/chiffrement";
import { effacerSession, poserChoisie, poserSession } from "@/server/cookies";
import { cleDeLimiteDuCompte, emailCanonique } from "@/server/email-canonique";
import { nomDuCookie, NOMS_DE_SESSION } from "@/lib/noms-cookies";
import { db, schema } from "@/server/db";
import { convDe, importer, type Meta } from "@/server/histoires";
import { depuisFichier } from "@/server/import";
import { LIMITES } from "@/server/limites";
import { fournisseurFactice } from "@/server/ia/factice";
import { etatDesTaches } from "@/server/taches";
import { suiteSure } from "@/lib/suite";
import { lotVideo, memoire } from "./aide/fabriques";
import { convDeTest } from "./aide/fichiers";
import { compteDeTest, convRattachee, facticePourChaqueTest } from "./aide/fixtures";

/* Le cookie de session des tests, servis en http : sans le préfixe __Host- (src/lib/noms-cookies.ts) */
const SESSION = nomDuCookie("session", false);
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
/* Les appels au modèle (factice) pendant les tests : une route refusée n’en fait aucun */
const appelsAuModele: unknown[] = [];
facticePourChaqueTest((req) => (appelsAuModele.push(req), fournisseurFactice(req)));

let userId = "";
let secretSession = "";

beforeAll(async () => {
  await db().delete(schema.rateLimits).where(inArray(schema.rateLimits.key, cles));
  const u = (await db().insert(schema.users).values({ email: emails[0]! }).returning())[0]!;
  userId = u.id;
  secretSession = (await ouvrirSession(u.id)).secret;
});
afterAll(async () => {
  await db().delete(schema.users).where(inArray(schema.users.email, emails));
  await db().delete(schema.rateLimits).where(inArray(schema.rateLimits.key, cles));
});

describe("S-06 · « suite » après la connexion ne mène jamais hors du site", () => {
  it("garde les adresses de l’appli", () => {
    expect(suiteSure("/rapport")).toBe("/rapport");
    expect(suiteSure("/ouvrir/abc123")).toBe("/ouvrir/abc123");
    expect(suiteSure("/importer/captures?app=hinge&mode=ajout")).toBe("/importer/captures?app=hinge&mode=ajout");
  });
  it("refuse un autre site, même déguisé (tabulation, retour à la ligne, barre oblique inverse, espaces)", () => {
    for (const piege of [
      "//evil.com",
      "/.//evil.com",
      "/..//evil.com",
      "/%2e//evil.com",
      "/%2E%2E//evil.com",
      "/a/..//evil.com",
      "/./\\evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r\n/evil.com",
      "/\t\\evil.com",
      "/ /evil.com",
      "/ /evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "evil.com",
      "",
      null,
      42,
    ])
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
    const lu = await depuisFichier(convDeTest("01-a-deux-doigts.txt"));
    const { id } = await importer(lu);
    const ligne = (await db().select().from(schema.stories).where(eq(schema.stories.id, id)))[0]!;
    expect(ligne.conv![0]).toBe(2);
    expect(ligne.conv!.length).toBeLessThan(Buffer.byteLength(lu.texte) / 2);
    expect(convDe(ligne)).toBe(lu.texte);
    await db().delete(schema.stories).where(eq(schema.stories.id, id));
  });
});

describe("S-02 · un nom de participant démesuré n’entre pas dans ce qu’on garde", () => {
  it("un export dont un nom fait 150 caractères (ou contient un caractère de contrôle) est refusé", async () => {
    const lu = await depuisFichier(convDeTest("01-a-deux-doigts.txt"));
    const { id, meta } = await importer(lu);
    await db().delete(schema.stories).where(eq(schema.stories.id, id));
    const nom = meta.participants[0]!.nom;
    for (const autre of ["N".repeat(150), "Nom\u0001"])
      await expect(importer({ ...lu, texte: lu.texte.split(`${nom}:`).join(`${autre}:`) })).rejects.toMatchObject({ code: "fichier" });
  });
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
    etat.cookies.set(SESSION, secretSession);
    expect(await lecturePermise("captures")).toBe("ok");
  });

  it("bêta ouverte, sans compte : un plafond pour tous et par jour ; un compte connecté n’y est pas soumis", async () => {
    etat.fermee = false;
    etat.cookies.clear();
    await db()
      .insert(schema.rateLimits)
      .values({ key: cles[0]!, windowStart: new Date(), count: 49 })
      .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count: 49, windowStart: new Date() } });
    expect(await lecturePermise("captures")).toBe("ok");
    expect(await lecturePermise("captures")).toBe("trop");
    etat.cookies.set(SESSION, secretSession);
    expect(await lecturePermise("captures")).toBe("ok");
  });
});

describe("S-03 · un enregistrement d’écran forgé ne gonfle plus en mémoire", () => {
  it("bêta fermée, sans compte : refusé", async () => {
    etat.fermee = true;
    etat.cookies.clear();
    const r = await postVideo(
      requete("/api/captures/video", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app: "imessage", lots: [lotVideo("Léa")] }) }),
    );
    expect(r.status).toBe(401);
  });

  it("un nom de l’autre démesuré est refusé ; un vrai enregistrement passe", async () => {
    etat.fermee = false;
    etat.cookies.set(SESSION, secretSession);
    const enorme = await postVideo(
      requete("/api/captures/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app: "imessage", lots: [lotVideo("L".repeat(170_000))] }),
      }),
    );
    expect(enorme.status).toBe(422);
    const trop = { ...lotVideo("Léa"), profil: Array.from({ length: 51 }, () => "x") };
    expect(
      (
        await postVideo(
          requete("/api/captures/video", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app: "imessage", lots: [trop] }) }),
        )
      ).status,
    ).toBe(422);
    const bon = await postVideo(
      requete("/api/captures/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app: "imessage", lots: [lotVideo("Léa"), lotVideo("Léa", 100)] }),
      }),
    );
    expect(bon.status).toBe(200);
    const { story } = (await bon.json()) as { story: { id: string } };
    await db().delete(schema.stories).where(eq(schema.stories.id, story.id));
  });
});

describe("S-12 · un enregistrement d’écran : des lots de 300 messages au plus", () => {
  /* Un lot d’un seul bloc de `n` messages, alternés */
  const lot = (n: number) => {
    const l = lotVideo("Léa");
    const [autre, moi] = l.blocs[0]!.messages;
    return { ...l, blocs: [{ ...l.blocs[0], messages: Array.from({ length: n }, (_, k) => ({ ...(k % 2 ? moi : autre), texte: `message ${k}` })) }] };
  };
  const envoyer = (n: number) =>
    postVideo(requete("/api/captures/video", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app: "imessage", lots: [lot(n)] }) }));

  it("301 messages dans un lot : refusé ; 300 : la conv est lue", async () => {
    etat.fermee = false;
    etat.cookies.set(SESSION, secretSession);
    expect((await envoyer(301)).status).toBe(422);
    const bon = await envoyer(300);
    expect(bon.status).toBe(200);
    const { story } = (await bon.json()) as { story: { id: string } };
    await db().delete(schema.stories).where(eq(schema.stories.id, story.id));
  });
});

describe("S-05 · corriger sa fiche : limité, et la liste des infos retirées ne grossit plus sans fin", () => {
  /* Une mémoire dont la fiche a une info, celle que la correction retire */
  const etatMemoire = memoire({
    fiche: { faits: [{ section: "infos", texte: "Fait 0", preuves: [], statut: "garde" }] },
    niveau: { niveau: "voit", tendance: null, pourquoi: "vus", preuves: [] },
    questions: ["a", "b", "c", "d"],
  });
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
    const s = (
      await db()
        .insert(schema.stories)
        .values({ userId, messageCount: 20, meta: chiffrer(meta) })
        .returning()
    )[0]!;
    storyId = s.id;
    const donnees: DonneesMemoire = { etat: etatMemoire, lignes: [], suivant: 21, editions: { parToi: [], supprimees: Array.from({ length: 150 }, (_, k) => `ancien ${k}`) } };
    await db()
      .insert(schema.memories)
      .values({ storyId, data: chiffrer(donnees) });
  });

  /* Chaque test corrige la fiche depuis le navigateur du compte, bêta ouverte : il ne compte pas sur celui d’un autre */
  beforeEach(() => {
    etat.fermee = false;
    etat.cookies.set(SESSION, secretSession);
  });
  const corriger = () =>
    putFiche(requete("/api/fiche", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts: [{ section: "infos", text: "Fait 1" }] }) }));

  it("les infos retirées gardent les 100 plus récentes", async () => {
    const r = await corriger();
    expect(r.status).toBe(200);
    const ligne = (await db().select().from(schema.memories).where(eq(schema.memories.storyId, storyId)))[0]!;
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
    const cle = empreinte(`limite:${cleDeLimiteDuCompte("fiche", emails[0]!)}`);
    await db()
      .insert(schema.rateLimits)
      .values({ key: cle, windowStart: new Date(), count: 60 })
      .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count: 60, windowStart: new Date() } });
    /* Le plafond est retiré même si le test échoue : les autres corrigent la fiche du même compte */
    try {
      expect((await corriger()).status).toBe(429);
    } finally {
      await db().delete(schema.rateLimits).where(eq(schema.rateLimits.key, cle));
    }
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
const verifier = async (email: string, code: string, ip?: string) => {
  const r = await postVerifier(postJson("/api/auth/verifier", { email, code }, ip));
  return { statut: r.status, corps: await r.json() };
};
/** Un code de six chiffres qui n’est pas celui-là. */
const autreCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");
/** Le compte d’une limite (src/server/limites.ts), posé à `count` pour la fenêtre en cours. */
const poserLimite = (cle: string, count: number) =>
  db()
    .insert(schema.rateLimits)
    .values({ key: empreinte(`limite:${cle}`), windowStart: new Date(), count })
    .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count, windowStart: new Date() } });
const compteDeLimite = async (cle: string) =>
  (
    await db()
      .select()
      .from(schema.rateLimits)
      .where(eq(schema.rateLimits.key, empreinte(`limite:${cle}`)))
  )[0]?.count ?? 0;
/** Le jeton du navigateur du moment (son cookie de code, src/server/cookies.ts) : la clé de ses essais ratés. */
const jetonDuNavigateur = () => etat.cookies.get(nomDuCookie("code", false))!;

describe("la connexion : des codes liés au navigateur et bornés", () => {
  /** Un email du test (effacé à la fin, avec son compte et ses codes). */
  const email = (nom: string, domaine = "blush.test") => {
    const e = `${nom}-${n}@${domaine}`;
    emails.push(e);
    return e;
  };
  /* Une adresse IP fixe, propre à ce lancement : d’autres lancements dans l’heure ne la partagent pas */
  const ipFixe = (k: number) => `10.${n % 250}.${(n >> 8) % 250}.${240 + k}`;

  beforeEach(async () => {
    /* Les codes écrits dans les logs, relevés ; l’espion est rendu avant chaque test (restoreMocks, vitest.config.mts) */
    vi.spyOn(console, "log").mockImplementation((...l: unknown[]) => void logs.push(l.join(" ")));
    etat.fermee = false;
    autreNavigateur();
    /* Le plafond des mails de code, pour tous : la base des tests le garde d’un lancement à l’autre */
    await db()
      .delete(schema.rateLimits)
      .where(eq(schema.rateLimits.key, empreinte("limite:code:mails")));
  });
  afterAll(async () => {
    await db().delete(schema.loginCodes).where(inArray(schema.loginCodes.email, emails));
    await db()
      .delete(schema.rateLimits)
      .where(eq(schema.rateLimits.key, empreinte("limite:code:mails")));
  });

  it("S-08 · un code ne vaut que dans le navigateur qui l’a demandé, et la demande d’un autre ne le remplace pas", async () => {
    const e = email("navigateur");
    expect((await demander(e)).status).toBe(200);
    const codeA = codesEcrits(e)[0]!;
    const navigateurA = autreNavigateur();
    expect((await demander(e)).status).toBe(200);
    const [, codeB] = codesEcrits(e);
    expect(codeB).toMatch(/^\d{6}$/);
    /* Le code de A, tapé dans B (le téléphone de quelqu’un d’autre) : rien */
    if (codeA !== codeB) expect(await verifier(e, codeA)).toEqual({ statut: 200, corps: { ok: false } });
    /* Sans aucun cookie de code : rien non plus */
    autreNavigateur();
    expect(await verifier(e, codeB!)).toEqual({ statut: 200, corps: { ok: false } });
    /* A garde le sien, et entre */
    etat.cookies = navigateurA;
    expect(await verifier(e, codeA)).toEqual({ statut: 200, corps: { ok: true, email: e } });
    expect(etat.cookies.get(SESSION)).toBeTruthy();
  });

  it("S-09 · pas plus d’un mail par minute pour un même navigateur, tant que son code marche", async () => {
    const e = email("minute");
    await demander(e);
    await demander(e);
    expect(codesEcrits(e)).toHaveLength(1);
    /* Le même code, toujours bon */
    expect((await verifier(e, codesEcrits(e)[0]!)).corps).toMatchObject({ ok: true });
  });

  it("S-07 · soixante essais ratés par jour pour un email, alias compris : un nouveau code n’y change rien (il n’est plus envoyé), un bon code ne compte pas", async () => {
    const e = email("essais", "gmail.com");
    const alias = e.replace("essais", "es.sais").replace("@", "+blush@");
    emails.push(alias);
    const echecs = `code:echecs:${emailCanonique(e)}`;
    expect(emailCanonique(alias)).toBe(emailCanonique(e));

    /* Un bon code rend son essai */
    await poserLimite(echecs, 5);
    await demander(e);
    expect((await verifier(e, codesEcrits(e)[0]!)).corps).toMatchObject({ ok: true });
    expect(await compteDeLimite(echecs)).toBe(5);

    /* Tous les essais ratés du jour moins un : le dernier, raté aussi, passe encore ; le suivant, même bon, est refusé */
    autreNavigateur();
    await poserLimite(echecs, LIMITES.echecsCodeParEmail.max - 1);
    await demander(alias);
    const code = codesEcrits(alias)[0]!;
    expect(await verifier(alias, autreCode(code))).toEqual({ statut: 200, corps: { ok: false } });
    expect(await verifier(alias, code)).toEqual({ statut: 429, corps: { erreur: "essais" } });
    /* Un nouveau code, d’un autre navigateur : refusé d’emblée, sans mail (il n’y pourrait rien), pour l’alias aussi */
    autreNavigateur();
    const ecrits = codesEcrits(e).length;
    const refus = await demander(e);
    expect([refus.status, await refus.json()]).toEqual([429, { erreur: "essais" }]);
    expect(codesEcrits(e)).toHaveLength(ecrits);
    expect(await (await demander(alias)).json()).toEqual({ erreur: "essais" });
    await db()
      .delete(schema.rateLimits)
      .where(eq(schema.rateLimits.key, empreinte(`limite:${echecs}`)));
  });

  /** Rate les cinq essais du dernier code de cet email, dans le navigateur du moment, depuis `ip`. */
  const raterLeCode = async (e: string, ip: string) => {
    const code = codesEcrits(e).at(-1)!;
    for (let k = 0; k < 5; k++) expect(await verifier(e, autreCode(code), ip)).toEqual({ statut: 200, corps: { ok: false } });
  };

  it("S-08 · les essais ratés d’un tiers n’épuisent que son navigateur : la personne, ailleurs, entre", async () => {
    const e = email("tiers");
    /* Le tiers rate deux codes entiers (dix essais) : son navigateur n’en a plus pour cet email aujourd’hui */
    for (let k = 0; k < 2; k++) {
      expect((await demander(e, ipFixe(2))).status).toBe(200);
      await raterLeCode(e, ipFixe(2));
    }
    expect(LIMITES.echecsCodeParNavigateur.max).toBe(10);
    const ecrits = codesEcrits(e).length;
    const refus = await demander(e, ipFixe(2));
    expect([refus.status, await refus.json()]).toEqual([429, { erreur: "essais" }]);
    expect(codesEcrits(e)).toHaveLength(ecrits);
    /* Le même navigateur, d’une autre adresse : toujours rien (ses essais ne dépendent pas de l’adresse) */
    expect(await (await demander(e, ipFixe(5))).json()).toEqual({ erreur: "essais" });
    expect(codesEcrits(e)).toHaveLength(ecrits);
    /* La personne, de chez elle : un code, et elle entre ; son bon code rend son essai à l’email, à son adresse et à son navigateur */
    autreNavigateur();
    expect((await demander(e, ipFixe(3))).status).toBe(200);
    const canonique = emailCanonique(e);
    const cles = [`code:echecs:${canonique}`, `code:echecs-ip:${canonique}:${ipFixe(3)}`, `code:echecs-nav:${canonique}:${jetonDuNavigateur()}`];
    expect(await verifier(e, autreCode(codesEcrits(e).at(-1)!), ipFixe(3))).toEqual({ statut: 200, corps: { ok: false } });
    const avant = await Promise.all(cles.map(compteDeLimite));
    expect(avant).toEqual([11, 1, 1]);
    expect(await verifier(e, codesEcrits(e).at(-1)!, ipFixe(3))).toEqual({ statut: 200, corps: { ok: true, email: e } });
    expect(await Promise.all(cles.map(compteDeLimite))).toEqual(avant);
  });

  it("S-08 · une adresse IP qui a raté tous ses essais pour un email : un navigateur qui y arrive garde sa réserve, puis plus rien", async () => {
    const e = email("wifi");
    const { max, reserveNavigateur } = LIMITES.echecsCodeParEmailEtIp;
    await poserLimite(`code:echecs-ip:${emailCanonique(e)}:${ipFixe(4)}`, max);
    /* Sur le même Wi-Fi que le tiers : un code entier d’essais (sa réserve), ratés ici */
    expect((await demander(e, ipFixe(4))).status).toBe(200);
    expect(reserveNavigateur).toBe(5);
    await raterLeCode(e, ipFixe(4));
    /* Sa réserve épuisée, ce navigateur n’a plus d’essai depuis cette adresse… */
    expect(await (await demander(e, ipFixe(4))).json()).toEqual({ erreur: "essais" });
    /* …mais un autre navigateur, sur le même Wi-Fi, a la sienne : le bon code ouvre la session */
    autreNavigateur();
    expect((await demander(e, ipFixe(4))).status).toBe(200);
    expect(await verifier(e, codesEcrits(e).at(-1)!, ipFixe(4))).toEqual({ statut: 200, corps: { ok: true, email: e } });
    /* D’une autre adresse, l’adresse pleine n’y est pour rien : un navigateur y rate plus que la réserve, et essaie encore */
    autreNavigateur();
    expect((await demander(e, ipFixe(6))).status).toBe(200);
    await raterLeCode(e, ipFixe(6));
    expect((await demander(e, ipFixe(6))).status).toBe(200);
    expect(await verifier(e, autreCode(codesEcrits(e).at(-1)!), ipFixe(6))).toEqual({ statut: 200, corps: { ok: false } });
    expect(await verifier(e, codesEcrits(e).at(-1)!, ipFixe(6))).toEqual({ statut: 200, corps: { ok: true, email: e } });
  });

  it("S-08 · sur le même Wi-Fi qu’un tiers qui a raté quatre codes puis en a redemandé trois, la personne a encore un code, ici et ailleurs", async () => {
    const e = email("wifi-reel");
    /* Le tiers : deux navigateurs, deux codes ratés chacun (vingt essais : l’adresse est pleine) */
    for (let k = 0; k < 4; k++) {
      if (k % 2 === 0) autreNavigateur();
      expect((await demander(e, ipFixe(7))).status).toBe(200);
      await raterLeCode(e, ipFixe(7));
    }
    expect(await compteDeLimite(`code:echecs-ip:${emailCanonique(e)}:${ipFixe(7)}`)).toBe(LIMITES.echecsCodeParEmailEtIp.max);
    /* Puis trois demandes de plus, d’un navigateur neuf : les sept codes de l’adresse sont pris, et les sept de l’email */
    autreNavigateur();
    for (let k = 0; k < 3; k++) expect((await demander(e, ipFixe(7))).status).toBe(200);
    expect(await compteDeLimite(`code:email:${emailCanonique(e)}`)).toBe(LIMITES.codeParEmail.max);
    /* La personne, sur ce Wi-Fi, dans son navigateur : le code de la réserve de l’adresse, et elle entre */
    autreNavigateur();
    expect((await demander(e, ipFixe(7))).status).toBe(200);
    expect(await verifier(e, codesEcrits(e).at(-1)!, ipFixe(7))).toEqual({ statut: 200, corps: { ok: true, email: e } });
    /* Et de chez elle, ailleurs : celui de la réserve de cette adresse */
    autreNavigateur();
    expect((await demander(e, ipFixe(8))).status).toBe(200);
    expect(await verifier(e, codesEcrits(e).at(-1)!, ipFixe(8))).toEqual({ statut: 200, corps: { ok: true, email: e } });
  });

  it("S-08 · un tiers qui demande tous les codes d’un email de deux adresses ne prive pas la personne du sien ; la réserve s’épuise adresse par adresse", async () => {
    const e = email("reserve");
    const canonique = emailCanonique(e);
    /* Sept demandes d’une adresse, trois d’une autre, sans un seul essai : l’email n’a plus de code ordinaire */
    for (let k = 0; k < 7; k++) expect((await demander(e, ipFixe(9))).status).toBe(200);
    autreNavigateur();
    /* La première de l’autre adresse prend sa réserve ; les deux suivantes n’ont plus rien */
    expect((await demander(e, ipFixe(10))).status).toBe(200);
    for (let k = 0; k < 2; k++) expect(await (await demander(e, ipFixe(10))).json()).toEqual({ erreur: "codes" });
    expect(await compteDeLimite(`code:reserve:${canonique}`)).toBe(1);
    /* La personne, d’une troisième adresse : un code, et elle entre */
    autreNavigateur();
    expect((await demander(e, ipFixe(11))).status).toBe(200);
    expect(await verifier(e, codesEcrits(e).at(-1)!, ipFixe(11))).toEqual({ statut: 200, corps: { ok: true, email: e } });
    /* La réserve de l’email épuisée (cinq adresses), plus personne n’a de code aujourd’hui : la borne que lève le CAPTCHA prévu */
    await poserLimite(`code:reserve:${canonique}`, LIMITES.codeReserveParEmail.max);
    autreNavigateur();
    const trop = await demander(e, ipFixe(12));
    expect([trop.status, await trop.json()]).toEqual([429, { erreur: "codes" }]);
    await db()
      .delete(schema.rateLimits)
      .where(inArray(schema.rateLimits.key, [empreinte(`limite:code:reserve:${canonique}`)]));
  });

  it("S-09 · un email a sept codes par jour d’une même adresse IP ou de partout, alias compris, puis un de réserve par adresse, cinq en tout : puis « codes »", async () => {
    const e = email("codes");
    const canonique = emailCanonique(e);
    expect([LIMITES.codeParEmailEtIp.max, LIMITES.codeParEmail.max, LIMITES.codeReserveParEmailEtIp.max, LIMITES.codeReserveParEmail.max]).toEqual([7, 7, 1, 5]);
    await poserLimite(`code:email-ip:${canonique}:${ipFixe(0)}`, 7);
    /* Les sept de l’adresse pris : la réserve de l’adresse, une fois, puis « codes » */
    expect((await demander(e, ipFixe(0))).status).toBe(200);
    autreNavigateur();
    expect(await (await demander(e, ipFixe(0))).json()).toEqual({ erreur: "codes" });
    /* D’une autre adresse, il en reste : les codes ordinaires de l’email */
    expect((await demander(e, ipFixe(1))).status).toBe(200);
    expect(await compteDeLimite(`code:reserve:${canonique}`)).toBe(1);
    /* Les sept de l’email pris (un alias compte avec lui) : la réserve de cette adresse, puis « codes » */
    await poserLimite(`code:email:${canonique}`, 7);
    autreNavigateur();
    expect((await demander(e.replace("@", "+autre@"), ipFixe(1))).status).toBe(200);
    const trop = await demander(e.replace("@", "+autre@"), ipFixe(1));
    expect([trop.status, await trop.json()]).toEqual([429, { erreur: "codes" }]);
    await db()
      .delete(schema.rateLimits)
      .where(
        inArray(
          schema.rateLimits.key,
          [`code:email-ip:${canonique}:${ipFixe(0)}`, `code:email:${canonique}`, `code:reserve:${canonique}`].map((cle) => empreinte(`limite:${cle}`)),
        ),
      );
  });

  it("S-09 · le plafond des mails de code du jour : l’équipe prévenue à 80 %, puis « codes » pour tout le monde", async () => {
    const e = email("plafond");
    alertes.length = 0;
    await poserLimite("code:mails", Math.ceil(LIMITES.mailsCodeParJour.max * LIMITES.mailsCodeParJour.alerteA) - 1);
    await demander(e);
    expect(codesEcrits(e)).toHaveLength(1);
    expect(alertes.map((a) => a.sujet)).toEqual(["mails de code : 80 % du plafond du jour"]);
    /* Elle touche tout le monde : elle passe dans la réserve des importantes (S-19) */
    expect(alertes[0]!.importante).toBe(true);
    await poserLimite("code:mails", LIMITES.mailsCodeParJour.max);
    const r = await demander(email("plafond-apres"));
    expect([r.status, await r.json()]).toEqual([429, { erreur: "codes" }]);
  });

  it("S-09 · le dernier mail du plafond part, et l’équipe le sait ; passé le plafond entre la question et l’envoi, aucun mail", async () => {
    const e = email("plafond-atteint");
    alertes.length = 0;
    await poserLimite("code:mails", LIMITES.mailsCodeParJour.max - 1);
    await demander(e);
    expect(codesEcrits(e)).toHaveLength(1);
    expect(alertes.map((a) => a.sujet)).toEqual(["mails de code : plafond du jour atteint"]);
    expect(alertes[0]!.importante).toBe(true);
    /* Des demandes en même temps : celle-ci a vu le plafond libre, mais il est atteint quand son mail va partir */
    await envoyerCode(e, "123456");
    expect(codesEcrits(e)).toHaveLength(1);
    expect(alertes).toHaveLength(1);
  });

  it("S-09 · un code qui ne part pas prévient l’équipe, sans l’email : Resend qui le refuse, ou la base après la réponse", async () => {
    const e = email("panne");
    alertes.length = 0;
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      etat.panne = "resend";
      expect((await demander(e)).status).toBe(200);
      autreNavigateur();
      etat.panne = "base";
      expect((await demander(e)).status).toBe(200);
    } finally {
      etat.panne = null;
      erreurs.mockRestore();
    }
    expect(codesEcrits(e)).toHaveLength(0);
    expect(alertes).toEqual([
      { sujet: "code de connexion non envoyé", lignes: ["Le mail du code n’est pas parti.", "Erreur : Resend : 500"] },
      { sujet: "code de connexion non envoyé", lignes: ["Le mail du code n’est pas parti.", "Erreur : la base"] },
    ]);
  });
});

describe("S-16 · la session : glissante, et fermée partout d’un geste", () => {
  let compte = "";
  const sessions = async () => db().select().from(schema.sessions).where(eq(schema.sessions.userId, compte));

  beforeAll(async () => {
    const e = `session-${n}@blush.test`;
    emails.push(e);
    compte = (await db().insert(schema.users).values({ email: e }).returning())[0]!.id;
  });

  it("se déconnecter ferme la session de cet appareil ; « partout », toutes celles du compte. La réponse fait oublier le navigateur", async () => {
    const [a, b, c] = [await ouvrirSession(compte), await ouvrirSession(compte), await ouvrirSession(compte)];
    etat.cookies = new Map([[SESSION, a.secret]]);
    const seul = await postDeconnexion(postJson("/api/auth/deconnexion", {}));
    expect(seul.headers.get("clear-site-data")).toBe('"cache", "storage"');
    expect(etat.cookies.has(SESSION)).toBe(false);
    expect(await sessions()).toHaveLength(2);

    etat.cookies = new Map([[SESSION, b.secret]]);
    expect((await postDeconnexion(postJson("/api/auth/deconnexion", { partout: true }))).status).toBe(200);
    expect(await sessions()).toHaveLength(0);
    /* Celle d’un autre appareil aussi */
    expect(
      await db()
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, empreinte(c.secret))),
    ).toHaveLength(0);
  });

  it("« Tout effacer » : le compte et ses sessions, les cookies de cet appareil, et la réponse fait oublier le navigateur", async () => {
    const e = `tout-effacer-${n}@blush.test`;
    emails.push(e);
    const { id } = (await db().insert(schema.users).values({ email: e }).returning())[0]!;
    const { secret } = await ouvrirSession(id);
    etat.cookies = new Map([
      [SESSION, secret],
      [nomDuCookie("brouillon", false), "un-brouillon"],
      [nomDuCookie("code", false), "un-navigateur"],
    ]);
    await poserChoisie(randomUUID());
    const r = await deleteCompte(requete("/api/compte", { method: "DELETE" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("clear-site-data")).toBe('"cache", "storage"');
    expect(etat.cookies.size).toBe(0);
    expect(await db().select().from(schema.users).where(eq(schema.users.id, id))).toHaveLength(0);
    expect(
      await db()
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, empreinte(secret))),
    ).toHaveLength(0);
  });

  it("une visite prolonge la session d’un mois, et son cookie avec elle, une fois par jour au plus ; une session expirée ne revient pas", async () => {
    const { secret } = await ouvrirSession(compte);
    const ici = eq(schema.sessions.id, empreinte(secret));
    await db()
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() + 10 * 86400e3) })
      .where(ici);
    etat.cookies = new Map([[SESSION, secret]]);
    etat.attributs.clear();
    expect((await getReveil()).status).toBe(200);
    const prolongee = (await db().select().from(schema.sessions).where(ici))[0]!;
    expect(prolongee.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86400e3);
    expect(etat.attributs.get(SESSION)?.expires?.getTime()).toBe(prolongee.expiresAt.getTime());
    /* Le même jour : rien de plus */
    etat.attributs.clear();
    await getReveil();
    expect(etat.attributs.size).toBe(0);
    /* Expirée : la visite ne la rouvre pas */
    await db()
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(ici);
    await getReveil();
    expect((await db().select().from(schema.sessions).where(ici))[0]!.expiresAt.getTime()).toBeLessThan(Date.now());
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

  it("en https, l’ancien cookie de session, sans préfixe, part à la pose comme à l’effacement : le proxy ne le prend plus pour une session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      etat.cookies = new Map([["blush-session", "un-ancien-secret"]]);
      etat.attributs.clear();
      await poserSession("un-secret", new Date(Date.now() + 86400e3));
      expect([...etat.cookies.keys()]).toEqual(["__Host-blush-session"]);
      expect(etat.attributs.get("blush-session")).toMatchObject({ secure: true, path: "/" });
      /* « Tout effacer » ou se déconnecter, l’ancien encore là */
      etat.cookies.set("blush-session", "un-ancien-secret");
      await effacerSession();
      expect(etat.cookies.size).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("S-29 · « Tout effacer » efface aussi le compte d’un testeur retiré de la bêta ; sans compte, 401, et l’appareil oublie quand même", () => {
  it("retiré de la liste, il n’entre plus, mais son compte, ses sessions et ses convs s’effacent", async () => {
    const u = await compteDeTest("retire");
    const { secret } = await ouvrirSession(u.id);
    etat.retires.add(u.email);
    try {
      etat.cookies = new Map([[SESSION, secret]]);
      /* La garde de tout le reste ne le laisse plus entrer */
      expect((await getCompte()).status).toBe(401);
      const r = await deleteCompte(requete("/api/compte", { method: "DELETE" }));
      expect([r.status, await r.json()]).toEqual([200, { ok: true }]);
      expect(r.headers.get("clear-site-data")).toBe('"cache", "storage"');
      expect(await db().select().from(schema.users).where(eq(schema.users.id, u.id))).toHaveLength(0);
      expect(
        await db()
          .select()
          .from(schema.sessions)
          .where(eq(schema.sessions.id, empreinte(secret))),
      ).toHaveLength(0);
    } finally {
      etat.retires.delete(u.email);
    }
  });

  it("les écrans : /compte et /connexion l’envoient à /effacer (« Tout effacer »), qui ne s’ouvre que pour lui", async () => {
    const u = await compteDeTest("retire-ecrans");
    const { secret } = await ouvrirSession(u.id);
    etat.cookies = new Map([[SESSION, secret]]);
    /* Où la page renvoie (redirect lève une erreur de Next, son adresse dans son digest), ou null si elle s’affiche */
    const renvoi = async (rendu: () => Promise<unknown>) => {
      try {
        await rendu();
        return null;
      } catch (e) {
        const digest = (e as { digest?: string }).digest;
        if (digest?.startsWith("NEXT_REDIRECT;")) return digest.split(";")[2];
        throw e;
      }
    };
    const pages = () =>
      Promise.all([
        renvoi(() => CompteLayout({ children: "la page", params: Promise.resolve({}) } as never)),
        renvoi(() => Connecte({ searchParams: Promise.resolve({}) } as never)),
        renvoi(() => Effacer()),
      ]);
    /* Dans la bêta : son compte et son accueil, et /effacer renvoie à l’écran du compte */
    expect(await pages()).toEqual([null, "/app", "/compte"]);
    etat.retires.add(u.email);
    try {
      expect(await pages()).toEqual(["/effacer", "/effacer", null]);
    } finally {
      etat.retires.delete(u.email);
    }
    /* Sans session : la connexion, comme avant */
    etat.cookies = new Map();
    expect(await pages()).toEqual(["/connexion?suite=%2Fcompte", null, "/connexion?suite=%2Fcompte"]);
  });

  it("sans session (ou une session expirée) : 401 « connexion », jamais un « c’est fait » qui ne l’est pas ; cet appareil oublie quand même ce qu’il gardait", async () => {
    const u = await compteDeTest("expiree");
    const { secret } = await ouvrirSession(u.id);
    await db()
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.sessions.id, empreinte(secret)));
    for (const cookies of [new Map<string, string>(), new Map([[SESSION, secret]])]) {
      etat.cookies = cookies;
      const r = await deleteCompte(requete("/api/compte", { method: "DELETE" }));
      expect([r.status, await r.json()]).toEqual([401, { erreur: "connexion" }]);
      /* Le cookie de la session (expirée) et le stockage du navigateur s’en vont, comme quand le compte existait */
      expect(etat.cookies.has(SESSION)).toBe(false);
      expect(r.headers.get("clear-site-data")).toBe('"cache", "storage"');
    }
    /* Venue d’un autre site : rien n’est effacé, ni le compte, ni les cookies */
    etat.cookies = new Map([[SESSION, secret]]);
    const ailleurs = await deleteCompte(requete("/api/compte", { method: "DELETE", headers: { origin: "http://site-pirate.test" } }));
    expect(ailleurs.status).toBe(403);
    expect(ailleurs.headers.get("clear-site-data")).toBeNull();
    expect(etat.cookies.get(SESSION)).toBe(secret);
    expect(await db().select().from(schema.users).where(eq(schema.users.id, u.id))).toHaveLength(1);
  });
});

describe("S-30 · « Tout effacer » efface aussi le brouillon de ce navigateur, les codes en cours et l’inscription à la liste d’attente", () => {
  it("le brouillon du cookie, les codes de connexion de l’email (l’email en clair) et la ligne de la liste partent avec le compte ; le brouillon d’un autre navigateur reste", async () => {
    const u = await compteDeTest("s30");
    const { secret } = await ouvrirSession(u.id);
    vi.spyOn(console, "log").mockImplementation(() => {});
    await inscrire(u.email, "accueil");
    const lu = await depuisFichier(convDeTest("01-a-deux-doigts.txt"));
    const [ici, ailleurs] = [await importer(lu), await importer(lu)];
    const liste = eq(schema.waitlist.emailHash, empreinteDeLaListe(u.email));
    expect(await db().select().from(schema.waitlist).where(liste)).toHaveLength(1);
    /* Un code demandé d’un autre navigateur, encore en cours : sa ligne garde l’email en clair */
    await preparerCode(u.email, randomUUID(), { envoye: true });
    const codes = eq(schema.loginCodes.email, u.email);
    expect(await db().select().from(schema.loginCodes).where(codes)).toHaveLength(1);
    try {
      etat.cookies = new Map([
        [SESSION, secret],
        [nomDuCookie("brouillon", false), ici.secret],
      ]);
      const r = await deleteCompte(requete("/api/compte", { method: "DELETE" }));
      expect(r.status).toBe(200);
      expect(await db().select().from(schema.users).where(eq(schema.users.id, u.id))).toHaveLength(0);
      expect(await db().select().from(schema.stories).where(eq(schema.stories.id, ici.id))).toHaveLength(0);
      expect(await db().select().from(schema.waitlist).where(liste)).toHaveLength(0);
      expect(await db().select().from(schema.loginCodes).where(codes)).toHaveLength(0);
      expect(await db().select().from(schema.stories).where(eq(schema.stories.id, ailleurs.id))).toHaveLength(1);
    } finally {
      await db()
        .delete(schema.stories)
        .where(inArray(schema.stories.id, [ici.id, ailleurs.id]));
      await db().delete(schema.waitlist).where(liste);
      await db().delete(schema.loginCodes).where(codes);
    }
  });
});

describe("S-04 · S-28 · les lectures du jour se comptent par boîte mail et par adresse IP, pas par compte", () => {
  const qui = { me: "p0", pronom: "il", guess: "vus", goal: "ensemble" };
  const ipLecture = `10.${n % 250}.${(n >> 8) % 250}.230`;
  const lancer = () => postAnalyse(postJson("/api/analyse", qui, ipLecture));
  /* Les limites posées par ce test, retirées même s’il échoue */
  const posees: string[] = [];
  const poser = async (cle: string, count: number) => {
    posees.push(empreinte(`limite:${cle}`));
    await poserLimite(cle, count);
  };
  afterAll(async () => {
    await db().delete(schema.rateLimits).where(inArray(schema.rateLimits.key, posees));
  });

  it("un alias de la boîte (ou le même email, son compte effacé puis recréé) reprend le compteur où il en était ; une adresse IP aussi, tous comptes confondus", async () => {
    etat.fermee = false;
    const boite = `lectures-${n}@blush.test`;
    const alias = boite.replace("@", "+bis@");
    emails.push(alias);
    const u = (await db().insert(schema.users).values({ email: alias }).returning())[0]!;
    const conv = await convRattachee(u, "01-a-deux-doigts.txt");
    etat.cookies = new Map([[SESSION, (await ouvrirSession(u.id)).secret]]);
    await poserChoisie(conv.id);
    const verdict = async () => (await etatDesTaches(conv.id, ["verdict"])).verdict;

    /* La boîte a lu ses cinq convs du jour (sous un autre compte, ou avant d’effacer le sien) */
    await poser(cleDeLimiteDuCompte("analyse", boite), 5);
    expect(await (await lancer()).json()).toEqual({ erreur: "trop" });
    expect(await verdict()).toBeUndefined();

    /*
     * Un compte frais, mais une adresse IP qui en a déjà lancé vingt aujourd’hui. Refusée par l’adresse, la lecture ne
     * coûte rien au compte : derrière un réseau saturé, réessayer n’use pas ses cinq lectures
     */
    await poser(cleDeLimiteDuCompte("analyse", boite), 2);
    await poser(`analyse:ip:${ipLecture}`, 20);
    for (let k = 0; k < 4; k++) {
      const parIp = await lancer();
      expect([parIp.status, await parIp.json()]).toEqual([429, { erreur: "trop" }]);
    }
    expect(await compteDeLimite(cleDeLimiteDuCompte("analyse", boite))).toBe(2);
    expect(await verdict()).toBeUndefined();

    /* Sous les deux : la lecture part, et compte une fois de chaque côté */
    await poser(`analyse:ip:${ipLecture}`, 0);
    expect((await lancer()).status).toBe(200);
    expect(await verdict()).toBeDefined();
    expect([await compteDeLimite(cleDeLimiteDuCompte("analyse", boite)), await compteDeLimite(`analyse:ip:${ipLecture}`)]).toEqual([3, 1]);
    /* La chaîne laissée pour après la réponse ne tourne pas ici */
    etat.apres.length = 0;
  });
});

describe("S-10 · les limites par adresse IP", () => {
  const importer = (ip: string, fichier: boolean) => {
    const fd = new FormData();
    if (fichier) fd.append("fichier", convDeTest("01-a-deux-doigts.txt"));
    return postImport(requete("/api/import", { method: "POST", body: fd, headers: { "x-forwarded-for": ip } }));
  };

  it("un envoi invalide ne compte pas ; une IPv6 compte pour son /64 : changer d’adresse dans sa box ne remet pas le compteur à zéro", async () => {
    const reseau = `2001:db8:${(n % 65535).toString(16)}:${((n >> 16) % 65535).toString(16)}`;
    const cle = `import:ip:${reseau}::/64`;
    await poserLimite(cle, 19);
    try {
      /* Sans fichier : refusé pour ça, sans toucher au compteur */
      for (let k = 0; k < 3; k++) expect(await (await importer(`${reseau}::${k + 1}`, false)).json()).toEqual({ erreur: "fichier" });
      expect(await compteDeLimite(cle)).toBe(19);
      /* Le vingtième import de la box passe ; le suivant, d’une autre adresse de la même box, non */
      const vingtieme = await importer(`${reseau}::a`, true);
      expect(vingtieme.status).toBe(200);
      await db()
        .delete(schema.stories)
        .where(eq(schema.stories.id, ((await vingtieme.json()) as { story: { id: string } }).story.id));
      expect(await (await importer(`${reseau}:ffff:ffff:ffff:ffff`, true)).json()).toEqual({ erreur: "trop" });
    } finally {
      await db()
        .delete(schema.rateLimits)
        .where(eq(schema.rateLimits.key, empreinte(`limite:${cle}`)));
    }
  });
});
