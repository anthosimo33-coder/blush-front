import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * La lecture partielle des longues vidéos (src/server/lecture-partielle.ts, ecrans-gardes.ts, suite-video.ts), avec la
 * base, par ses routes appelées comme le ferait le navigateur (cookies simulés), puis la suite lue après le paiement. Le
 * modèle reste factice : pour les lots (prompt 01), un faux qui lit dans chaque image le numéro de son écran et rend six
 * messages à lui, datés (douze écrans par jour : une conv dense, que la règle arrête au premier tour). Deux lots voisins
 * partagent un écran, comme ceux du navigateur. Chaque test filme sa vidéo à lui (sa série d’écrans). Aucun appel ne sort.
 * L’interrupteur (BLUSH_LECTURE_PARTIELLE) est celui du test (`etat.mode`, « ab » par défaut).
 */
const etat = vi.hoisted(() => ({ cookies: new Map<string, string>(), mode: "ab" as "0" | "mesure" | "ab" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (etat.cookies.has(n) ? { name: n, value: etat.cookies.get(n)! } : undefined),
    has: (n: string) => etat.cookies.has(n),
    set: (n: string, v: string) => etat.cookies.set(n, v),
    delete: (n: string | { name: string }) => etat.cookies.delete(typeof n === "string" ? n : n.name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("@/server/env", async (original) => {
  const o = await original<typeof import("@/server/env")>();
  return { ...o, env: () => ({ ...o.env(), BLUSH_LECTURE_PARTIELLE: etat.mode }) };
});
/* Les alertes de l’équipe, relevées au lieu de partir */
const alertes = vi.hoisted(() => [] as string[]);
vi.mock("@/server/alertes", async (original) => ({ ...(await original<typeof import("@/server/alertes")>()), alerter: async (sujet: string) => void alertes.push(sujet) }));

import type { Requete } from "@prompts/lib/contextes";
import type { Captures } from "@prompts/lib/schemas";
import { POST as postEcrans } from "@/app/api/captures/ecrans/route";
import { POST as postAbandon } from "@/app/api/captures/lot/abandon/route";
import { POST as postLot } from "@/app/api/captures/lot/route";
import { POST as postPlan } from "@/app/api/captures/video/plan/route";
import { POST as postVideo } from "@/app/api/captures/video/route";
import { CASE_IMPORT } from "@/contenu/consentements";
import { ecrireLeContexte } from "@/server/analyse";
import { ouvrirSession, type Utilisateur } from "@/server/auth";
import { empreinte } from "@/server/chiffrement";
import * as coffre from "@/server/coffre";
import { db, schema } from "@/server/db";
import { garderJusquALaLecture, purgerLesEcrans } from "@/server/ecrans-gardes";
import { contexteDe, definirQui, metaDe, rattacherBrouillon, supprimerHistoire } from "@/server/histoires";
import { fournisseurFactice, refusFactice } from "@/server/ia/factice";
import { envoiDe } from "@/server/imports";
import { brasDe } from "@/server/lecture-partielle";
import { LIMITES } from "@/server/limites";
import { executerChaine, lancerApresPaiement } from "@/server/pipeline";
import { statsAdmin, type Pilotage } from "@/server/stats";
import { lireLaSuite } from "@/server/suite-video";
import { attendreLePaiement } from "@/server/taches";
import { aujourdhuiParis } from "@/server/temps";
import type { BrasDeLaLecture } from "@/types";
import { captures, msg } from "./aide/fabriques";
import { compteDeTest, debloquerLaConv, facticePourChaqueTest, ligneEnBase } from "./aide/fixtures";
import { creees } from "./aide/nettoyage";

const debut = new Date();
const n = Date.now();
let ip = 0;
/** Une requête du navigateur : même origine, une adresse IP à elle (les limites par IP ne se mélangent pas d’un test à l’autre). */
const requete = (chemin: string, init: RequestInit) =>
  new Request(`http://localhost${chemin}`, {
    ...init,
    headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "x-forwarded-for": `14.${n % 250}.${(n >> 8) % 250}.${++ip % 250}`, ...init.headers },
  });
const json = (corps: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) });

/* ———— La vidéo filmée ———— */

/** Les lots d’une longue vidéo : huit de douze écrans, chacun reprenant le dernier écran du précédent (89 écrans). */
const LOTS = 8;
const ECRANS = 11 * LOTS + 1;
const ecransDuLot = (j: number) => Array.from({ length: 12 }, (_, i) => 11 * j + i);

/** Un écran filmé : une image PNG (d’après sa signature) qui porte sa série et son numéro, ce que le faux modèle y lit. */
const ecran = (serie: string, k: number) => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47]), `ecran:${serie}:${k}`], "ecran.png", { type: "image/png" });
/** Le numéro de l’écran d’une image envoyée au modèle. */
const numeroDe = (base64: string) => Number(Buffer.from(base64, "base64").subarray(4).toString().split(":")[2]);

/** Le jour d’un écran : douze écrans par jour, à partir du 1er octobre 2026, un repère par écran (son heure). */
const jourDe = (k: number) => new Date(Date.UTC(2026, 9, 1) + Math.floor(k / 12) * 86400e3).toISOString().slice(0, 10);

/** Ce que le faux modèle lit d’un lot : une capture par écran, et six messages par écran, datés de son repère. */
function lecture(ecrans: number[]): Captures {
  return captures({
    appli: "imessage",
    autre: "Léa",
    captures: ecrans.map((_, i) => ({ numero: i + 1, place: i + 1, hors_sujet: false })),
    blocs: ecrans.map((k) => ({
      repere: { date: jourDe(k), heure: `${String(8 + (k % 12)).padStart(2, "0")}:00` },
      messages: Array.from({ length: 6 }, (_, j) => msg(j % 2 ? "moi" : "autre", `écran ${k} message ${j} de la conv inventée`)),
    })),
  });
}

/* Ce que le faux modèle a lu : le premier écran de chaque lot (un lot payé), et ce qu’il fait d’un lot (le lire, par défaut) */
const lus: number[] = [];
let lireUnLot: (ecrans: number[]) => unknown = lecture;
beforeEach(() => {
  lireUnLot = lecture;
  etat.mode = "ab";
});
facticePourChaqueTest((req: Requete) => {
  if (req.tache !== "01-captures") return fournisseurFactice(req);
  const ecrans = req.blocs.flatMap((b) => ("image" in b ? [numeroDe(b.image.base64)] : []));
  lus.push(ecrans[0]!);
  return lireUnLot(ecrans);
});

let compte: Utilisateur;
let session = "";
beforeEach(async () => {
  compte ??= await compteDeTest("partielle");
  session ||= (await ouvrirSession(compte.id)).secret;
  etat.cookies.clear();
  etat.cookies.set("blush-session", session);
});

afterAll(async () => {
  await db().delete(schema.imports).where(gte(schema.imports.creeLe, debut));
});

/** Une empreinte de vidéo qui tombe dans cette moitié de l’A/B. */
function videoDe(bras: BrasDeLaLecture): string {
  for (;;) {
    const v = randomUUID();
    if (brasDe(v) === bras) return v;
  }
}

/** Le formulaire d’un lot : ses écrans, son appli, l’accord de l’import, et ce que l’envoi y ajoute. */
function formulaire(serie: string, j: number, champs: Record<string, string>): FormData {
  const fd = new FormData();
  for (const k of ecransDuLot(j)) fd.append("captures", ecran(serie, k));
  fd.append("app", "imessage");
  fd.append("consentement", CASE_IMPORT.version);
  for (const [nom, valeur] of Object.entries(champs)) fd.append(nom, valeur);
  return fd;
}

/** Le lot `j` lu par le serveur (/api/captures/lot), sa lecture brute. */
async function lireLeLot(serie: string, cle: string, j: number): Promise<Captures> {
  const r = await postLot(requete("/api/captures/lot", { method: "POST", body: formulaire(serie, j, { cle }) }));
  expect(r.status).toBe(200);
  return ((await r.json()) as { lot: Captures }).lot;
}

/** Le lot `j` envoyé pour être gardé (/api/captures/ecrans) : le statut. */
const garderLeLot = async (serie: string, cle: string, j: number) =>
  (await postEcrans(requete("/api/captures/ecrans", { method: "POST", body: formulaire(serie, j, { cle, rang: String(j) }) }))).status;

/** La fin d’un envoi (/api/captures/video) : sa réponse lue. */
const fin = async (corps: Record<string, unknown>) => {
  const r = await postVideo(requete("/api/captures/video", json({ app: "imessage", consentement: CASE_IMPORT.version, ...corps })));
  expect(r.status).toBe(200);
  return (await r.json()) as { story?: { id: string }; source?: { suiteVideo?: boolean }; suite?: string; lots?: number; messagesRead?: number };
};
/** Le plan d’une longue vidéo (/api/captures/video/plan). */
const plan = async (video: string, autres: Record<string, unknown> = {}) =>
  (
    (await (await postPlan(requete("/api/captures/video/plan", json({ lots: LOTS, video, sensSur: true, consentement: CASE_IMPORT.version, ...autres })))).json()) as {
      lecture: BrasDeLaLecture;
    }
  ).lecture;

/** Une conv créée : son id, effacée à la fin du fichier. */
const nee = (r: Awaited<ReturnType<typeof fin>>) => {
  expect(r.story?.id).toBeTruthy();
  creees.histoires.push(r.story!.id);
  return r.story!.id;
};

/** La vidéo lue en entier avant l’achat, comme avant : tous ses lots, puis leur fin (la longue vidéo dite). */
async function importEntier(serie: string, video = videoDe("entiere")): Promise<{ id: string; cle: string }> {
  const cle = randomUUID();
  const lots: Captures[] = [];
  for (let j = 0; j < LOTS; j++) lots.push(await lireLeLot(serie, cle, j));
  return { id: nee(await fin({ lots, cle, partiel: { restants: 0, ecrans: ECRANS, video, sensSur: true } })), cle };
}

/**
 * La vidéo lue en partie, comme le navigateur : le plan, ses cinq lots les plus récents, la question (« garder » ses trois
 * plus anciens), leur envoi, puis la fin avec eux. Rend la conv, la clé et le secret de son brouillon.
 */
async function importPartiel(serie: string): Promise<{ id: string; cle: string; secret: string; recents: Captures[]; video: string }> {
  const cle = randomUUID();
  const video = videoDe("partielle");
  expect(await plan(video)).toBe("partielle");
  const recents: Captures[] = [];
  for (let j = LOTS - 1; j >= 3; j--) recents.unshift(await lireLeLot(serie, cle, j));
  const partiel = { restants: 3, ecrans: ECRANS, video, sensSur: true };
  expect(await fin({ lots: recents, cle, partiel })).toEqual({ suite: "garder", lots: 3 });
  for (let j = 0; j < 3; j++) expect(await garderLeLot(serie, cle, j)).toBe(200);
  const creee = await fin({ lots: recents, cle, partiel: { ...partiel, gardes: true } });
  /* L’écran de l’import le dit : la partie récente est lue, le début le sera avec le rapport */
  expect(creee.source?.suiteVideo).toBe(true);
  const id = nee(creee);
  return { id, cle, secret: etat.cookies.get("blush-brouillon")!, recents, video };
}

/** La conv brute d’une histoire, déchiffrée (une conv d’un seul morceau : son texte). */
const convDe = async (id: string) => {
  const l = await ligneEnBase(id);
  return l.conv ? coffre.lire("stories.conv", l.conv) : null;
};
const ecransGardes = (id: string) => db().select().from(schema.ecransGardes).where(eq(schema.ecransGardes.storyId, id)).orderBy(schema.ecransGardes.rang);
const suiteDe = async (id: string) => (await db().select().from(schema.suitesVideo).where(eq(schema.suitesVideo.storyId, id)))[0] ?? null;
const mesureDe = async (id: string) => (await db().select().from(schema.imports).where(eq(schema.imports.storyId, id)))[0];

describe("une longue vidéo lue en deux fois", () => {
  it("la même conv, à l’octet, que lue d’un coup : ses trois lots les plus anciens gardés, puis lus une fois après le paiement ; « Qui es-tu ? » reste", async () => {
    const serie = randomUUID();
    const entiere = await importEntier(serie);
    lus.length = 0;
    const { id } = await importPartiel(serie);
    /* Les lots récents étaient déjà lus (le même lot, ses mêmes images : jamais relu, src/server/lots.ts) */
    expect(lus).toEqual([]);
    /* Avant l’achat : la partie récente seulement, et la suite qui attend, rattachée à la conv, 24 h au plus */
    const avant = metaDe(await ligneEnBase(id));
    const complete = metaDe(await ligneEnBase(entiere.id));
    expect(avant.resume.total).toBeLessThan(complete.resume.total);
    expect([avant.suiteVideo, complete.suiteVideo]).toEqual([true, undefined]);
    const gardes = await ecransGardes(id);
    expect(gardes.map((g) => [g.rang, g.medias.length, !!g.lu])).toEqual([
      [0, 12, false],
      [1, 12, false],
      [2, 12, false],
    ]);
    expect(gardes.every((g) => g.expireLe.getTime() > Date.now() + 23 * 3600e3 && g.expireLe.getTime() < Date.now() + 25 * 3600e3)).toBe(true);
    expect(await suiteDe(id)).toMatchObject({ appli: "imessage", ecrans: ECRANS, lots: 3, payeeLe: null });
    expect(await mesureDe(id)).toMatchObject({ type: "video", bras: "partielle", lots: 5, ecrans: 56, lotsGardes: 3, suite: "attente", contrefactuel: null });
    /* « Qui es-tu ? » rempli (son prénom), puis la suite lue */
    await definirQui(id, { moi: 0, pronom: "il", devinette: "vus", objectif: "comprendre", prenom: "Tom" });
    expect(await lireLaSuite(id)).toBe("lue");
    /* Chaque lot gardé lu une fois, le plus ancien d’abord, seul */
    expect(lus[0]).toBe(0);
    expect([...lus].sort((a, b) => a - b)).toEqual([0, 11, 22]);
    /* La même conv, à l’octet, que la vidéo lue d’un coup */
    const lueDUnCoup = await convDe(entiere.id);
    expect(typeof lueDUnCoup).toBe("string");
    expect(await convDe(id)).toBe(lueDUnCoup);
    const apres = metaDe(await ligneEnBase(id));
    expect(apres.resume).toEqual(complete.resume);
    expect(apres.participants.map((p) => [p.nom, p.messages])).toEqual(complete.participants.map((p) => [p.nom, p.messages]));
    expect([apres.captures, apres.fichier]).toEqual([complete.captures, complete.fichier]);
    expect((await ligneEnBase(id)).messageCount).toBe((await ligneEnBase(entiere.id)).messageCount);
    expect(apres).toMatchObject({ moi: 0, objectif: "comprendre", participants: [{ prenom: "Tom" }, { prenom: complete.participants[1].prenom }] });
    /* La vidéo est entière : sa meta ne dit plus qu’une suite l’attend */
    expect(apres.suiteVideo).toBeUndefined();
    /* Les écrans et la suite effacés ; la mesure le dit */
    expect(await ecransGardes(id)).toEqual([]);
    expect(await suiteDe(id)).toBeNull();
    expect((await mesureDe(id))?.suite).toBe("lue");
    /* Relue (un nouvel essai du verdict) : rien de plus à lire ni à payer */
    expect(await lireLaSuite(id)).toBeNull();
    expect(lus).toHaveLength(3);
  });

  it("le verdict d’une conv payée lit d’abord sa suite : la chaîne écrit sur la vidéo entière, le titre vu au paywall reste", async () => {
    const serie = randomUUID();
    const entiere = await importEntier(serie);
    const { id, secret } = await importPartiel(serie);
    expect(await rattacherBrouillon(compte, secret)).toBe(id);
    await definirQui(id, { moi: 0, pronom: "il", devinette: "vus", objectif: "ensemble", prenom: "Tom" });
    await attendreLePaiement(id, "verdict");
    await ecrireLeContexte(id);
    /* Le titre que le paywall a montré (celui de la partie lue), gardé et noté conv par conv */
    const vu = contexteDe(await ligneEnBase(id))!.accroche!;
    expect((await mesureDe(id))?.titre).toBe(vu);
    /* Le paiement : la suite attend sa lecture 7 jours au plus, puis la chaîne */
    await debloquerLaConv(id);
    expect(await lancerApresPaiement({ id, userId: compte.id })).toBe(true);
    const payee = await suiteDe(id);
    expect(payee?.payeeLe).not.toBeNull();
    expect(payee!.expireLe.getTime()).toBeGreaterThan(Date.now() + 6 * 86400e3);
    await executerChaine(id);
    expect(await db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, id))).toHaveLength(1);
    expect((await ligneEnBase(id)).messageCount).toBe((await ligneEnBase(entiere.id)).messageCount);
    expect(contexteDe(await ligneEnBase(id))?.accroche).toBe(vu);
    expect(await ecransGardes(id)).toEqual([]);
    expect((await mesureDe(id))?.suite).toBe("lue");
    /* Celui de la conv entière se note à part : celui qu’aurait montré la vidéo lue d’un coup */
    await definirQui(entiere.id, { moi: 0, pronom: "il", devinette: "vus", objectif: "ensemble", prenom: "Tom" });
    await ecrireLeContexte(entiere.id);
    expect((await mesureDe(id))?.titreEntier).toBe(contexteDe(await ligneEnBase(entiere.id))!.accroche);
  });

  it("la fin renvoyée après une coupure du réseau retrouve la conv née avec sa suite, sans rien demander ni relire", async () => {
    const { id, cle, recents, video } = await importPartiel(randomUUID());
    lus.length = 0;
    const encore = await fin({ lots: recents, cle, partiel: { restants: 3, ecrans: ECRANS, video, sensSur: true, gardes: true } });
    expect(encore.story?.id).toBe(id);
    expect(encore.suite).toBeUndefined();
    expect(lus).toEqual([]);
    expect(await ecransGardes(id)).toHaveLength(3);
  });
});

describe("les écrans d’un envoi qu’aucune conv ne prend s’effacent tout de suite", () => {
  const abandon = (cle: string) => postAbandon(requete("/api/captures/lot/abandon", json({ cle })));
  const orphelinsDe = (cle: string) =>
    db()
      .select()
      .from(schema.ecransGardes)
      .where(and(eq(schema.ecransGardes.envoi, envoiDe(cle)!), isNull(schema.ecransGardes.storyId)));

  it("l’enregistrement abandonné (la page fermée, un lot en échec) : ses écrans gardés partent, un lot encore en route n’est plus écrit", async () => {
    const serie = randomUUID();
    const cle = randomUUID();
    expect(await garderLeLot(serie, cle, 0)).toBe(200);
    expect(await orphelinsDe(cle)).toHaveLength(1);
    expect((await abandon(cle)).status).toBe(200);
    expect(await orphelinsDe(cle)).toEqual([]);
    expect(await garderLeLot(serie, cle, 1)).toBe(409);
    expect(await orphelinsDe(cle)).toEqual([]);
  });

  it("lue en entier quand même (un envoi raté), ou des lots envoyés puis lus au tour suivant : la conv née, ceux qu’elle ne prend pas s’effacent", async () => {
    const serie = randomUUID();
    /* La moitié partielle lue en entier : ses écrans envoyés pendant la lecture ne servent plus */
    const cle = randomUUID();
    const video = videoDe("partielle");
    const lots: Captures[] = [];
    for (let j = LOTS - 1; j >= 0; j--) lots.unshift(await lireLeLot(serie, cle, j));
    for (let j = 0; j < 3; j++) expect(await garderLeLot(serie, cle, j)).toBe(200);
    const entiere = nee(await fin({ lots, cle, partiel: { restants: 0, ecrans: ECRANS, video, sensSur: true } }));
    expect(await orphelinsDe(cle)).toEqual([]);
    expect(await ecransGardes(entiere)).toEqual([]);
    expect(metaDe(await ligneEnBase(entiere)).suiteVideo).toBeUndefined();
    expect(await mesureDe(entiere)).toMatchObject({ bras: "partielle", lotsGardes: 0, suite: null });
    /* Coupée après un tour de plus : le lot 3, envoyé pendant le premier tour puis lu, ne reste pas sans conv */
    const autre = randomUUID();
    const recents: Captures[] = [];
    for (let j = LOTS - 1; j >= 3; j--) recents.unshift(await lireLeLot(serie, autre, j));
    for (let j = 0; j < 4; j++) expect(await garderLeLot(serie, autre, j)).toBe(200);
    const coupee = nee(await fin({ lots: recents, cle: autre, partiel: { restants: 3, ecrans: ECRANS, video, sensSur: true, gardes: true } }));
    expect((await ecransGardes(coupee)).map((g) => g.rang)).toEqual([0, 1, 2]);
    expect(await orphelinsDe(autre)).toEqual([]);
  });
});

describe("les écrans gardés ne restent pas", () => {
  it("un import non payé efface ses écrans 24 h après, sans les avoir lus ; des écrans sans import partent au bout d’une heure ; la conv effacée les emporte", async () => {
    const { id } = await importPartiel(randomUUID());
    /* Des écrans envoyés pour un import jamais venu */
    const seul = randomUUID();
    expect(await garderLeLot(randomUUID(), seul, 0)).toBe(200);
    const orphelins = () =>
      db()
        .select()
        .from(schema.ecransGardes)
        .where(and(eq(schema.ecransGardes.envoi, envoiDe(seul)!), isNull(schema.ecransGardes.storyId)));
    expect(await orphelins()).toHaveLength(1);
    await purgerLesEcrans(new Date(Date.now() + 61 * 60e3));
    expect(await orphelins()).toEqual([]);
    expect(await ecransGardes(id)).toHaveLength(3);
    lus.length = 0;
    await purgerLesEcrans(new Date(Date.now() + 25 * 3600e3));
    expect(await ecransGardes(id)).toEqual([]);
    expect(await suiteDe(id)).toBeNull();
    /* Jamais lus, la conv reste (sa partie récente) */
    expect(lus).toEqual([]);
    expect(await convDe(id)).not.toBeNull();
    /* Payée ensuite : la suite est perdue, le verdict part sur la partie lue */
    expect(await lireLaSuite(id)).toBe("perdue");
    expect((await mesureDe(id))?.suite).toBe("perdue");
    /* « Supprimer l’histoire » : ses écrans gardés partent avec elle */
    const autre = await importPartiel(randomUUID());
    await supprimerHistoire(autre.id);
    expect(
      await db()
        .select()
        .from(schema.ecransGardes)
        .where(eq(schema.ecransGardes.envoi, envoiDe(autre.cle)!)),
    ).toEqual([]);
  });
});

describe("les écrans gardés ont leurs plafonds", () => {
  it("une suite payée jamais lue s’efface au bout de 7 jours, et l’équipe est prévenue", async () => {
    const { id } = await importPartiel(randomUUID());
    await garderJusquALaLecture(id);
    alertes.length = 0;
    await purgerLesEcrans(new Date(Date.now() + 25 * 3600e3));
    expect(await ecransGardes(id)).toHaveLength(3);
    await purgerLesEcrans(new Date(Date.now() + 8 * 86400e3));
    expect(await ecransGardes(id)).toEqual([]);
    expect(alertes).toEqual(["suites de vidéo payées jamais lues"]);
  });

  it("leurs octets du jour, pour tous : au plafond, un lot de plus est refusé (le navigateur lit alors le reste), et l’équipe est prévenue", async () => {
    const tous = `ecrans:ko:${aujourdhuiParis().iso}`;
    const cles = [tous, `${tous}:alerte:1`].map((c) => empreinte(`limite:${c}`));
    try {
      const fenetre = { windowStart: new Date(), expiresAt: new Date(Date.now() + 86400e3), count: LIMITES.koEcransParJour.max };
      await db()
        .insert(schema.rateLimits)
        .values({ key: cles[0]!, ...fenetre })
        .onConflictDoUpdate({ target: schema.rateLimits.key, set: fenetre });
      alertes.length = 0;
      const cle = randomUUID();
      expect(await garderLeLot(randomUUID(), cle, 0)).toBe(429);
      expect(
        await db()
          .select()
          .from(schema.ecransGardes)
          .where(eq(schema.ecransGardes.envoi, envoiDe(cle)!)),
      ).toEqual([]);
      expect(alertes).toEqual(["écrans gardés : plafond du jour atteint"]);
    } finally {
      await db().delete(schema.rateLimits).where(inArray(schema.rateLimits.key, cles));
    }
  });
});

describe("une panne après le paiement", () => {
  it("se reprend sans payer deux fois un lot : ceux déjà lus restent écrits, seul le lot en panne se relit", async () => {
    const serie = randomUUID();
    const entiere = await importEntier(serie);
    const { id } = await importPartiel(serie);
    await garderJusquALaLecture(id);
    lus.length = 0;
    /* Le lot du milieu tombe en panne, deux fois de suite (un nouvel essai, puis l’étape échoue) */
    lireUnLot = (ecrans) => {
      if (ecrans[0] === 11) throw new Error("panne du prestataire");
      return lecture(ecrans);
    };
    await expect(lireLaSuite(id)).rejects.toMatchObject({ code: "suite_video" });
    expect([...lus].sort((a, b) => a - b)).toEqual([0, 11, 11, 22]);
    expect((await ecransGardes(id)).map((g) => [g.rang, !!g.lu])).toEqual([
      [0, true],
      [1, false],
      [2, true],
    ]);
    /* Le nouvel essai (la chaîne qui relance le verdict) : seul le lot qui manque */
    lireUnLot = lecture;
    lus.length = 0;
    expect(await lireLaSuite(id)).toBe("lue");
    expect(lus).toEqual([11]);
    expect(await convDe(id)).toBe(await convDe(entiere.id));
  });

  it("un lot refusé est sauté, une fois : la suite est incomplète, la conv a un trou", async () => {
    const serie = randomUUID();
    const entiere = await importEntier(serie);
    const { id } = await importPartiel(serie);
    lus.length = 0;
    lireUnLot = (ecrans) => (ecrans[0] === 11 ? refusFactice("cyber") : lecture(ecrans));
    expect(await lireLaSuite(id)).toBe("incomplete");
    expect([...lus].sort((a, b) => a - b)).toEqual([0, 11, 22]);
    expect((await mesureDe(id))?.suite).toBe("incomplete");
    expect((await ligneEnBase(id)).messageCount).toBeLessThan((await ligneEnBase(entiere.id)).messageCount);
    expect(await ecransGardes(id)).toEqual([]);
  });
});

describe("l’A/B et son interrupteur", () => {
  it("l’A/B est stable : la même vidéo a toujours le même plan ; la moitié entière, un sens douteux, un morceau ajouté se lisent en entier", async () => {
    const video = videoDe("partielle");
    expect([await plan(video), await plan(video)]).toEqual(["partielle", "partielle"]);
    expect(await plan(videoDe("entiere"))).toBe("entiere");
    expect(await plan(video, { sensSur: false })).toBe("entiere");
    expect(await plan(video, { mode: "ajout" })).toBe("entiere");
    /* Une courte vidéo (un seul tour de lecteurs) : rien à gagner */
    expect(await plan(video, { lots: 5 })).toBe("entiere");
  });

  it("l’interrupteur coupé : tout se lit avant l’achat, rien n’est gardé, rien ne se mesure ; une suite qui attendait se lit quand même au paiement", async () => {
    const serie = randomUUID();
    const enAttente = await importPartiel(serie);
    etat.mode = "0";
    const video = videoDe("partielle");
    expect(await plan(video)).toBe("entiere");
    const cle = randomUUID();
    const lots: Captures[] = [];
    for (let j = 0; j < LOTS; j++) lots.push(await lireLeLot(serie, cle, j));
    /* La question d’une longue vidéo : tout lire */
    expect(await fin({ lots: lots.slice(3), cle, partiel: { restants: 3, ecrans: ECRANS, video, sensSur: true } })).toEqual({ suite: "lire", lots: 3 });
    expect(await garderLeLot(serie, cle, 0)).toBe(422);
    const id = nee(await fin({ lots, cle, partiel: { restants: 0, ecrans: ECRANS, video, sensSur: true } }));
    expect(await mesureDe(id)).toMatchObject({ bras: null, lotsGardes: 0, suite: null, contrefactuel: null, lotsEpargnables: null });
    expect(await ecransGardes(id)).toEqual([]);
    /* La suite d’avant la coupure se lit toujours */
    expect(await lireLaSuite(enAttente.id)).toBe("lue");
  });

  it("en mesure : tout se lit, et la conv note ce que la lecture partielle aurait changé (le contrefactuel)", async () => {
    etat.mode = "mesure";
    const video = videoDe("partielle");
    expect(await plan(video)).toBe("entiere");
    const { id } = await importEntier(randomUUID(), video);
    expect(await mesureDe(id)).toMatchObject({ bras: null, lots: LOTS, lotsGardes: 0, contrefactuel: "pareil", lotsEpargnables: 3 });
  });
});

describe("/admin compare les deux moitiés", () => {
  /** Ce que /admin dit de la lecture partielle sur 24 h. */
  const lecturePartielle = async (): Promise<Pilotage["lecturePartielle"]> => (await statsAdmin(1)).pilotage.lecturePartielle;

  it("chaque moitié compte ses longues vidéos, ses lots lus et gardés, ses suites ; le contrefactuel compte les vidéos lues en entier", async () => {
    const avant = await lecturePartielle();
    const serie = randomUUID();
    await importEntier(serie);
    const { id } = await importPartiel(serie);
    await lireLaSuite(id);
    const apres = await lecturePartielle();
    const ecart = (bras: BrasDeLaLecture) => {
      const [a, b] = [avant.bras.find((x) => x.bras === bras)!, apres.bras.find((x) => x.bras === bras)!];
      return {
        videos: b.videos - a.videos,
        lots: b.lots - a.lots,
        ecrans: b.ecrans - a.ecrans,
        gardes: b.lotsGardes - a.lotsGardes,
        coupees: b.coupees - a.coupees,
        lues: b.suites.lues - a.suites.lues,
      };
    };
    expect(apres.bras.map((b) => b.bras)).toEqual(["entiere", "partielle"]);
    expect(ecart("entiere")).toEqual({ videos: 1, lots: LOTS, ecrans: ECRANS, gardes: 0, coupees: 0, lues: 0 });
    expect(ecart("partielle")).toEqual({ videos: 1, lots: 5, ecrans: 56, gardes: 3, coupees: 1, lues: 1 });
    expect(apres.contrefactuel.videos - avant.contrefactuel.videos).toBe(1);
    expect(apres.contrefactuel.lotsEpargnables - avant.contrefactuel.lotsEpargnables).toBe(3);
    /* Le temps jusqu’au paywall ne se compte qu’avec une première lecture notée (le modèle factice n’en note pas) */
    expect(apres.bras.every((b) => b.secondesAuPaywall === null || b.secondesAuPaywall >= 0)).toBe(true);
    /* Rien d’autre que des nombres : ni conv, ni identifiant */
    expect(JSON.stringify(apres)).not.toMatch(new RegExp([id, serie].join("|")));
  });
});

afterAll(async () => {
  /* Les écrans d’envois jamais importés de ce fichier (ailleurs, ils s’effacent seuls au bout d’une heure) */
  await db()
    .delete(schema.ecransGardes)
    .where(and(isNull(schema.ecransGardes.storyId), gte(schema.ecransGardes.creeLe, debut)));
});
