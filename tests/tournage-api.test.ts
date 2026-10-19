import { randomUUID } from "node:crypto";
import { count, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * L’API du mode tournage (src/server/tournage.ts), pour l’outil des créatrices : préparer un lien depuis un .txt (la
 * vraie lecture, une fois), suivre son statut, l’arrêter ; puis le garde-fou des créatrices (jamais de vraie lecture
 * sans leur lien) et ce que le tableau de bord ne compte pas. Les routes sont appelées comme le ferait l’outil (sa clé)
 * ou le navigateur (ses cookies, simulés : `etat.cookies`) ; le modèle factice compte ses appels.
 */
const CLE_API = "une-cle-de-test-de-l-api-du-tournage-assez-longue";
const etat = vi.hoisted(() => ({ cookies: new Map<string, string>(), apres: [] as (() => unknown)[] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (etat.cookies.has(n) ? { name: n, value: etat.cookies.get(n)! } : undefined),
    has: (n: string) => etat.cookies.has(n),
    set: (n: string, v: string) => void etat.cookies.set(n, v),
    delete: (n: string | { name: string }) => void etat.cookies.delete(typeof n === "string" ? n : n.name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("@/server/env", async (original) => {
  const m = await original<typeof import("@/server/env")>();
  return { ...m, env: () => ({ ...m.env(), BLUSH_BETA_FERMEE: false, BLUSH_TOURNAGE_CLE: "une-cle-de-test-de-l-api-du-tournage-assez-longue" }) };
});
/* after() de Next ne vit que dans une requête : ce qui devait partir après la réponse attend ici, lancé par apres() */
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => void etat.apres.push(f) }));

import { GET as getTournage } from "@/app/api/admin/tournage/[id]/route";
import { POST as postArreter } from "@/app/api/admin/tournage/[id]/arreter/route";
import { POST as postTournage } from "@/app/api/admin/tournage/route";
import { POST as postAnalyse } from "@/app/api/analyse/route";
import { POST as postCaptures } from "@/app/api/captures/route";
import { POST as postPresence } from "@/app/api/presence/route";
import { POST as postFin } from "@/app/tournage/fin/route";
import { CASE_IMPORT } from "@/contenu/consentements";
import { nomDuCookie } from "@/lib/noms-cookies";
import type { Utilisateur } from "@/server/auth";
import { ouvrirSession } from "@/server/auth";
import { BUDGET_IA, plafondDe } from "@/server/budget";
import { empreinte } from "@/server/chiffrement";
import { COMPTE_DU_TOURNAGE } from "@/server/compte-du-tournage";
import { db, schema } from "@/server/db";
import { cleDuCompte } from "@/server/email-canonique";
import { importer, metaDe, personnesDe } from "@/server/histoires";
import { depuisFichier } from "@/server/import";
import { fournisseurFactice } from "@/server/ia/factice";
import { LIMITES } from "@/server/limites";
import { statsAdmin } from "@/server/stats";
import { STORY_COOKIE } from "@/services/session";
import type { ConvDeTournage } from "@/types/api";
import { convDeTest, texteDeConv } from "./aide/fichiers";
import { accordDeTest, compteDeTest, convRattachee, facticePourChaqueTest, ligneEnBase } from "./aide/fixtures";

const SESSION = nomDuCookie("session", false);
const TOURNAGE = nomDuCookie("tournage", false);
const appels: unknown[] = [];
facticePourChaqueTest((req) => (appels.push(req), fournisseurFactice(req)));

const n = Date.now();
let ip = 0;
/** Une requête : même origine, une adresse IP à elle, et (`api`) la clé de l’outil des créatrices. */
const requete = (chemin: string, init: RequestInit & { api?: string | null } = {}) => {
  const { api = CLE_API, ...reste } = init;
  return new Request(`http://localhost${chemin}`, {
    ...reste,
    headers: {
      origin: "http://localhost",
      "x-forwarded-host": "localhost",
      "x-forwarded-for": `10.${n % 250}.${(n >> 8) % 250}.${++ip}`,
      ...(api ? { authorization: `Bearer ${api}` } : {}),
      ...reste.headers,
    },
  });
};
const json = (corps: object) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) });
const preparer = (corps: object, api?: string | null) => postTournage(requete("/api/admin/tournage", { ...json(corps), api }));
const lire = async (id: string) => (await (await getTournage(requete(`/api/admin/tournage/${id}`), { params: Promise.resolve({ id }) })).json()) as ConvDeTournage;
/** Ce qui devait partir après les réponses (la lecture de la conv de tournage), jusqu’au bout. */
const apres = async () => {
  while (etat.apres.length) await etat.apres.shift()!();
};

const FICHIER = "01-a-deux-doigts.txt";
/* Le prénom de la créatrice dans le fichier : le premier participant de la conv d’essai */
let moi = "";
/* Les convs restées sans compte, et celles du compte des convs de tournage, effacées à la fin */
const effacer: string[] = [];

beforeAll(async () => {
  const essai = await importer(await depuisFichier(convDeTest(FICHIER)), accordDeTest());
  moi = essai.meta.participants[0].prenom;
  effacer.push(essai.id);
});
afterAll(async () => {
  const [compte] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, COMPTE_DU_TOURNAGE));
  if (compte) await db().delete(schema.users).where(eq(schema.users.id, compte.id));
  if (effacer.length) await db().delete(schema.stories).where(inArray(schema.stories.id, effacer));
  await db()
    .delete(schema.rateLimits)
    .where(eq(schema.rateLimits.key, empreinte("limite:tournage:api")));
});

describe("l’API du mode tournage", () => {
  let id = "";

  it("sans la bonne clé, rien : 401 « interdit »", async () => {
    for (const api of [null, "pas-la-bonne-cle-pas-la-bonne-cle-pas-la-bonne"]) {
      const r = await preparer({ nom: "x", fichier: "x", moi: "x" }, api);
      expect([r.status, await r.json()]).toEqual([401, { erreur: "interdit" }]);
    }
  });

  it("refuse un prénom absent du fichier (422 « qui ») et un fichier illisible, sans rien lire ni garder", async () => {
    const convs = async () => (await db().select({ n: count() }).from(schema.stories))[0]!.n;
    const avant = [appels.length, await convs()];
    const qui = await preparer({ nom: "Kelly · A1", fichier: texteDeConv(FICHIER), moi: "Personne" });
    expect([qui.status, await qui.json()]).toEqual([422, { erreur: "qui" }]);
    const illisible = await preparer({ nom: "Kelly · A1", fichier: "pas un export", moi });
    expect(illisible.status).toBe(422);
    /* Ce qui part après la réponse ne fait que signaler l’erreur d’import (reponseErreur) : aucune lecture */
    await apres();
    expect([appels.length, await convs()]).toEqual(avant);
  });

  it("prépare un lien : la vraie lecture une fois, dans le compte des convs de tournage, puis le lien une fois prête", async () => {
    const r = await preparer({ nom: "Kelly · A1", fichier: texteDeConv(FICHIER), moi, ref: `kelly-a1-${n}` });
    const corps = (await r.json()) as { id: string; nouvelle: boolean; statut: string };
    expect(corps).toMatchObject({ nouvelle: true, statut: "en_lecture" });
    id = corps.id;
    const enLecture = await lire(id);
    expect(enLecture).toMatchObject({ id, nom: "Kelly · A1", statut: "en_lecture", lien: null, arrete: false });
    const avant = appels.length;
    await apres();
    expect(appels.length).toBeGreaterThan(avant);
    const pret = await lire(id);
    expect(pret).toMatchObject({ statut: "pret", erreur: null, arrete: false });
    expect(pret.lien).toMatch(/^https?:\/\/[^/]+\/tournage\/[\w-]{43}$/);
    /* La conv lue : au compte des convs de tournage, son rapport ouvert, « Qui es-tu ? » rempli pour la créatrice */
    const [t] = await db().select({ storyId: schema.tournages.storyId }).from(schema.tournages).where(eq(schema.tournages.id, id));
    const source = await ligneEnBase(t!.storyId);
    const [compte] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, COMPTE_DU_TOURNAGE));
    expect(source.userId).toBe(compte!.id);
    expect(source.debloqueLe).toBeInstanceOf(Date);
    expect(personnesDe(metaDe(source)).moi.prenom).toBe(moi);
    expect(metaDe(source)).toMatchObject({ pronom: "elle", devinette: "vus", objectif: "ensemble" });
  });

  it("la même ref rend la même conv de tournage, sans rien relire", async () => {
    const compter = async () => (await db().select({ n: count() }).from(schema.tournages))[0]!.n;
    const avant = [appels.length, await compter()];
    const r = await preparer({ nom: "Kelly · A1", fichier: texteDeConv(FICHIER), moi, ref: `kelly-a1-${n}` });
    expect(await r.json()).toEqual({ id, nouvelle: false, statut: "pret" });
    expect([appels.length, await compter()]).toEqual(avant);
    expect(etat.apres).toEqual([]);
  });

  it("une nouvelle lecture au-delà de la limite du jour : 429 « trop » ; une ref déjà vue passe encore", async () => {
    const cle = empreinte("limite:tournage:api");
    await db()
      .insert(schema.rateLimits)
      .values({ key: cle, windowStart: new Date(), count: LIMITES.tournageApiParJour.max })
      .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count: LIMITES.tournageApiParJour.max, windowStart: new Date() } });
    const r = await preparer({ nom: "Kelly · A2", fichier: texteDeConv(FICHIER), moi });
    expect([r.status, await r.json()]).toEqual([429, { erreur: "trop" }]);
    expect((await preparer({ nom: "Kelly · A1", fichier: texteDeConv(FICHIER), moi, ref: `kelly-a1-${n}` })).status).toBe(200);
    await db().delete(schema.rateLimits).where(eq(schema.rateLimits.key, cle));
  });

  it("s’arrête : plus de lien ; un id inconnu : 404", async () => {
    const arreter = async (x: string) =>
      (await (await postArreter(requete(`/api/admin/tournage/${x}/arreter`, { method: "POST" }), { params: Promise.resolve({ id: x }) })).json()) as { arretee: boolean };
    expect(await arreter(id)).toEqual({ arretee: true });
    expect(await arreter(id)).toEqual({ arretee: false });
    expect(await lire(id)).toMatchObject({ statut: "pret", lien: null, arrete: true });
    const inconnu = randomUUID();
    expect((await getTournage(requete(`/api/admin/tournage/${inconnu}`), { params: Promise.resolve({ id: inconnu }) })).status).toBe(404);
  });

  it("le compte des convs de tournage a son budget de l’IA, à part", () => {
    expect(plafondDe(cleDuCompte(COMPTE_DU_TOURNAGE))).toBe(BUDGET_IA.tournage * 1e6);
    expect(plafondDe(cleDuCompte("quelquun@blush.test"))).toBe(BUDGET_IA.compte * 1e6);
  });
});

describe("une créatrice sans son lien", () => {
  /** Le navigateur d’un compte connecté, avec ou sans un cookie de tournage. */
  const navigateur = async (u: Pick<Utilisateur, "id"> | null, cle?: string) => {
    etat.cookies.clear();
    if (u) etat.cookies.set(SESSION, (await ouvrirSession(u.id)).secret);
    if (cle) etat.cookies.set(TOURNAGE, cle);
  };
  const lancer = () => postAnalyse(requete("/api/analyse", { ...json({ me: "p0", pronom: "elle", guess: "vus", goal: "ensemble" }), api: null }));
  const captures = () => {
    const fd = new FormData();
    fd.append("captures", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "c.png", { type: "image/png" }));
    fd.append("app", "instagram");
    fd.append("consentement", CASE_IMPORT.version);
    fd.append("cle", randomUUID());
    return postCaptures(requete("/api/captures", { method: "POST", body: fd, api: null }));
  };

  it("un compte qui a déjà fait une prise ne lance jamais une vraie lecture : 409 « tournage »", async () => {
    const creatrice = await compteDeTest("tournage-api-creatrice");
    /* Une prise d’avant (une conv rejouée), puis une conv importée comme d’habitude, sans le mode tournage */
    await db()
      .insert(schema.stories)
      .values({ userId: creatrice.id, messageCount: 1, meta: (await ligneEnBase((await convRattachee(creatrice, FICHIER)).id)).meta, tournageLe: new Date() });
    const imp = await convRattachee(creatrice, "02-reciproque.txt");
    await navigateur(creatrice);
    etat.cookies.set(STORY_COOKIE, imp.id);
    const avant = appels.length;
    const r = await lancer();
    expect([r.status, await r.json()]).toEqual([409, { erreur: "tournage" }]);
    expect((await captures()).status).toBe(409);
    expect(appels.length).toBe(avant);
    expect(etat.apres).toEqual([]);
  });

  it("« Quitter le mode tournage » connectée : ses prises d’avant ne comptent plus, elle lit partout ; une nouvelle prise la refait créatrice", async () => {
    const quitte = await compteDeTest("tournage-api-quitte");
    const prise = async () =>
      db()
        .insert(schema.stories)
        .values({ userId: quitte.id, messageCount: 1, meta: (await ligneEnBase((await convRattachee(quitte, FICHIER)).id)).meta, tournageLe: new Date() });
    await prise();
    const premiere = await convRattachee(quitte, "02-reciproque.txt");
    await navigateur(quitte);
    etat.cookies.set(STORY_COOKIE, premiere.id);
    expect((await lancer()).status).toBe(409);
    /* Le formulaire de « Mon compte », ce navigateur connecté : le cookie part, et le compte n’est plus une créatrice */
    const fd = new FormData();
    fd.append("retour", "/compte");
    const fin = await postFin(requete("/tournage/fin", { method: "POST", body: fd, api: null }));
    expect([fin.status, fin.headers.get("location")]).toEqual([303, "/compte"]);
    expect((await db().select({ le: schema.users.tournageQuitteLe }).from(schema.users).where(eq(schema.users.id, quitte.id)))[0]!.le).toBeInstanceOf(Date);
    const avant = appels.length;
    expect((await lancer()).status).toBe(200);
    etat.apres.length = 0;
    expect(appels.length).toBe(avant);
    /* Sur un autre navigateur aussi : c’est le compte qui est sorti */
    const seconde = await convRattachee(quitte, "03-elle-s-eloigne.txt");
    await navigateur(quitte);
    etat.cookies.set(STORY_COOKIE, seconde.id);
    expect((await captures()).status).not.toBe(409);
    /* Une nouvelle prise, après la sortie : de nouveau une créatrice */
    await prise();
    expect([(await lancer()).status, (await captures()).status]).toEqual([409, 409]);
    etat.apres.length = 0;
  });

  it("« Quitter » sans compte : le cookie part, rien d’autre ne change", async () => {
    await navigateur(null, "x".repeat(43));
    const fin = await postFin(requete("/tournage/fin", { method: "POST", api: null }));
    expect([fin.status, fin.headers.get("location")]).toEqual([303, "/"]);
    expect(etat.cookies.has(TOURNAGE)).toBe(false);
  });

  it("un navigateur qui garde un lien arrêté ne fait rien lire non plus, même sans compte", async () => {
    await navigateur(null, "x".repeat(43));
    const avant = appels.length;
    const r = await captures();
    expect([r.status, await r.json()]).toEqual([409, { erreur: "tournage" }]);
    expect(appels.length).toBe(avant);
  });

  it("un compte comme les autres lit comme d’habitude", async () => {
    const quelquun = await compteDeTest("tournage-api-normal");
    const imp = await convRattachee(quelquun, "03-elle-s-eloigne.txt");
    await navigateur(quelquun);
    etat.cookies.set(STORY_COOKIE, imp.id);
    expect((await lancer()).status).toBe(200);
    etat.apres.length = 0;
  });
});

describe("le tableau de bord ne compte pas le tournage", () => {
  it("ni le compte d’une créatrice, ni celui des convs de tournage", async () => {
    const avant = (await statsAdmin(1)).cles.comptes.valeur;
    const creatrice = await compteDeTest("tournage-api-stats");
    await db()
      .insert(schema.stories)
      .values({ userId: creatrice.id, messageCount: 1, meta: (await db().select({ meta: schema.stories.meta }).from(schema.stories).limit(1))[0]!.meta, tournageLe: new Date() });
    expect((await statsAdmin(1)).cles.comptes.valeur).toBe(avant);
  });

  it("un navigateur en mode tournage n’est ni une visite, ni dans le direct", async () => {
    /* Le cookie du mode tournage, envoyé par le navigateur avec le signe (src/server/visites.ts le lit dans la requête) */
    const signe = (cookie?: string) =>
      postPresence(
        requete("/api/presence", {
          ...json({ onglet: randomUUID(), etape: "accueil", premier: true }),
          api: null,
          headers: { "user-agent": `test-${randomUUID()}`, ...(cookie ? { cookie } : {}) },
        }),
      );
    const visites = async () => (await db().select({ n: count() }).from(schema.visites))[0]!.n;
    const presences = async () => (await db().select({ n: count() }).from(schema.presences))[0]!.n;
    const avant = [await visites(), await presences()];
    expect((await signe(`autre=1; ${TOURNAGE}=${"y".repeat(43)}`)).status).toBe(200);
    expect([await visites(), await presences()]).toEqual(avant);
    await signe("autre=1");
    expect(await visites()).toBe(avant[0]! + 1);
  });
});
