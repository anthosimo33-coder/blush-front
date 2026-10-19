import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { ReactElement } from "react";
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
import { POST as postImport } from "@/app/api/import/route";
import { GET as getRepere } from "@/app/api/tournage/repere/route";
import PageExportTournage from "@/app/importer/export/tournage/page";
import PageTournage from "@/app/tournage/page";
import { GET as getLien } from "@/app/tournage/[cle]/route";
import { POST as postFin } from "@/app/tournage/fin/route";
import { CASE_IMPORT } from "@/contenu/consentements";
import { nomDuCookie, NOMS_DU_TOURNAGE } from "@/lib/noms-cookies";
import { mentionne, renommer } from "@/lib/renommer";
import type { Utilisateur } from "@/server/auth";
import { ouvrirSession } from "@/server/auth";
import { soldeDe } from "@/server/bulles";
import * as coffre from "@/server/coffre";
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
  nomPourLaCreatrice,
  prenomDuLien,
  rappelDuTournage,
  renommerLesPrises,
  tournageDe,
  tournageDeLaCle,
  tournagesAffiches,
  type Tournage,
} from "@/server/tournage";
import { STORY_COOKIE } from "@/services/session";
import nextConfig from "../next.config";
import { compteDeTest, convPrete, convRattachee, facticePourChaqueTest, histoireLue, ligneEnBase } from "./aide/fixtures";

const SESSION = nomDuCookie("session", false);
const TOURNAGE = nomDuCookie("tournage", false);
const PRENOM = nomDuCookie("prenomDuTournage", false);
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
    .lien!.split("/")
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

  it("« Quitter » depuis « Mon compte » y revient ; tout autre retour demandé mène à l’accueil", async () => {
    const quitter = async (retour: string) => {
      etat.cookies.clear();
      etat.cookies.set(TOURNAGE, cle);
      const fd = new FormData();
      fd.append("retour", retour);
      const fin = await postFin(requete("/tournage/fin", { method: "POST", body: fd }));
      expect(etat.cookies.has(TOURNAGE)).toBe(false);
      return [fin.status, fin.headers.get("location")];
    };
    expect(await quitter("/compte")).toEqual([303, "/compte"]);
    for (const ailleurs of ["https://ailleurs.test", "//ailleurs.test", "/admin", "/compte/../admin", ""]) expect(await quitter(ailleurs)).toEqual([303, "/"]);
  });
});

describe("le rappel du mode tournage, dans « Mon compte »", () => {
  it("nomme le lien de ce navigateur, à tous (créatrices comprises) ; un lien arrêté le dit ; sans cookie ni prise, rien", async () => {
    const t = await creerTournage({ conv: source, nom: "G · Le rappel", par: equipe });
    if (!("id" in t)) throw new Error("conv de tournage refusée");
    const cleG = await cleDe(t.id);
    const mila = await compteDeTest("tournage-mila");
    await navigateur(mila);
    expect(await rappelDuTournage()).toBeNull();
    await navigateur(mila, cleG);
    expect(await rappelDuTournage()).toEqual({ sur: "telephone", nom: "G · Le rappel" });
    /* Sans compte aussi (la page demande la connexion, mais le rappel ne dépend pas d’elle) */
    etat.cookies.delete(SESSION);
    expect(await rappelDuTournage()).toEqual({ sur: "telephone", nom: "G · Le rappel" });
    await arreterTournage(t.id);
    expect(await rappelDuTournage()).toEqual({ sur: "telephone", nom: null });
    etat.cookies.set(TOURNAGE, "x".repeat(43));
    expect(await rappelDuTournage()).toEqual({ sur: "telephone", nom: null });
  });

  it("sans cookie, le compte qui a fait une prise : ses vraies lectures sont refusées, jusqu’à ce qu’il quitte le mode", async () => {
    const lou = await compteDeTest("tournage-lou");
    await navigateur(lou, cle);
    await prise();
    etat.cookies.delete(TOURNAGE);
    expect(await rappelDuTournage()).toEqual({ sur: "compte" });
    await postFin(requete("/tournage/fin", { method: "POST" }));
    expect(await rappelDuTournage()).toBeNull();
    /* Un compte sans prise (celui de l’équipe, qui a lu la conv de la campagne) : pas de rappel sans le cookie */
    await navigateur(equipe);
    expect(await rappelDuTournage()).toBeNull();
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
    /*
     * Le verdict, le rapport et la mémoire de la source, avec le prénom de la créatrice là où le modèle avait écrit celui
     * de la source (renommer) ; le vocal, octet pour octet s’il ne dit pas l’ancien prénom, sinon pas de vocal
     */
    const ancien = personnesDe(metaDe(await ligneEnBase(source))).moi.prenom;
    expect(ancien).not.toBe("Kelly");
    const prenomAncien = new RegExp(`(?<![\\p{L}])${ancien}(?![\\p{L}])`, "u");
    const donnees = async (table: typeof schema.verdicts | typeof schema.reports | typeof schema.memories | typeof schema.vocals, storyId: string) =>
      (await db().select().from(table).where(eq(table.storyId, storyId)))[0] as { data: Buffer } | undefined;
    /* Les colonnes de la source où le modèle avait écrit l’ancien prénom : la mémoire du modèle factice, au moins */
    const renommees: string[] = [];
    for (const [colonne, table] of [
      ["verdicts.data", schema.verdicts],
      ["reports.data", schema.reports],
      ["memories.data", schema.memories],
    ] as const) {
      const [a, b] = [await donnees(table, source), await donnees(table, id)];
      expect(b, "une table recopiée").toBeDefined();
      const recopie = coffre.lire(colonne, b!.data);
      expect(recopie).toEqual(renommer(coffre.lire(colonne, a!.data), ancien, "Kelly"));
      expect(JSON.stringify(recopie)).not.toMatch(prenomAncien);
      if (prenomAncien.test(JSON.stringify(coffre.lire(colonne, a!.data)))) renommees.push(colonne);
    }
    expect(renommees).toContain("memories.data");
    const [vocalSource, vocalPrise] = [await donnees(schema.vocals, source), await donnees(schema.vocals, id)];
    const ditLAncien = prenomAncien.test(JSON.stringify(coffre.lire("vocals.data", vocalSource!.data)));
    if (ditLAncien) expect(vocalPrise).toBeUndefined();
    else expect(Buffer.compare(Buffer.from(vocalPrise!.data), Buffer.from(vocalSource!.data))).toBe(0);
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
    /* Sa lecture est déjà finie : l’écran qui vient de la lancer la déroule lui-même (src/app/lecture/suivi.ts) */
    expect(await (await getAnalyse()).json()).toMatchObject({ done: true, progress: 1, rejouee: true });
    expect(appels.length).toBe(avant);
  });

  it("une nouvelle prise remplace la précédente, sans redonner les bulles", async () => {
    await navigateur(kelly, cle);
    /* Sa prise d’un test d’avant, ou une à elle : le test passe seul comme dans n’importe quel ordre */
    const premiere = (await db().select({ id: schema.stories.id }).from(schema.stories).where(eq(schema.stories.userId, kelly.id)))[0]?.id ?? (await prise());
    const seconde = await prise();
    const restent = await db().select({ id: schema.stories.id }).from(schema.stories).where(eq(schema.stories.userId, kelly.id));
    expect(restent.map((s) => s.id)).toEqual([seconde]);
    expect(premiere).not.toBe(seconde);
    expect(await db().select().from(schema.effacements).where(eq(schema.effacements.cible, premiere))).toHaveLength(1);
    expect(await soldeDe(kelly.id)).toBe(BULLES_DU_TOURNAGE);
  });

  it("la chaîne ne lance jamais le modèle pour une prise, même une étape qu’elle croirait à refaire", async () => {
    await navigateur(kelly, cle);
    const id = (await db().select({ id: schema.stories.id }).from(schema.stories).where(eq(schema.stories.userId, kelly.id)))[0]?.id ?? (await prise());
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

  /* Le prénom de la créatrice de la source, et le vocal d’une conv dont la première ligne le dit */
  const ancienPrenom = async () => personnesDe(metaDe(await ligneEnBase(source))).moi.prenom;
  const vocalDe = async (storyId: string) => (await db().select().from(schema.vocals).where(eq(schema.vocals.storyId, storyId)))[0];
  const vocalQuiDit = async (storyId: string, prenom: string) => {
    const lu = coffre.lire("vocals.data", (await vocalDe(storyId))!.data);
    return coffre.ecrire("vocals.data", { ...lu, lignes: lu.lignes.map((l, k) => (k ? l : { ...l, texte: `${prenom}. ${l.texte}` })) });
  };

  it("le vocal de la source dit son prénom : la prise n’en garde pas, la chaîne lui en refait un, et sa prise suivante le reprend", async () => {
    const nina = await compteDeTest("tournage-nina");
    const ancien = await ancienPrenom();
    const vocalSource = (await vocalDe(source))!.data;
    await db()
      .update(schema.vocals)
      .set({ data: await vocalQuiDit(source, ancien) })
      .where(eq(schema.vocals.storyId, source));
    try {
      await navigateur(nina, cle);
      const apres = etat.apres.length;
      const id = await prise();
      expect(await vocalDe(id)).toBeUndefined();
      /* Planifié, et lancé après la réponse : il se fait pendant la relecture */
      expect((await etatDesTaches(id, ["vocal"])).vocal).toMatchObject({ status: "attente" });
      expect(etat.apres.length).toBe(apres + 1);
      const avant = appels.length;
      await executerChaine(id);
      /* Le script du vocal seul passe au modèle, sur la lecture déjà renommée */
      expect(appels.length).toBe(avant + 1);
      const refait = (await vocalDe(id))!;
      expect(mentionne(coffre.lire("vocals.data", refait.data), ancien)).toBe(false);
      const seconde = await prise();
      expect(Buffer.compare(Buffer.from((await vocalDe(seconde))!.data), Buffer.from(refait.data))).toBe(0);
      expect((await etatDesTaches(seconde, ["vocal"])).vocal).toMatchObject({ status: "fini" });
      expect(appels.length).toBe(avant + 1);
    } finally {
      await db().update(schema.vocals).set({ data: vocalSource }).where(eq(schema.vocals.storyId, source));
    }
  });

  it("une prise rejouée avant le renommage : le passage des 5 minutes lui donne son prénom et lui refait son vocal, une fois", async () => {
    const zoe = await compteDeTest("tournage-zoe");
    await navigateur(zoe, cle);
    const id = await prise();
    const ancien = await ancienPrenom();
    /* Comme rejouer la laissait avant le 16 octobre : la lecture de la source telle quelle, et son vocal qui dit l’ancien prénom */
    const [v] = await db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, source));
    const [r] = await db().select().from(schema.reports).where(eq(schema.reports.storyId, source));
    const [m] = await db().select().from(schema.memories).where(eq(schema.memories.storyId, source));
    await db().update(schema.verdicts).set({ data: v!.data }).where(eq(schema.verdicts.storyId, id));
    await db().update(schema.reports).set({ plan: r!.plan, data: r!.data }).where(eq(schema.reports.storyId, id));
    await db().update(schema.memories).set({ data: m!.data }).where(eq(schema.memories.storyId, id));
    await db()
      .update(schema.vocals)
      .set({ data: await vocalQuiDit(id, ancien) })
      .where(eq(schema.vocals.storyId, id));
    const avant = appels.length;
    expect(await renommerLesPrises()).toBeGreaterThanOrEqual(1);
    const memoire = async () => coffre.lire("memories.data", (await db().select().from(schema.memories).where(eq(schema.memories.storyId, id)))[0]!.data);
    expect(await memoire()).toEqual(renommer(coffre.lire("memories.data", m!.data), ancien, "Kelly"));
    expect(mentionne(await memoire(), ancien)).toBe(false);
    /* Son vocal part, et la chaîne en planifie un autre (le cron, lui, n’appelle pas le modèle) */
    expect(await vocalDe(id)).toBeUndefined();
    expect((await etatDesTaches(id, ["vocal"])).vocal).toMatchObject({ status: "attente" });
    expect(appels.length).toBe(avant);
    /* Le passage suivant n’y change plus rien */
    const lue = (await db().select().from(schema.memories).where(eq(schema.memories.storyId, id)))[0]!.data;
    await renommerLesPrises();
    expect(Buffer.compare(Buffer.from((await db().select().from(schema.memories).where(eq(schema.memories.storyId, id)))[0]!.data), Buffer.from(lue))).toBe(0);
    expect((await etatDesTaches(id, ["vocal"])).vocal).toMatchObject({ status: "attente" });
  });

  it("une prise que rejouer avait laissée sans vocal (sa tâche recopiée, finie) : le passage des 5 minutes le fait refaire", async () => {
    const lou = await compteDeTest("tournage-lou");
    await navigateur(lou, cle);
    const id = await prise();
    await db().delete(schema.vocals).where(eq(schema.vocals.storyId, id));
    expect((await etatDesTaches(id, ["vocal"])).vocal).toMatchObject({ status: "fini" });
    expect(await renommerLesPrises()).toBeGreaterThanOrEqual(1);
    expect((await etatDesTaches(id, ["vocal"])).vocal).toMatchObject({ status: "attente" });
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

describe("l’export sans fichier", () => {
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
  /** « Choisir le fichier enregistré » en mode tournage, comme ExportScreen : l’accord et l’appli choisie, aucun fichier. */
  const exporter = (app = "whatsapp", agent = IPHONE) => {
    const fd = new FormData();
    fd.append("consentement", CASE_IMPORT.version);
    fd.append("tournage", app);
    return postImport(requete("/api/import", { method: "POST", body: fd, headers: { "user-agent": agent } }));
  };
  type Importe = { story: { id: string; participants: { name: string }[] }; source: { mode: string; fileName: string; messageCount: number } };
  const brouillon = async (r: Response) => {
    expect(r.status).toBe(200);
    const corps = (await r.json()) as Importe;
    brouillons.push(corps.story.id);
    return corps;
  };
  /** Le lien de la conv de tournage (`la`, celui de `cle` par défaut) ouvert sur un navigateur neuf, avec ou sans le prénom de la créatrice. */
  const ouvrirLeLien = async (prenom?: string, la = cle) => {
    etat.cookies.clear();
    const r = await getLien(requete(`/tournage/${la}${prenom == null ? "" : `?prenom=${encodeURIComponent(prenom)}`}`), { params: Promise.resolve({ cle: la }) });
    expect(r.status).toBe(307);
  };
  /** Les prénoms de la conv de tournage, celui de sa créatrice remplacé par `prenom` (aucun : tels quels), et sa place. */
  const prenomsDeLaSource = async (prenom?: string) => {
    const meta = metaDe(await ligneEnBase(source));
    const k = meta.moi!;
    const prenoms = meta.participants.map((p) => p.prenom);
    if (prenom) prenoms[k] = prenom;
    return { prenoms, k, meta };
  };

  it("prend la conv du lien sans rien lire : ses deux personnes, la créatrice sous le prénom de son lien, ses chiffres, un nom de fichier WhatsApp", async () => {
    await ouvrirLeLien("Juliette");
    expect(etat.cookies.get(PRENOM)).toBe("Juliette");
    const avant = appels.length;
    const { story, source: src } = await brouillon(await exporter());
    expect(appels.length).toBe(avant);
    const { prenoms, meta } = await prenomsDeLaSource("Juliette");
    expect(meta.participants.map((p) => p.prenom)).not.toContain("Juliette");
    expect(story.participants.map((p) => p.name)).toEqual(prenoms);
    expect(src).toEqual(expect.objectContaining({ mode: "export", fileName: `WhatsApp Chat - ${personnesDe(meta).autre.nom}.zip`, messageCount: meta.resume.total }));
    const ligne = await ligneEnBase(story.id);
    expect(ligne).toMatchObject({ tournageId: tournage.id, tournageLe: null, conv: null, userId: null, messageCount: (await ligneEnBase(source)).messageCount });
    /* Comme un export qu’on vient d’importer : « Qui es-tu ? » reste à remplir */
    expect(metaDe(ligne)).toEqual({
      appli: "whatsapp",
      format: meta.format,
      fichier: src.fileName,
      participants: expect.any(Array) as unknown,
      resume: meta.resume,
      ...(meta.coupe ? { coupe: true } : {}),
    });
  });

  it("sa lecture se rejoue sous ce prénom, sans modèle", async () => {
    const juliette = await compteDeTest("tournage-juliette");
    await ouvrirLeLien("Juliette");
    etat.cookies.set(SESSION, (await ouvrirSession(juliette.id)).secret);
    const { story, source: src } = await brouillon(await exporter());
    const { k, meta } = await prenomsDeLaSource();
    const avant = appels.length;
    expect((await lancer({ me: `p${k}`, pronom: "elle", guess: "vus", goal: "ensemble" })).status).toBe(200);
    expect(appels.length).toBe(avant);
    const ligne = await ligneEnBase(story.id);
    expect(ligne).toMatchObject({ userId: juliette.id, tournageId: tournage.id, conv: null });
    expect(ligne.tournageLe).toBeInstanceOf(Date);
    const prise = metaDe(ligne);
    expect(personnesDe(prise).moi.prenom).toBe("Juliette");
    expect(personnesDe(prise).autre).toEqual(personnesDe(meta).autre);
    expect(prise).toMatchObject({ appli: "whatsapp", format: meta.format, fichier: src.fileName, moi: k });
    expect(prise).not.toHaveProperty("captures");
    /* Ce que le modèle avait écrit pour la créatrice de la source prend son prénom */
    const memoire = coffre.lire("memories.data", (await db().select().from(schema.memories).where(eq(schema.memories.storyId, story.id)))[0]!.data);
    expect(mentionne(memoire, personnesDe(meta).moi.prenom)).toBe(false);
    expect(await soldeDe(juliette.id)).toBe(BULLES_DU_TOURNAGE);
  });

  it("un lien sans prénom : celui de sa dernière prise si elle est connectée, sinon celui de la conv de tournage", async () => {
    const mia = await compteDeTest("tournage-mia");
    const { k } = await prenomsDeLaSource();
    /* Sa première prise, depuis un lien qui portait son prénom */
    await ouvrirLeLien("Mia");
    etat.cookies.set(SESSION, (await ouvrirSession(mia.id)).secret);
    await brouillon(await exporter());
    expect((await lancer({ me: `p${k}`, pronom: "elle", guess: "vus", goal: "ensemble" })).status).toBe(200);
    /* Puis un lien sans prénom, connectée : son prénom revient */
    await ouvrirLeLien();
    etat.cookies.set(SESSION, (await ouvrirSession(mia.id)).secret);
    expect((await brouillon(await exporter())).story.participants.map((p) => p.name)).toEqual((await prenomsDeLaSource("Mia")).prenoms);
    /* Sans compte ni prénom : la conv de tournage telle qu’elle est */
    await ouvrirLeLien();
    expect((await brouillon(await exporter())).story.participants.map((p) => p.name)).toEqual((await prenomsDeLaSource()).prenoms);
  });

  it("le nom du fichier suit le téléphone et l’appli choisie à l’écran", async () => {
    await ouvrirLeLien("Juliette");
    const { meta } = await prenomsDeLaSource();
    expect((await brouillon(await exporter("whatsapp", ANDROID))).source.fileName).toBe(`Discussion WhatsApp avec ${personnesDe(meta).autre.nom}.txt`);
    const insta = await brouillon(await exporter("instagram"));
    expect(insta.source.fileName).toMatch(/^instagram-juliette-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(metaDe(await ligneEnBase(insta.story.id)).appli).toBe("instagram");
  });

  it("hors du mode tournage, rien ne change (sans fichier : 422) ; son lien arrêté depuis l’ouverture de l’écran : 409, sans brouillon", async () => {
    etat.cookies.clear();
    const sans = await exporter();
    expect([sans.status, await sans.json()]).toEqual([422, { erreur: "fichier" }]);
    /* Une appli qui ne s’exporte pas */
    await ouvrirLeLien("Juliette");
    expect((await exporter("imessage")).status).toBe(422);
    /* Sans l’accord de l’import, rien n’est fait */
    const fd = new FormData();
    fd.append("tournage", "whatsapp");
    const accord = await postImport(requete("/api/import", { method: "POST", body: fd }));
    expect([accord.status, await accord.json()]).toEqual([422, { erreur: "consentement" }]);
    /* Le lien arrêté entre l’ouverture de l’écran et le bouton */
    const t = await creerTournage({ conv: source, nom: "F · Arrêtée", par: equipe });
    if (!("id" in t)) throw new Error("conv de tournage refusée");
    await ouvrirLeLien("Juliette", await cleDe(t.id));
    expect(await arreterTournage(t.id)).toBe(true);
    const arretee = await exporter();
    expect([arretee.status, await arretee.json()]).toEqual([409, { erreur: "tournage" }]);
    expect(etat.cookies.has(nomDuCookie("brouillon", false))).toBe(false);
  });

  it("le lien garde le prénom qu’il porte, s’il en est un ; sans, celui d’avant ; un lien faux et « Quitter » l’effacent", async () => {
    expect(["Juliette", "Marie-Lou", "Léa", "  Anne   Sophie ", "N’Dey"].map((p) => prenomDuLien(p))).toEqual(["Juliette", "Marie-Lou", "Léa", "Anne Sophie", "N’Dey"]);
    expect(["", " ", "<b>Kelly</b>", "Kelly2", "-Kelly", "a".repeat(41), null].map((p) => prenomDuLien(p))).toEqual(Array(7).fill(null));
    await ouvrirLeLien("Juliette");
    await getLien(requete(`/tournage/${cle}`), { params: Promise.resolve({ cle }) });
    await getLien(requete(`/tournage/${cle}?prenom=%3Cb%3E`), { params: Promise.resolve({ cle }) });
    expect([etat.cookies.get(TOURNAGE), etat.cookies.get(PRENOM)]).toEqual([cle, "Juliette"]);
    await getLien(requete("/tournage/faux?prenom=Kelly"), { params: Promise.resolve({ cle: "faux" }) });
    expect([etat.cookies.has(TOURNAGE), etat.cookies.has(PRENOM)]).toEqual([false, false]);
    await ouvrirLeLien("Juliette");
    await postFin(requete("/tournage/fin", { method: "POST" }));
    expect([etat.cookies.has(TOURNAGE), etat.cookies.has(PRENOM)]).toEqual([false, false]);
  });

  it("l’écran de l’export : sa variante est servie à la même adresse sous le cookie du mode tournage, et vérifie son lien", async () => {
    const reecritures = await nextConfig.rewrites!();
    const avantLesPages = Array.isArray(reecritures) ? reecritures : reecritures.beforeFiles;
    for (const key of NOMS_DU_TOURNAGE)
      expect(avantLesPages).toContainEqual({ source: "/importer/export", has: [{ type: "cookie", key }], destination: "/importer/export/tournage" });
    const variante = async () => ((await PageExportTournage()) as ReactElement<{ children: ReactElement<{ tournage: boolean }> }>).props.children.props.tournage;
    await ouvrirLeLien();
    expect(await variante()).toBe(true);
    /* Le cookie d’un lien arrêté (ou faux) : l’écran de tout le monde */
    etat.cookies.set(TOURNAGE, "x".repeat(43));
    expect(await variante()).toBe(false);
  });
});

describe("une conv de tournage arrêtée, ou effacée", () => {
  it("arrêtée : son lien ne pose plus rien et de nouvelles captures ne sont pas lues (409) ; un brouillon déjà fait se lit encore", async () => {
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
    /* De nouvelles captures, avec ce lien arrêté : rien n’est lu, qu’elle rouvre le nouveau lien (lecturePayeeRefusee) */
    const lues = await captures();
    expect([lues.status, await lues.json()]).toEqual([409, { erreur: "tournage" }]);
    expect(appels.length).toBe(avant);
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

describe("le nom du lien, sur la page de la créatrice", () => {
  it("perd le prénom de la créatrice dont le fichier a été lu, ou prend le sien ; sans le sien, ne s’affiche pas plutôt que de le montrer", () => {
    expect(nomPourLaCreatrice("Léa · A1 · Le vu de minuit", "Léa", "Nina")).toBe("A1 · Le vu de minuit");
    expect(nomPourLaCreatrice("Léa · A1 · Le vu de minuit", "Léa", null)).toBe("A1 · Le vu de minuit");
    expect(nomPourLaCreatrice("LÉA · C1 · Tu recommences", "Léa", null)).toBe("C1 · Tu recommences");
    expect(nomPourLaCreatrice("C1 · La dispute de Léa", "Léa", "Zoé")).toBe("C1 · La dispute de Zoé");
    expect(nomPourLaCreatrice("C1 · La dispute de Léa", "Léa", null)).toBe("");
    expect(nomPourLaCreatrice("Léa", "Léa", null)).toBe("");
    /* Un nom sans elle, ou une source sans prénom (des captures : « Moi ») : tel quel */
    expect(nomPourLaCreatrice("A · Il répond plus pareil", "Léa", "Zoé")).toBe("A · Il répond plus pareil");
    expect(nomPourLaCreatrice("Léandre · A1", "Léa", null)).toBe("Léandre · A1");
    expect(nomPourLaCreatrice("Moi · A1", "Moi", null)).toBe("Moi · A1");
    expect(nomPourLaCreatrice("Léa · A1", null, null)).toBe("Léa · A1");
  });

  it("un lien partagé, nommé au prénom de la source : chaque créatrice lit le nom de l’histoire, et le sien s’il est connu", async () => {
    const { participants, moi } = metaDe(await ligneEnBase(source));
    const lue = participants[moi!]!.prenom;
    const t = await creerTournage({ conv: source, nom: `${lue} · A1 · Le vu de minuit`, par: equipe });
    if (!("id" in t)) throw new Error("conv de tournage refusée");
    const cleA = await cleDe(t.id);
    /** Ce que la page /tournage montre à ce navigateur, après le lien (avec ou sans `?prenom=`). */
    const page = async (prenom?: string) => {
      etat.cookies.clear();
      await getLien(requete(`/tournage/${cleA}${prenom ? `?prenom=${prenom}` : ""}`), { params: Promise.resolve({ cle: cleA }) });
      return ((await PageTournage()) as ReactElement<{ nom: string | null; prenom: string | null }>).props;
    };
    expect(await page("Nina")).toEqual({ nom: "A1 · Le vu de minuit", prenom: "Nina" });
    expect(await page()).toEqual({ nom: "A1 · Le vu de minuit", prenom: null });
    /* L’équipe, elle, garde le nom entier dans /admin et sur son repère */
    expect((await tournageDe(t.id))?.nom).toBe(`${lue} · A1 · Le vu de minuit`);
    /* Sans mode tournage : la page dit que le lien ne marche plus */
    await arreterTournage(t.id);
    expect(await page()).toEqual({ nom: null, prenom: null });
  });
});

describe("le repère du mode tournage, pour l’équipe seulement", () => {
  /** Ce que GET /api/tournage/repere répond à ce navigateur (etat.cookies). */
  const repere = async () => (await (await getRepere()).json()) as { nom: string | null };

  it("nomme le lien d’un navigateur en mode tournage, pour un compte de BLUSH_ADMINS", async () => {
    etat.admins.add(equipe.email);
    try {
      await navigateur(equipe, cle);
      const r = await getRepere();
      expect([r.status, r.headers.get("cache-control")]).toEqual([200, "no-store"]);
      expect(await r.json()).toEqual({ nom: "A · Il répond plus pareil" });
    } finally {
      etat.admins.clear();
    }
  });

  it("ne dit rien à une créatrice ni à un visiteur sans compte, qui filment ces écrans : la même réponse que sans le mode", async () => {
    const lina = await compteDeTest("tournage-lina");
    await navigateur(lina, cle);
    expect(await repere()).toEqual({ nom: null });
    etat.cookies.clear();
    etat.cookies.set(TOURNAGE, cle);
    expect(await repere()).toEqual({ nom: null });
  });

  it("ne dit rien à l’équipe hors du mode tournage : sans le cookie, un cookie faux, ou le lien arrêté", async () => {
    const t = await creerTournage({ conv: source, nom: "F · Le repère arrêté", par: equipe });
    if (!("id" in t)) throw new Error("conv de tournage refusée");
    const cleF = await cleDe(t.id);
    etat.admins.add(equipe.email);
    try {
      await navigateur(equipe);
      expect(await repere()).toEqual({ nom: null });
      await navigateur(equipe, "x".repeat(43));
      expect(await repere()).toEqual({ nom: null });
      await navigateur(equipe, cleF);
      expect(await repere()).toEqual({ nom: "F · Le repère arrêté" });
      await arreterTournage(t.id);
      expect(await repere()).toEqual({ nom: null });
    } finally {
      etat.admins.clear();
    }
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
