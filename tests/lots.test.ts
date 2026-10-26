import { randomUUID } from "node:crypto";
import { APIUserAbortError } from "@anthropic-ai/sdk";
import { and, eq, gte, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Un enregistrement d’écran jamais payé deux fois (src/server/lots.ts) et la mesure des imports (src/server/imports.ts),
 * par leurs routes, appelées comme le ferait le navigateur (cookies simulés). Le modèle factice est éteint : le
 * prestataire est un faux (definirFournisseur), qui coûte (ses lignes d’ai_usage, la dépense du jour de qui paie) et que
 * chaque test règle : ce qu’il reçoit, quand, et de quoi le faire attendre, refuser ou s’arrêter. Aucun appel ne sort.
 * Ce que ce fichier note dans ai_usage, dans la mesure des imports et dans la part sans compte du budget est effacé à la
 * fin : le budget du jour des autres fichiers n’en porte rien. /admin se lit avant et après (la base des tests garde
 * tout d’un lancement à l’autre).
 */
const etat = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
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
  /* iaFactice lit l’env() de son module, pas celui-ci : on le remplace aussi */
  return { ...o, env: () => ({ ...o.env(), BLUSH_IA_FACTICE: false, ANTHROPIC_API_KEY: "cle-fictive" }), iaFactice: () => false };
});

import type { Captures } from "@prompts/lib/schemas";
import { POST as postCaptures } from "@/app/api/captures/route";
import { POST as postAbandon } from "@/app/api/captures/lot/abandon/route";
import { POST as postLot } from "@/app/api/captures/lot/route";
import { POST as postVideo } from "@/app/api/captures/video/route";
import { POST as postImport } from "@/app/api/import/route";
import { CASE_IMPORT } from "@/contenu/consentements";
import { ouvrirSession, type Utilisateur } from "@/server/auth";
import { BUDGET_IA, cleDeDepense, noterDepense, oublierLeBudget } from "@/server/budget";
import { empreinte } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { cleDeLimiteDuCompte } from "@/server/email-canonique";
import { definirFournisseur, type Ecoute, type MessageRecu } from "@/server/ia/claude";
import { envoiDe } from "@/server/imports";
import { compteDe, LIMITES } from "@/server/limites";
import { attendreLePremier, premierLot } from "@/server/lots";
import { purger } from "@/server/purge";
import { statsAdmin, type Pilotage } from "@/server/stats";
import { attendreLePaiement } from "@/server/taches";
import { aujourdhuiParis } from "@/server/temps";
import type { TypeDImport } from "@/types";
import { captures, lotVideo } from "./aide/fabriques";
import { convDeTest } from "./aide/fichiers";
import { compteDeTest } from "./aide/fixtures";
import { creees } from "./aide/nettoyage";

const debut = new Date();
const n = Date.now();
let ip = 0;
/** Une requête du navigateur : même origine, une adresse IP à elle (les limites par IP ne se mélangent pas d’un envoi à l’autre). */
const requete = (chemin: string, init: RequestInit) =>
  new Request(`http://localhost${chemin}`, {
    ...init,
    headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "x-forwarded-for": `13.${n % 250}.${(n >> 8) % 250}.${++ip % 250}`, ...init.headers },
  });

/** Un écran (une image PNG, d’après sa signature), qu’aucun autre ne recopie. */
const ecran = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47]), randomUUID()], "ecran.png", { type: "image/png" });
const ecrans = (k: number) => Array.from({ length: k }, ecran);

/** Le formulaire d’un envoi d’images : ses écrans, son appli, l’accord de l’import, et ce que l’envoi y ajoute. */
function formulaire(images: File[], champs: Record<string, string | undefined>): FormData {
  const fd = new FormData();
  for (const i of images) fd.append("captures", i);
  fd.append("consentement", CASE_IMPORT.version);
  for (const [nom, valeur] of Object.entries(champs)) if (valeur !== undefined) fd.append(nom, valeur);
  return fd;
}
/** Un lot d’enregistrement envoyé : ses écrans, sous la clé de son envoi et son ordre (« premier », « suite »). */
const lot = (images: File[], { cle, ordre, app = "imessage" }: { cle?: string; ordre?: "premier" | "suite"; app?: string } = {}) =>
  postLot(requete("/api/captures/lot", { method: "POST", body: formulaire(images, { app, cle, ordre }) }));
/** La lecture brute que rend un lot (200). */
const luDe = async (r: Response): Promise<Captures> => {
  expect(r.status).toBe(200);
  return ((await r.json()) as { lot: Captures }).lot;
};
/** Une conv créée par une route : son id, effacée à la fin du fichier. */
const conv = async (r: Response): Promise<string> => {
  expect(r.status).toBe(200);
  const { story } = (await r.json()) as { story: { id: string } };
  creees.histoires.push(story.id);
  return story.id;
};
const json = (corps: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) });

/* ———— Le faux prestataire ———— */

/** Un envoi au prestataire : combien d’images il porte, quand, et le signal qui l’arrête. */
type EnvoiRecu = { images: number; le: number; signal: AbortSignal | undefined };
const envois: EnvoiRecu[] = [];
/* Ce que coûte chaque lecture au faux prestataire : 10 000 jetons lus et 2 000 écrits, au tarif de Sonnet (2 $ et 10 $ le million) */
const USAGE = { input_tokens: 10_000, output_tokens: 2_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const COUT_MICROS = 10_000 * 2 + 2_000 * 10;
/** La lecture d’un lot de `images` écrans : une capture par écran, et quinze messages avec Léa à elle (« message 100·images »…). */
const lecture = (images: number): Captures =>
  captures({ ...lotVideo("Léa", images * 100), captures: Array.from({ length: images }, (_, k) => ({ numero: k + 1, place: k + 1, hors_sujet: false })) });
const lue = async (images: number): Promise<MessageRecu> => ({
  content: [{ type: "text", text: JSON.stringify(lecture(images)) }],
  usage: USAGE,
  model: "claude-sonnet-5-5",
  stop_reason: "end_turn",
});
/** Ce que fait le prestataire d’une demande (par défaut, il la lit tout de suite) : chaque test peut le changer. */
let prestataire: (images: number, signal: AbortSignal | undefined, ecoute: Ecoute | null) => Promise<MessageRecu> = lue;
const attendre = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

beforeEach(() => {
  prestataire = lue;
  definirFournisseur({
    envoyer: async ({ requete: r }, { signal }, { ecoute }) => {
      const images = r.blocs.filter((b) => "image" in b).length;
      envois.push({ images, le: Date.now(), signal });
      return prestataire(images, signal, ecoute);
    },
  });
});
afterEach(() => definirFournisseur(null));

let compte: Utilisateur;
let session = "";
beforeAll(async () => {
  compte = await compteDeTest("lots");
  session = (await ouvrirSession(compte.id)).secret;
});
beforeEach(() => {
  etat.cookies.clear();
  etat.cookies.set("blush-session", session);
});

/* La part sans compte du jour : celle que la réservation remplit, effacée avant et après le test qui la lit */
const cleSansCompte = () => cleDeDepense(null, aujourdhuiParis().iso);
const effacerLaPartSansCompte = async () => {
  await db()
    .delete(schema.rateLimits)
    .where(eq(schema.rateLimits.key, empreinte(`limite:${cleSansCompte()}`)));
  oublierLeBudget();
};

afterAll(async () => {
  await db()
    .delete(schema.aiUsage)
    .where(and(gte(schema.aiUsage.createdAt, debut), inArray(schema.aiUsage.task, ["captures", "captures_video"])));
  await db().delete(schema.imports).where(gte(schema.imports.creeLe, debut));
  await effacerLaPartSansCompte();
});

/** Les lignes d’ai_usage de l’envoi de clé `cle` (son empreinte, envoiDe). */
const lignesDe = (cle: string) =>
  db()
    .select()
    .from(schema.aiUsage)
    .where(eq(schema.aiUsage.envoi, envoiDe(cle)!));

describe("un lot d’enregistrement n’est jamais lu deux fois", () => {
  it("le même lot renvoyé (la réponse perdue) revient sans rappeler le modèle ni compter les plafonds ; une autre appli le relit", async () => {
    const cle = randomUUID();
    const images = ecrans(2);
    const plafond = () => compteDe(cleDeLimiteDuCompte("lotsParCompte", compte.email), LIMITES.lotsParCompte);
    const avant = await plafond();
    const premiere = await luDe(await lot(images, { cle }));
    expect(envois).toHaveLength(1);
    expect(await luDe(await lot(images, { cle }))).toEqual(premiere);
    expect(envois).toHaveLength(1);
    /* Une autre appli : la lecture n’est plus la même demande */
    await luDe(await lot(images, { cle, app: "instagram" }));
    expect(envois).toHaveLength(2);
    expect((await plafond()) - avant).toBe(2);
    /* Chaque vraie lecture est notée sous l’empreinte de l’envoi, à son prix */
    expect((await lignesDe(cle)).map((l) => [l.task, l.costMicros, l.storyId])).toEqual([
      ["captures_video", COUT_MICROS, null],
      ["captures_video", COUT_MICROS, null],
    ]);
  });

  it("deux envois du même lot en même temps : une seule lecture", async () => {
    const avant = envois.length;
    const images = ecrans(3);
    const [a, b] = await Promise.all([lot(images), lot(images)]);
    expect(await luDe(a)).toEqual(await luDe(b));
    expect(envois.length - avant).toBe(1);
  });

  it("un échec n’est jamais gardé : le nouvel essai du lot le relit", async () => {
    const avant = envois.length;
    const images = ecrans(2);
    prestataire = async () => ({ content: [], usage: USAGE, model: "claude-sonnet-5-5", stop_reason: "refusal", stop_details: { category: "general_harms" } });
    const refus = await lot(images);
    expect(refus.status).toBe(502);
    expect(await refus.json()).toEqual({ erreur: "refus" });
    prestataire = lue;
    await luDe(await lot(images));
    expect(envois.length - avant).toBe(2);
  });

  it("le premier lot d’abord : ceux de la suite attendent que sa réponse commence, puis partent", async () => {
    const cle = randomUUID();
    let commence = 0;
    prestataire = async (images, _signal, ecoute) => {
      if (images === 2) {
        await attendre(150);
        commence = Date.now();
        ecoute?.bloc("thinking");
        await attendre(150);
      }
      return lue(images);
    };
    const avant = envois.length;
    const t0 = Date.now();
    /* La suite arrive avant le premier : elle l’attend quand même */
    const suite = [lot(ecrans(3), { cle, ordre: "suite" }), lot(ecrans(4), { cle, ordre: "suite" })];
    await attendre(50);
    const premier = lot(ecrans(2), { cle, ordre: "premier" });
    for (const r of await Promise.all([premier, ...suite])) await luDe(r);
    const recus = envois.slice(avant);
    expect(recus.map((e) => e.images).sort()).toEqual([2, 3, 4]);
    for (const e of recus.filter((x) => x.images !== 2)) expect(e.le).toBeGreaterThanOrEqual(commence);
    /* Libérés par le début du premier, pas par la fin de l’attente (8 s) */
    expect(Date.now() - t0).toBeLessThan(3_000);
  });

  it("un lot de la suite n’attend pas sans fin : au plus le temps donné, rien si le premier a commencé ou si l’envoi s’arrête", async () => {
    const seul = envoiDe(randomUUID())!;
    let t0 = Date.now();
    await attendreLePremier(seul, new AbortController().signal, 300);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(250);
    expect(Date.now() - t0).toBeLessThan(2_000);
    const lance = envoiDe(randomUUID())!;
    premierLot(lance)();
    t0 = Date.now();
    await attendreLePremier(lance, new AbortController().signal, 5_000);
    expect(Date.now() - t0).toBeLessThan(1_000);
    const arret = new AbortController();
    t0 = Date.now();
    setTimeout(() => arret.abort(), 50);
    await attendreLePremier(envoiDe(randomUUID())!, arret.signal, 5_000);
    expect(Date.now() - t0).toBeLessThan(1_000);
  });

  it("un envoi abandonné : sa lecture en cours s’arrête chez le prestataire (409 abandon), aucun autre de ses lots ne part ; un lot déjà lu reste", async () => {
    const cle = randomUUID();
    const dejaLus = ecrans(2);
    const deja = await luDe(await lot(dejaLus, { cle }));
    /* Le prochain lot ne répond pas avant 5 s, sauf si on l’arrête */
    prestataire = (images, signal) =>
      new Promise((ok, ko) => {
        signal?.addEventListener("abort", () => ko(new APIUserAbortError()));
        setTimeout(() => ok(lue(images)), 5_000);
      });
    const avant = envois.length;
    const enCours = lot(ecrans(3), { cle });
    while (envois.length === avant) await attendre(10);
    const abandon = await postAbandon(requete("/api/captures/lot/abandon", json({ cle })));
    expect(await abandon.json()).toEqual({ ok: true });
    const r = await enCours;
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ erreur: "abandon" });
    expect(envois.at(-1)!.signal?.aborted).toBe(true);
    /* Un autre lot du même envoi : refusé sans appel */
    const apres = await lot(ecrans(4), { cle });
    expect(apres.status).toBe(409);
    expect(envois.length - avant).toBe(1);
    /* Le lot déjà lu revient toujours (un nouvel essai de l’enregistrement le retrouve) */
    expect(await luDe(await lot(dejaLus, { cle }))).toEqual(deja);
    /* Une clé qui n’en est pas une n’arrête rien */
    expect(await (await postAbandon(requete("/api/captures/lot/abandon", json({ cle: "pas une clé" })))).json()).toEqual({ ok: true });
  });

  it("sans compte : chaque lecture réserve d’abord ce qu’elle peut coûter au plus ; la part épuisée, rien ne part (503 souffle) ; une lecture finie ne garde que son coût", async () => {
    etat.cookies.clear();
    const part = () => compteDe(cleSansCompte(), { fenetreS: 2 * 86400 });
    try {
      await effacerLaPartSansCompte();
      /* 5 centimes sous le budget sans compte : assez pour le contrôle d’avant l’appel, pas pour la réservation d’un lot */
      const presque = BUDGET_IA.anonyme * 1e6 - 50_000;
      await noterDepense(null, presque);
      oublierLeBudget();
      const avant = envois.length;
      const refus = await lot(ecrans(2));
      expect(refus.status).toBe(503);
      expect(await refus.json()).toEqual({ erreur: "souffle" });
      expect(envois.length).toBe(avant);
      expect(await part()).toBe(presque);
      /* La part vide : le lot se lit, et la réservation rendue, il ne reste que ce qu’il a coûté */
      await effacerLaPartSansCompte();
      await luDe(await lot(ecrans(2)));
      expect(await part()).toBe(COUT_MICROS);
    } finally {
      await effacerLaPartSansCompte();
    }
  });
});

describe("la mesure des imports", () => {
  /** Ce que /admin dit d’un type d’import sur 24 h. */
  const duType = async (type: TypeDImport): Promise<Pilotage["importsParType"][number]> => (await statsAdmin(1)).pilotage.importsParType.find((t) => t.type === type)!;
  const ecart = (a: Pilotage["importsParType"][number], b: Pilotage["importsParType"][number]) => ({
    imports: b.imports - a.imports,
    ecrans: b.ecrans - a.ecrans,
    lots: b.lots - a.lots,
    micros: Math.round((b.dollars - a.dollars) * 1e6),
    paywall: b.paywall - a.paywall,
    payes: b.payes - a.payes,
    pourRien: Math.round((b.pourRien - a.pourRien) * 1e6),
  });

  it("un enregistrement : ses lots rangent leur coût sous l’empreinte de l’envoi, la conv qui en naît le garde avec ses écrans et ses lots ; /admin le compte, puis le paywall et le paiement", async () => {
    const avant = await duType("video");
    const cle = randomUUID();
    const lus = [await luDe(await lot(ecrans(2), { cle, ordre: "premier" })), await luDe(await lot(ecrans(3), { cle, ordre: "suite" }))];
    const fin = () => postVideo(requete("/api/captures/video", json({ app: "imessage", lots: lus, cle, consentement: CASE_IMPORT.version })));
    const id = await conv(await fin());
    /* Un nouvel essai de la fin retrouve la conv : ni seconde mesure, ni seconde conv */
    expect(await conv(await fin())).toBe(id);
    const [mesure, ...autres] = await db()
      .select()
      .from(schema.imports)
      .where(eq(schema.imports.envoi, envoiDe(cle)!));
    expect(autres).toEqual([]);
    /* Deux lots de 2 et 3 écrans, qui partagent un écran */
    expect(mesure).toMatchObject({ storyId: id, type: "video", appli: "imessage", ecrans: 4, lots: 2 });
    expect((await lignesDe(cle)).map((l) => l.storyId)).toEqual([id, id]);
    expect(ecart(avant, await duType("video"))).toEqual({ imports: 1, ecrans: 4, lots: 2, micros: 2 * COUT_MICROS, paywall: 0, payes: 0, pourRien: 0 });
    /* Puis le paywall (la lecture attend le paiement), puis le rapport payé */
    await attendreLePaiement(id, "verdict");
    await db()
      .insert(schema.achats)
      .values({ userId: compte.id, storyId: id, offre: "rapport", centimes: 990, bulles: 10, fournisseur: "factice", statut: "paye", payeLe: new Date() });
    expect(ecart(avant, await duType("video"))).toMatchObject({ imports: 1, paywall: 1, payes: 1 });
  });

  it("des captures : la lecture se note sous l’empreinte de l’envoi, puis la conv ; un morceau ajouté avant « Qui es-tu ? » ajoute ses écrans, son lot et son coût à ceux de la conv", async () => {
    const avant = await duType("captures");
    const cle = randomUUID();
    const id = await conv(await postCaptures(requete("/api/captures", { method: "POST", body: formulaire(ecrans(3), { app: "instagram", cle }) })));
    expect(await db().select().from(schema.imports).where(eq(schema.imports.storyId, id))).toEqual([
      expect.objectContaining({ type: "captures", appli: "instagram", ecrans: 3, lots: 1 }),
    ]);
    const ajout = randomUUID();
    expect(await conv(await postCaptures(requete("/api/captures", { method: "POST", body: formulaire(ecrans(2), { app: "instagram", cle: ajout, mode: "add" }) })))).toBe(id);
    expect(await db().select().from(schema.imports).where(eq(schema.imports.storyId, id))).toEqual([expect.objectContaining({ ecrans: 5, lots: 2 })]);
    /* La lecture du morceau passe sous l’empreinte de la conv, reliée à elle */
    expect(await lignesDe(ajout)).toEqual([]);
    expect((await lignesDe(cle)).map((l) => l.storyId)).toEqual([id, id]);
    expect(ecart(avant, await duType("captures"))).toMatchObject({ imports: 1, ecrans: 5, lots: 2, micros: 2 * COUT_MICROS, pourRien: 0 });
  });

  it("un export : mesuré, sans rien de lu avant l’achat", async () => {
    const avant = await duType("export");
    const fd = new FormData();
    fd.append("fichier", convDeTest("01-a-deux-doigts.txt"));
    fd.append("consentement", CASE_IMPORT.version);
    const id = await conv(await postImport(requete("/api/import", { method: "POST", body: fd })));
    expect(await db().select().from(schema.imports).where(eq(schema.imports.storyId, id))).toEqual([
      expect.objectContaining({ type: "export", appli: "whatsapp", ecrans: 0, lots: 0 }),
    ]);
    expect(ecart(avant, await duType("export"))).toMatchObject({ imports: 1, micros: 0, pourRien: 0 });
  });

  it("lu pour rien : des lots lus pour un envoi qui n’est jamais devenu une conv", async () => {
    const avant = await duType("video");
    await luDe(await lot(ecrans(2), { cle: randomUUID() }));
    expect(ecart(avant, await duType("video"))).toMatchObject({ imports: 0, micros: 0, pourRien: COUT_MICROS });
  });

  it("la purge de la nuit efface les mesures de plus de 90 jours, et garde les autres", async () => {
    const ilYa = (jours: number) => new Date(Date.now() - jours * 86400e3);
    const [vieille, recente] = [envoiDe(randomUUID())!, envoiDe(randomUUID())!];
    await db()
      .insert(schema.imports)
      .values([
        { envoi: vieille, type: "export", appli: "whatsapp", creeLe: ilYa(91) },
        { envoi: recente, type: "export", appli: "whatsapp", creeLe: ilYa(10) },
      ]);
    try {
      await purger();
      const restent = await db()
        .select({ envoi: schema.imports.envoi })
        .from(schema.imports)
        .where(inArray(schema.imports.envoi, [vieille, recente]));
      expect(restent.map((r) => r.envoi)).toEqual([recente]);
    } finally {
      await db()
        .delete(schema.imports)
        .where(inArray(schema.imports.envoi, [vieille, recente]));
    }
  });
});
