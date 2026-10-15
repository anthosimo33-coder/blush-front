import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * Le mode tournage (src/server/tournage.ts) : une conv de l’équipe lue une fois, puis rejouée chez chaque créatrice par
 * les routes, comme le ferait son navigateur (les cookies de next/headers sont simulés : `etat.cookies` est ce
 * navigateur). Le modèle factice compte ses appels : une prise n’en fait aucun, de l’import à la lecture.
 */
const etat = vi.hoisted(() => ({ cookies: new Map<string, string>(), apres: [] as (() => unknown)[], admins: new Set<string>() }));
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
  return { ...m, env: () => ({ ...m.env(), BLUSH_BETA_FERMEE: false }), estAdmin: (email: string) => etat.admins.has(email) };
});
/* after() de Next ne vit que dans une requête : ce qui devait partir après la réponse attend ici */
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => void etat.apres.push(f) }));

import { POST as postAdmin } from "@/app/api/admin/route";
import { GET as getAnalyse, POST as postAnalyse } from "@/app/api/analyse/route";
import { POST as postCaptures } from "@/app/api/captures/route";
import { POST as postLot } from "@/app/api/captures/lot/route";
import { POST as postVideo } from "@/app/api/captures/video/route";
import { GET as getLien } from "@/app/tournage/[cle]/route";
import { POST as postFin } from "@/app/tournage/fin/route";
import { CASE_IMPORT } from "@/contenu/consentements";
import { nomDuCookie } from "@/lib/noms-cookies";
import { DUREE_RELECTURE_MS } from "@/server/avancement";
import type { Utilisateur } from "@/server/auth";
import { ouvrirSession } from "@/server/auth";
import { soldeDe } from "@/server/bulles";
import { db, schema } from "@/server/db";
import { metaDe, personnesDe, type Meta } from "@/server/histoires";
import { fournisseurFactice } from "@/server/ia/factice";
import { executerChaine } from "@/server/pipeline";
import { statsAdmin } from "@/server/stats";
import { etatDesTaches, planifier } from "@/server/taches";
import {
  arreterTournage,
  BULLES_DU_TOURNAGE,
  convsCandidates,
  creerTournage,
  metaDeLaPrise,
  tournageDe,
  tournageDeLaCle,
  tournagesAffiches,
  type Tournage,
} from "@/server/tournage";
import { STORY_COOKIE } from "@/services/session";
import { compteDeTest, convPrete, convRattachee, facticePourChaqueTest, histoireLue, ligneEnBase } from "./aide/fixtures";

const SESSION = nomDuCookie("session", false);
const TOURNAGE = nomDuCookie("tournage", false);
/* Les appels au modèle (factice) pendant les tests : une prise n’en fait aucun */
const appels: unknown[] = [];
facticePourChaqueTest((req) => (appels.push(req), fournisseurFactice(req)));

const n = Date.now();
let ip = 0;
/** Une requête du navigateur : même origine, une adresse IP à elle (les limites par IP ne se mélangent pas). */
const requete = (chemin: string, init: RequestInit = {}) =>
  new Request(`http://localhost${chemin}`, {
    ...init,
    headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "x-forwarded-for": `10.${n % 250}.${(n >> 8) % 250}.${++ip}`, ...init.headers },
  });
/** Des captures envoyées comme le navigateur (`nb` images PNG : seule leur signature compte ici). */
const captures = (nb = 2) => {
  const fd = new FormData();
  for (let k = 0; k < nb; k++) fd.append("captures", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, k])], `c${k}.png`, { type: "image/png" }));
  fd.append("app", "instagram");
  fd.append("consentement", CASE_IMPORT.version);
  fd.append("cle", randomUUID());
  return postCaptures(requete("/api/captures", { method: "POST", body: fd }));
};
const QUI = { me: "p0", pronom: "elle", guess: "vus", goal: "ensemble", prenom: "Kelly" } as const;
const lancer = (qui: object = QUI) => postAnalyse(requete("/api/analyse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(qui) }));
/** Le navigateur d’un compte connecté (sa session), avec ou sans le mode tournage. */
const navigateur = async (u: Pick<Utilisateur, "id">, cle?: string) => {
  etat.cookies.clear();
  etat.cookies.set(SESSION, (await ouvrirSession(u.id)).secret);
  if (cle) etat.cookies.set(TOURNAGE, cle);
};
const cleDe = async (id: string) =>
  (await tournagesAffiches())
    .find((t) => t.id === id)!
    .lien.split("/")
    .pop()!;
/** Une prise : des captures importées en mode tournage, puis lancées (« Qui es-tu ? », le prénom de la créatrice). */
const prise = async () => {
  const r = await captures();
  expect(r.status).toBe(200);
  const { story } = (await r.json()) as { story: { id: string } };
  expect((await lancer()).status).toBe(200);
  return story.id;
};

let equipe: Utilisateur;
let source: string;
let tournage: Tournage;
let cle: string;
/* Les brouillons laissés sans compte par les routes */
const brouillons: string[] = [];

beforeAll(async () => {
  equipe = await compteDeTest("tournage-equipe", "debloque");
  /* La conv de la campagne, lue en entier une fois (le verdict, le rapport, le vocal, la mémoire) */
  source = (await histoireLue(equipe, "01-a-deux-doigts.txt", { qui: { pronom: "elle" } })).id;
  const r = await creerTournage({ conv: source, nom: "A · Il répond plus pareil", par: equipe });
  if (!("id" in r)) throw new Error(`conv de tournage refusée : ${r.refus}`);
  tournage = (await tournageDe(r.id))!;
  cle = await cleDe(r.id);
});
afterAll(async () => {
  if (brouillons.length) await db().delete(schema.stories).where(inArray(schema.stories.id, brouillons));
});

describe("la conv de tournage, depuis /admin", () => {
  it("n’accepte qu’une conv lue en entier du compte qui la crée", async () => {
    const autre = await compteDeTest("tournage-autre", "debloque");
    expect(await creerTournage({ conv: source, nom: "x", par: autre })).toEqual({ refus: "aucune" });
    expect(await creerTournage({ conv: "pas-un-uuid", nom: "x", par: equipe })).toEqual({ refus: "aucune" });
    const pasLue = await convPrete(equipe, "02-reciproque.txt");
    expect(await creerTournage({ conv: pasLue.id, nom: "x", par: equipe })).toEqual({ refus: "pas_lue" });
    /* Lue, mais le rapport pas écrit (pas débloqué) */
    const gratuit = await compteDeTest("tournage-gratuit");
    const verdictSeul = await histoireLue(gratuit, "03-elle-s-eloigne.txt");
    expect(await creerTournage({ conv: verdictSeul.id, nom: "x", par: gratuit })).toEqual({ refus: "sans_rapport" });
    /* La liste de /admin : la conv prête, celle qui ne l’est pas, et le pourquoi */
    const candidates = await convsCandidates(equipe.id);
    expect(candidates.find((c) => c.id === source)).toMatchObject({ manque: null });
    expect(candidates.find((c) => c.id === pasLue.id)).toBeUndefined();
  });

  it("garde son lien : /admin le remontre, avec la conv et ses prises", async () => {
    const t = (await tournagesAffiches()).find((x) => x.id === tournage.id)!;
    expect(t).toMatchObject({ nom: "A · Il répond plus pareil", arrete: false, lien: `/tournage/${cle}` });
    expect(cle).toMatch(/^[\w-]{43}$/);
    expect(t.autre).toBe(personnesDe(metaDe(await ligneEnBase(source))).autre.prenom);
    expect(await tournageDeLaCle(cle)).toEqual(tournage);
    expect(await tournageDeLaCle("x".repeat(43))).toBeNull();
  });

  it("se crée et s’arrête par POST /api/admin, pour l’équipe seulement", async () => {
    etat.admins.add(equipe.email);
    await navigateur(equipe);
    const geste = (corps: object) => postAdmin(requete("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) }));
    const cree = await geste({ action: "tournage", conv: source, nom: "B · Mon meilleur ami" });
    expect(await cree.json()).toEqual({ action: "tournage", refus: null });
    const b = (await tournagesAffiches()).find((t) => t.nom === "B · Mon meilleur ami")!;
    expect(await (await geste({ action: "tournage_arret", id: b.id })).json()).toEqual({ action: "tournage_arret", arretee: true });
    expect(await (await geste({ action: "tournage_arret", id: b.id })).json()).toEqual({ action: "tournage_arret", arretee: false });
    expect((await tournagesAffiches()).find((t) => t.id === b.id)).toMatchObject({ arrete: true });
    const actions = await db().select({ action: schema.actionsEquipe.action }).from(schema.actionsEquipe).where(eq(schema.actionsEquipe.parId, equipe.id));
    expect(actions.map((a) => a.action).sort()).toEqual(["tournage", "tournage_arret"]);
    etat.admins.clear();
    expect((await geste({ action: "tournage", conv: source, nom: "C" })).status).toBe(404);
  });
});

describe("le lien d’une conv de tournage", () => {
  it("pose le mode tournage sur ce navigateur ; un lien faux le retire ; « Quitter » aussi", async () => {
    etat.cookies.clear();
    const r = await getLien(requete(`/tournage/${cle}`), { params: Promise.resolve({ cle }) });
    expect(r.status).toBe(307);
    /* Relative : le navigateur reste sur l’adresse qu’il a ouverte */
    expect(r.headers.get("location")).toBe("/tournage");
    expect(etat.cookies.get(TOURNAGE)).toBe(cle);
    await getLien(requete("/tournage/faux"), { params: Promise.resolve({ cle: "faux" }) });
    expect(etat.cookies.has(TOURNAGE)).toBe(false);
    etat.cookies.set(TOURNAGE, cle);
    expect((await postFin(requete("/tournage/fin", { method: "POST", headers: { origin: "https://ailleurs.test" } }))).status).toBe(403);
    expect(etat.cookies.has(TOURNAGE)).toBe(true);
    const fin = await postFin(requete("/tournage/fin", { method: "POST" }));
    expect([fin.status, fin.headers.get("location")]).toEqual([303, "/"]);
    expect(etat.cookies.has(TOURNAGE)).toBe(false);
  });
});

describe("une prise", () => {
  let kelly: Utilisateur;
  beforeAll(async () => {
    kelly = await compteDeTest("tournage-kelly");
  });

  it("des captures : un brouillon de la conv de tournage, sans les lire", async () => {
    await navigateur(kelly, cle);
    const avant = appels.length;
    const r = await captures(3);
    expect(r.status).toBe(200);
    const corps = (await r.json()) as { story: { id: string; participants: { name: string }[]; sources: { label: string }[] }; messagesRead: number };
    brouillons.push(corps.story.id);
    const ligne = await ligneEnBase(corps.story.id);
    const s = await ligneEnBase(source);
    expect(appels.length).toBe(avant);
    expect(ligne).toMatchObject({ tournageId: tournage.id, tournageLe: null, conv: null, messageCount: s.messageCount, userId: null });
    expect(corps.messagesRead).toBe(s.messageCount);
    expect(corps.story.participants.map((p) => p.name)).toEqual(["Moi", personnesDe(metaDe(s)).autre.prenom]);
    expect(corps.story.sources[0]!.label).toBe("Instagram · 3 captures");
  });

  it("sa lecture recopie celle de la conv de tournage, sans modèle, et se rejoue en 40 s", async () => {
    await navigateur(kelly, cle);
    const avant = appels.length;
    const apres = etat.apres.length;
    const id = await prise();
    expect(appels.length).toBe(avant);
    /* Rien n’a été laissé pour après la réponse : aucune étape ne part */
    expect(etat.apres.length).toBe(apres);
    expect(etat.cookies.get(STORY_COOKIE)).toBe(id);
    const ligne = await ligneEnBase(id);
    expect(ligne).toMatchObject({ userId: kelly.id, tournageId: tournage.id, conv: null });
    expect(ligne.tournageLe).toBeInstanceOf(Date);
    expect(ligne.debloqueLe).toBeInstanceOf(Date);
    /* Le verdict, le rapport, la mémoire et le vocal de la source, octet pour octet */
    for (const table of [schema.verdicts, schema.reports, schema.memories, schema.vocals]) {
      const [a] = await db().select().from(table).where(eq(table.storyId, source));
      const [b] = await db().select().from(table).where(eq(table.storyId, id));
      expect(b, "une table recopiée").toBeDefined();
      expect(Buffer.compare(Buffer.from((b as { data: Buffer }).data), Buffer.from((a as { data: Buffer }).data))).toBe(0);
    }
    /* Ses tâches de la chaîne, finies : rien à lancer */
    const taches = await etatDesTaches(id, ["verdict", "rapport_plan", "rapport_chapitres", "memoire"]);
    expect(Object.values(taches).map((t) => t.status)).toEqual(["fini", "fini", "fini", "fini"]);
    /* Son prénom et son import, sur la meta de la conv de tournage */
    const meta = metaDe(ligne);
    const metaSource = metaDe(await ligneEnBase(source));
    expect(personnesDe(meta).moi.prenom).toBe("Kelly");
    expect(personnesDe(meta).autre).toEqual(personnesDe(metaSource).autre);
    expect(meta).toMatchObject({ appli: "instagram", captures: 2, moi: metaSource.moi, pronom: metaSource.pronom, resume: metaSource.resume });
    expect(await soldeDe(kelly.id)).toBe(BULLES_DU_TOURNAGE);
    /* L’écran de lecture la rejoue, puis la dit finie */
    const lire = async () => (await (await getAnalyse()).json()) as { done: boolean; progress: number };
    expect(await lire()).toMatchObject({ done: false });
    await db()
      .update(schema.stories)
      .set({ tournageLe: new Date(Date.now() - DUREE_RELECTURE_MS - 1000) })
      .where(eq(schema.stories.id, id));
    expect(await lire()).toMatchObject({ done: true, progress: 1 });
    expect(appels.length).toBe(avant);
  });

  it("une nouvelle prise remplace la précédente, sans redonner les bulles", async () => {
    await navigateur(kelly, cle);
    const premiere = (await db().select({ id: schema.stories.id }).from(schema.stories).where(eq(schema.stories.userId, kelly.id)))[0]!.id;
    const seconde = await prise();
    const restent = await db().select({ id: schema.stories.id }).from(schema.stories).where(eq(schema.stories.userId, kelly.id));
    expect(restent.map((s) => s.id)).toEqual([seconde]);
    expect(premiere).not.toBe(seconde);
    expect(await db().select().from(schema.effacements).where(eq(schema.effacements.cible, premiere))).toHaveLength(1);
    expect(await soldeDe(kelly.id)).toBe(BULLES_DU_TOURNAGE);
  });

  it("la chaîne ne lance jamais le modèle pour une prise, même une étape qu’elle croirait à refaire", async () => {
    await navigateur(kelly, cle);
    const id = (await db().select({ id: schema.stories.id }).from(schema.stories).where(eq(schema.stories.userId, kelly.id)))[0]!.id;
    await db()
      .delete(schema.tasks)
      .where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "vocal")));
    await planifier(id, "vocal");
    const avant = appels.length;
    await executerChaine(id);
    expect(appels.length).toBe(avant);
    const { vocal } = await etatDesTaches(id, ["vocal"]);
    expect(vocal).toMatchObject({ status: "echec", error: "tournage" });
  });

  it("un export importé avec le mode tournage se rejoue aussi, et sa conv brute s’efface", async () => {
    const lea = await compteDeTest("tournage-lea");
    const imp = await convRattachee(lea, "04-ghosting.txt");
    await navigateur(lea, cle);
    etat.cookies.set(STORY_COOKIE, imp.id);
    const avant = appels.length;
    expect((await lancer({ me: "p1", pronom: "elle", guess: "vus", goal: "ensemble" })).status).toBe(200);
    expect(appels.length).toBe(avant);
    const ligne = await ligneEnBase(imp.id);
    expect(ligne).toMatchObject({ conv: null, tournageId: tournage.id });
    /* Ses deux personnes sont celles de la conv de tournage, son appli celle de son export */
    expect(personnesDe(metaDe(ligne)).autre).toEqual(personnesDe(metaDe(await ligneEnBase(source))).autre);
    expect(metaDe(ligne).appli).toBe("whatsapp");
  });

  it("un enregistrement d’écran : ses lots ne sont pas lus, et la fin fait un brouillon de tournage", async () => {
    await navigateur(kelly, cle);
    const avant = appels.length;
    const fd = new FormData();
    fd.append("captures", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "e.png", { type: "image/png" }));
    fd.append("app", "imessage");
    fd.append("consentement", CASE_IMPORT.version);
    const { lot } = (await (await postLot(requete("/api/captures/lot", { method: "POST", body: fd }))).json()) as { lot: unknown };
    const fin = await postVideo(
      requete("/api/captures/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app: "imessage", consentement: CASE_IMPORT.version, lots: [lot], cle: randomUUID() }),
      }),
    );
    expect(fin.status).toBe(200);
    const { story } = (await fin.json()) as { story: { id: string } };
    brouillons.push(story.id);
    expect(appels.length).toBe(avant);
    expect(await ligneEnBase(story.id)).toMatchObject({ tournageId: tournage.id, conv: null });
  });

  it("ne compte ni dans les imports ni dans les verdicts du tableau de bord", async () => {
    await navigateur(kelly, cle);
    const avant = (await statsAdmin(1)).cles;
    await prise();
    const apres = (await statsAdmin(1)).cles;
    expect([apres.convs.valeur, apres.verdicts.valeur, apres.rapports.valeur]).toEqual([avant.convs.valeur, avant.verdicts.valeur, avant.rapports.valeur]);
  });
});

describe("une conv de tournage arrêtée, ou effacée", () => {
  it("arrêtée : son lien ne pose plus rien et des captures se lisent comme d’habitude ; un brouillon déjà fait se lit encore", async () => {
    const t = await creerTournage({ conv: source, nom: "D · Quoi lui répondre", par: equipe });
    if (!("id" in t)) throw new Error("conv de tournage refusée");
    const cleD = await cleDe(t.id);
    const nina = await compteDeTest("tournage-nina");
    await navigateur(nina, cleD);
    const r = await captures();
    const { story } = (await r.json()) as { story: { id: string } };
    expect(await arreterTournage(t.id)).toBe(true);
    expect(await tournageDeLaCle(cleD)).toBeNull();
    /* Le brouillon garde sa conv de tournage : sa lecture se rejoue encore */
    const avant = appels.length;
    expect((await lancer()).status).toBe(200);
    expect(appels.length).toBe(avant);
    expect((await ligneEnBase(story.id)).tournageLe).toBeInstanceOf(Date);
    /* De nouvelles captures, avec ce lien arrêté : lues par le modèle, comme pour tout le monde */
    const lues = await captures();
    expect(lues.status).toBe(200);
    brouillons.push(((await lues.json()) as { story: { id: string } }).story.id);
    expect(appels.length).toBeGreaterThan(avant);
  });

  it("effacée : un brouillon de tournage n’a plus rien à lire (404 aucune)", async () => {
    const t = await creerTournage({ conv: source, nom: "E · Vocal suspendu", par: equipe });
    if (!("id" in t)) throw new Error("conv de tournage refusée");
    const zoe = await compteDeTest("tournage-zoe");
    await navigateur(zoe, await cleDe(t.id));
    const { story } = (await (await captures()).json()) as { story: { id: string } };
    brouillons.push(story.id);
    await db().delete(schema.tournages).where(eq(schema.tournages.id, t.id));
    etat.cookies.delete(TOURNAGE);
    const avant = appels.length;
    const r = await lancer();
    expect([r.status, await r.json()]).toEqual([404, { erreur: "aucune" }]);
    expect(appels.length).toBe(avant);
  });
});

describe("la meta d’une prise", () => {
  const SOURCE: Meta = {
    appli: "whatsapp",
    format: "whatsapp-ios",
    fichier: "conv.txt",
    participants: [
      { nom: "Léa Martin", prenom: "Léa", messages: 30 },
      { nom: "Lucas", prenom: "Lucas", messages: 30 },
    ],
    resume: { debut: "2026-09-04", fin: "2026-09-06", total: 60, vocaux: 0 },
    moi: 0,
    pronom: "elle",
    devinette: "vus",
    objectif: "ensemble",
  };
  const CAPTURES: Meta = {
    appli: "instagram",
    format: "captures",
    fichier: "2 captures",
    captures: 2,
    participants: [
      { nom: "Moi", prenom: "Kelly", messages: 30 },
      { nom: "Lucas", prenom: "Lucas", messages: 30 },
    ],
    resume: SOURCE.resume,
    moi: 0,
  };

  it("garde la conv de tournage, avec l’import et le prénom de la créatrice", () => {
    expect(metaDeLaPrise(SOURCE, CAPTURES)).toEqual({
      ...SOURCE,
      appli: "instagram",
      format: "captures",
      fichier: "2 captures",
      captures: 2,
      participants: [{ ...SOURCE.participants[0], prenom: "Kelly" }, SOURCE.participants[1]],
    });
  });

  it("sans prénom donné (« Moi »), garde celui de la conv de tournage ; un export n’a pas de captures", () => {
    const sansPrenom = { ...CAPTURES, participants: [{ nom: "Moi", prenom: "Moi", messages: 30 }, CAPTURES.participants[1]] } satisfies Meta;
    expect(metaDeLaPrise(SOURCE, sansPrenom).participants).toEqual(SOURCE.participants);
    const exportDeLaSource = { ...SOURCE, appli: "instagram", format: "captures", fichier: "4 captures", captures: 4 } satisfies Meta;
    expect(metaDeLaPrise(exportDeLaSource, { ...SOURCE, moi: undefined })).not.toHaveProperty("captures");
  });
});
