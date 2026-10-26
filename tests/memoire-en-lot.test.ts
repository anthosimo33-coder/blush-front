import Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Requete } from "@prompts/lib/contextes";
import { noterAlerteDuChat } from "@prompts/lib/memoire";
import { ficheEtMaj } from "@/server/ajouts";
import { cleDeDepense, payeurDuCompte, noterDepense, oublierLeBudget } from "@/server/budget";
import * as coffre from "@/server/coffre";
import { db, schema } from "@/server/db";
import { donneesMemoire, modifierMemoire } from "@/server/depot";
import { fusionnerFaits } from "@/server/fiche";
import { definirFournisseurDeLots, type FournisseurDeLots } from "@/server/ia/claude";
import { fournisseurFactice, refusFactice } from "@/server/ia/factice";
import { compteDe } from "@/server/limites";
import { LOT_AU_PLUS_S, traiterLesLots } from "@/server/memoire-en-lot";
import { CALME_S, ECHANGES_PAR_MAJ, retenir } from "@/server/memoire-groupee";
import { executerChaine, reprendreLesChainesEnPlan } from "@/server/pipeline";
import { statsAdmin } from "@/server/stats";
import { aRelancer, prendre } from "@/server/taches";
import { aujourdhuiParis } from "@/server/temps";
import { echange, maj } from "./aide/fabriques";
import { compteDeTest, facticePourChaqueTest, histoireLue, ligneEnBase } from "./aide/fixtures";
import { fauxLots, reponseDuLot } from "./aide/lots";

/* La mémoire en lot (BLUSH_MEMOIRE_EN_LOT), allumée pour chaque test, sauf ceux qui l’éteignent */
const LOT = vi.hoisted(() => ({ on: true }));
vi.mock("@/server/env", async (original) => {
  const m = await original<typeof import("@/server/env")>();
  return { ...m, env: () => ({ ...m.env(), BLUSH_MEMOIRE_EN_LOT: LOT.on }), memoireEnLot: () => LOT.on };
});
/* Ce qui part après la réponse (after) : gardé, lancé à la main */
const apres = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => apres.push(f) }));
/* Le relais de la chaîne : chaque passage de main noté, sans appel réseau */
const relais = vi.hoisted(() => [] as string[]);
vi.mock("@/server/relais", () => ({ RELAIS_MAX: 5, passerLaMain: async (histoire: string) => (relais.push(histoire), true) }));
/* Ce qui se passe juste après un appel au modèle, avant que sa mise à jour s’écrive (une alerte du chat, une fiche corrigée) */
const ENTRE = vi.hoisted(() => ({ deux: null as null | (() => Promise<unknown>) }));
vi.mock("@/server/ia/appel-verifie", async (original) => {
  const m = await original<typeof import("@/server/ia/appel-verifie")>();
  const appelVerifie = new Proxy(m.appelVerifie, {
    apply: async (f, soi, args) => {
      const sortie: unknown = await Reflect.apply(f, soi, args);
      const entre = ENTRE.deux;
      ENTRE.deux = null;
      await entre?.();
      return sortie;
    },
  });
  return { ...m, appelVerifie };
});

/*
 * La mise à jour de la mémoire en différé (src/server/memoire-en-lot.ts) : celle du calme part en lot au passage des 5
 * minutes, sa réponse revient au passage suivant, et tout ce qui ne peut pas attendre la rapatrie. Avec la base, le modèle
 * factice pour le direct, et un faux prestataire des lots (tests/aide/lots.ts) : aucun appel réel.
 */

/* Les requêtes du modèle factice (le direct, et les lots du modèle factice) : on compte les mises à jour, on lit ce qu’elles reçoivent */
const requetes: Requete[] = [];
facticePourChaqueTest((req) => (requetes.push(req), fournisseurFactice(req)));
const majsLues = () => requetes.filter((r) => r.tache === "07-memoire").map((r) => r.blocs.flatMap((b) => ("texte" in b ? [b.texte] : [])).join("\n"));

let faux = fauxLots();
beforeEach(() => {
  LOT.on = true;
  faux = fauxLots();
  definirFournisseurDeLots(faux.f);
  relais.length = 0;
  apres.length = 0;
  ENTRE.deux = null;
});
afterEach(async () => {
  definirFournisseurDeLots(null);
  /* Rien ne passe d’un test à l’autre : ni un lot, ni une mise à jour qui attend (le passage des 5 minutes les prendrait) */
  await db().delete(schema.lots);
  await db()
    .update(schema.tasks)
    .set({ status: "fini" })
    .where(and(eq(schema.tasks.kind, "memoire_maj"), inArray(schema.tasks.status, ["attente", "lot", "en_cours"])));
});

const t = schema.tasks;
let n = 0;
/** Une conv lue, son rapport débloqué et sa mémoire écrite : son id et son compte. Les requêtes de sa lecture sont oubliées. */
async function convLue() {
  const u = await compteDeTest(`lot-${++n}`, "debloque");
  const { id } = await histoireLue(u, "02-reciproque.txt");
  requetes.length = 0;
  return { id, u };
}

/** Un échange au chat : ton message gardé (repondre le garde avant de le retenir), puis retenu pour la mémoire. */
async function auChat(storyId: string, k: number, { neuf = true, maintenant = false } = {}) {
  await db()
    .insert(schema.chatMessages)
    .values({ storyId, role: "toi", data: coffre.ecrire("chat_messages.data:toi", { texte: `échange numéro ${k}` }) });
  return retenir(storyId, echange(k), { neuf, maintenant });
}

/** Une mise à jour des échanges `de` à `a` (le premier apporte du neuf), son calme passé : son id. */
async function calmee(storyId: string, de = 1, a = 2): Promise<string> {
  let id: string | null = null;
  for (let k = de; k <= a; k++) id = (await auChat(storyId, k, { neuf: k === de })).id ?? id;
  await db()
    .update(t)
    .set({ pasAvant: sql`now() - interval '1 second'` })
    .where(eq(t.id, id!));
  return id!;
}

/** Envoyée en lot par le passage des 5 minutes : la tâche, et son lot. */
async function envoyee(storyId: string, de = 1, a = 2) {
  const tache = await calmee(storyId, de, a);
  await traiterLesLots();
  const lot = faux.dernier();
  expect(lot.requete.id).toBe(tache);
  return { tache, lot: lot.id };
}

/** Ce que dit la tâche : son statut, son heure (null : tout de suite), ses échanges, son code, et la mémoire gardée pour son lot. */
async function tache(id: string) {
  const [x] = await db()
    .select({ status: t.status, input: t.input, error: t.error, lotAvant: t.lotAvant, dans: sql<number | null>`extract(epoch from (${t.pasAvant} - now()))::float` })
    .from(t)
    .where(eq(t.id, id));
  if (!x) throw new Error(`pas de tâche ${id}`);
  return { status: x.status, dans: x.dans, error: x.error, gardee: !!x.lotAvant, dits: x.input ? coffre.lire("tasks.input", x.input).map((e) => e.dit) : null };
}

const faits = async (id: string) => (await donneesMemoire(id))!.etat.fiche.faits.map((f) => f.texte);
const lignesDuLot = async (lot: string) => db().select().from(schema.lots).where(eq(schema.lots.id, lot));
const coutsDuLot = async (storyId: string) =>
  db()
    .select({ micros: schema.aiUsage.costMicros, entree: schema.aiUsage.inputTokens, cacheEcrit: schema.aiUsage.cacheWriteTokens })
    .from(schema.aiUsage)
    .where(and(eq(schema.aiUsage.storyId, storyId), eq(schema.aiUsage.task, "memoire_maj_lot")));

describe("la mise à jour de la mémoire en lot : l’envoi et la réponse", () => {
  it("au calme, le passage des 5 minutes l’envoie en lot, une requête par lot : rien ne la reprend en direct, et c’est la même requête qu’en direct", async () => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    expect(faux.lots.get(lot)!.requetes).toHaveLength(1);
    expect(await tache(tid)).toMatchObject({ status: "lot", gardee: true, dits: ["échange numéro 1", "échange numéro 2"] });
    /* Ni la chaîne, ni prendre, ni le passage suivant ne la relancent : elle attend sa réponse */
    expect((await aRelancer(id)).map((x) => x.id)).not.toContain(tid);
    expect(await prendre(tid)).toBeNull();
    await executerChaine(id);
    await reprendreLesChainesEnPlan();
    expect(relais).not.toContain(id);
    expect(majsLues()).toEqual([]);
    /* Expirée : elle repart en direct, et le modèle y reçoit la même requête que le lot */
    faux.finir(lot, { [tid]: { type: "expired" } });
    await traiterLesLots();
    expect(await tache(tid)).toMatchObject({ status: "attente", dans: null, gardee: false, error: "lot:expired" });
    expect(relais).toContain(id);
    await executerChaine(id);
    const directes = requetes.filter((r) => r.tache === "07-memoire");
    expect(directes).toHaveLength(1);
    const demande = faux.lots.get(lot)!.requetes[0]!.demande!;
    /* Comparées par égalité (un booléen) : un échec n’affiche pas la demande dans les journaux de la CI, qui sont publics */
    expect(JSON.stringify(directes[0]) === JSON.stringify({ ...demande.requete, partie: demande.partie })).toBe(true);
    expect(demande.partie).toBe("mise à jour");
    expect(await tache(tid)).toMatchObject({ status: "fini", dits: null });
    /* Le lot, fini, a été effacé chez le prestataire, et ici */
    expect(faux.lots.get(lot)!.efface).toBe(true);
    expect(await lignesDuLot(lot)).toEqual([]);
  });

  it("sa réponse revenue : elle s’applique à la mémoire, la tâche finit (ses échanges et la mémoire gardée effacés), le lot est effacé, son coût noté à moitié prix", async () => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    expect(await faits(id)).not.toContain("Adore les soirées improvisées");
    /* Pas encore finie : le passage ne fait rien */
    await traiterLesLots();
    expect((await tache(tid)).status).toBe("lot");
    faux.finir(lot);
    expect(await traiterLesLots()).toMatchObject({ lus: 1 });
    expect(await tache(tid)).toMatchObject({ status: "fini", dits: null, gardee: false });
    expect(await faits(id)).toContain("Adore les soirées improvisées");
    expect(faux.lots.get(lot)!.efface).toBe(true);
    expect(await lignesDuLot(lot)).toEqual([]);
    expect(majsLues()).toEqual([]);
    /* 2 000 jetons lus à 4 $, 1 000 écrits à 20 $, 23 400 écrits dans le cache à 5 $ (le million) : 0,145 $, la moitié en lot */
    expect(await coutsDuLot(id)).toEqual([{ micros: 72_500, entree: 2_000, cacheEcrit: 23_400 }]);
    /* /admin les compte à part (la création, les mises à jour en direct, celles en lot) : le modèle factice ne coûte rien, seul le lot y est */
    const postes = (await statsAdmin(1)).couts.postes.map((p) => p.nom);
    expect(postes).toContain("Mémoire (en lot)");
    expect(postes).not.toContain("Mémoire");
  });

  it("le chat qui reprend après le calme, avant le passage des 5 minutes : l’échange la rejoint, elle garde son heure passée, et le passage l’envoie en lot avec lui, au lieu du direct", async () => {
    const { id } = await convLue();
    const tid = await calmee(id);
    const r = await auChat(id, 3, { neuf: false });
    expect(r).toEqual({ id: tid, part: false });
    /* Ni reculée de CALME_S (la séance d’avant glisserait hors du fil), ni partie en direct (ce que fait la mémoire en lot éteinte : memoire-groupee.test.ts) */
    expect((await tache(tid)).dans).toBeLessThan(0);
    expect(majsLues()).toEqual([]);
    await traiterLesLots();
    expect(await tache(tid)).toMatchObject({ status: "lot", dits: ["échange numéro 1", "échange numéro 2", "échange numéro 3"] });
  });

  it("les lots en vol comptent d’avance dans le budget du jour de leur compte : le suivant attend", async () => {
    const u = await compteDeTest(`lot-${++n}`, "debloque");
    const [a, b] = [await histoireLue(u, "02-reciproque.txt"), await histoireLue(u, "02-reciproque.txt")];
    /* 5 centimes sous le budget du compte : un lot part, le suivant compterait 10 centimes de plus */
    await noterDepense(payeurDuCompte(u), 9_950_000);
    try {
      const [ta, tb] = [await calmee(a.id), await calmee(b.id)];
      await traiterLesLots();
      expect((await tache(ta)).status).toBe("lot");
      expect((await tache(tb)).status).toBe("attente");
      expect(faux.appels.filter((x) => x === "envoyer")).toHaveLength(1);
    } finally {
      oublierLeBudget();
    }
  });

  it("une erreur passagère à l’envoi (la connexion coupée, le prestataire surchargé) : elle attend le passage suivant, une fois ; la seconde, elle part en direct", async () => {
    const { id } = await convLue();
    definirFournisseurDeLots({
      ...faux.f,
      envoyer: async () => {
        throw new Anthropic.APIConnectionError({ message: "coupé" });
      },
    });
    const tid = await calmee(id);
    await traiterLesLots();
    expect(await tache(tid)).toMatchObject({ status: "attente", error: "lot:reporte" });
    expect((await tache(tid)).dans).toBeLessThan(0);
    expect(relais).not.toContain(id);
    await traiterLesLots();
    expect(await tache(tid)).toMatchObject({ status: "attente", dans: null, error: "lot:envoi" });
    expect(relais).toContain(id);
  });

  it("prise ailleurs pendant l’envoi (le direct fini entre-temps) : elle ne repasse pas en lot, et le lot est annulé, sans tâche, pour être effacé", async () => {
    const { id } = await convLue();
    const tid = await calmee(id);
    definirFournisseurDeLots({
      ...faux.f,
      envoyer: async (r) => {
        const lot = await faux.f.envoyer(r);
        await db().update(t).set({ status: "fini", input: null }).where(eq(t.id, tid));
        return lot;
      },
    });
    await traiterLesLots();
    const { id: lot } = faux.dernier();
    expect(await tache(tid)).toMatchObject({ status: "fini", gardee: false });
    expect(faux.lots.get(lot)!.annule).toBe(true);
    expect(await lignesDuLot(lot)).toMatchObject([{ tacheId: null }]);
    definirFournisseurDeLots(faux.f);
    faux.finir(lot);
    await traiterLesLots();
    expect(faux.lots.get(lot)!.efface).toBe(true);
    expect((await tache(tid)).status).toBe("fini");
  });

  it.each([
    ["un refus (le repli du prestataire n’existe pas en lot)", { type: "succeeded" as const, message: reponseDuLot(refusFactice("cyber")) }, "lot:refus", 1],
    ["une erreur", { type: "errored" as const, code: "overloaded_error" }, "lot:errored:overloaded_error", 0],
    ["une annulation", { type: "canceled" as const }, "lot:canceled", 0],
    ["une réponse illisible", { type: "succeeded" as const, message: reponseDuLot("pas du JSON") }, "lot:illisible", 1],
    [
      "des preuves introuvables",
      { type: "succeeded" as const, message: reponseDuLot(maj({ faits_ajoutes: [{ section: "notes", texte: "Inventé", preuves: ["m99999"] }] })) },
      "lot:preuves",
      1,
    ],
  ])("%s : elle repart en direct, une fois, et finit ; une réponse facturée reste comptée", async (_, issue, code, facturees) => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    faux.finir(lot, { [tid]: issue });
    await traiterLesLots();
    expect(await tache(tid)).toMatchObject({ status: "attente", dans: null, error: code });
    expect(relais).toContain(id);
    expect(await coutsDuLot(id)).toHaveLength(facturees);
    await executerChaine(id);
    expect(majsLues()).toHaveLength(1);
    expect(await tache(tid)).toMatchObject({ status: "fini", error: null });
    expect(faux.lots.get(lot)!.efface).toBe(true);
  });

  it(`toujours en cours au bout de ${LOT_AU_PLUS_S / 60} min : le lot est annulé, elle part en direct ; sa réponse arrivée quand même est comptée, ignorée, effacée`, async () => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    await db()
      .update(schema.lots)
      .set({ envoyeLe: sql`now() - make_interval(secs => ${LOT_AU_PLUS_S + 60})` })
      .where(eq(schema.lots.id, lot));
    expect(await traiterLesLots()).toMatchObject({ annules: 1 });
    expect(faux.appels).toContain("annuler");
    expect(await tache(tid)).toMatchObject({ status: "attente", dans: null, error: "lot:delai" });
    await executerChaine(id);
    expect(await tache(tid)).toMatchObject({ status: "fini" });
    const apresLeDirect = await donneesMemoire(id);
    /* Le lot finit malgré l’annulation (sa requête était déjà en cours) : facturée, comptée, puis ignorée */
    faux.finir(lot, { [tid]: { type: "succeeded", message: reponseDuLot(maj({ faits_ajoutes: [{ section: "notes", texte: "Arrivé trop tard", preuves: [] }] })) } });
    await traiterLesLots();
    expect(await donneesMemoire(id)).toEqual(apresLeDirect);
    expect(await coutsDuLot(id)).toHaveLength(1);
    expect(faux.lots.get(lot)!.efface).toBe(true);
    expect(await lignesDuLot(lot)).toEqual([]);
  });

  it("le lot disparu chez le prestataire, ou un envoi impossible : elle part en direct", async () => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    faux.lots.get(lot)!.efface = true;
    await traiterLesLots();
    expect(await tache(tid)).toMatchObject({ status: "attente", dans: null, error: "lot:introuvable" });
    expect(await lignesDuLot(lot)).toEqual([]);
    await executerChaine(id);
    const panne: FournisseurDeLots = {
      ...faux.f,
      envoyer: async () => {
        throw new Error("le prestataire ne répond pas");
      },
    };
    definirFournisseurDeLots(panne);
    const deux = await calmee(id, 3, 4);
    await traiterLesLots();
    expect(await tache(deux)).toMatchObject({ status: "attente", dans: null, error: "lot:envoi" });
    expect(relais.filter((r) => r === id)).toHaveLength(2);
  });

  it("le budget du jour atteint : elle n’est pas envoyée, elle attend", async () => {
    const { id, u } = await convLue();
    await noterDepense(payeurDuCompte(u), 11_000_000);
    try {
      const tid = await calmee(id);
      await traiterLesLots();
      expect(faux.appels).not.toContain("envoyer");
      expect(await tache(tid)).toMatchObject({ status: "attente" });
      expect((await tache(tid)).dans).toBeLessThan(0);
    } finally {
      oublierLeBudget();
    }
  });

  it("la conv effacée pendant son lot : il est annulé, puis effacé chez le prestataire quand il a fini ; sa réponse facturée reste au compte de la conv", async () => {
    const { id, u } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    const cle = cleDeDepense(payeurDuCompte(u), aujourdhuiParis().iso);
    const avant = await compteDe(cle, { fenetreS: 2 * 86400 });
    await db().delete(schema.stories).where(eq(schema.stories.id, id));
    expect(await lignesDuLot(lot)).toMatchObject([{ tacheId: null, storyId: null }]);
    /* Le temps que l’envoi pose sa tâche passé */
    await db()
      .update(schema.lots)
      .set({ envoyeLe: sql`now() - interval '3 minutes'` })
      .where(eq(schema.lots.id, lot));
    await traiterLesLots();
    expect(faux.lots.get(lot)!.annule).toBe(true);
    /* Déjà en cours au moment de l’annulation : sa réponse est facturée */
    faux.finir(lot, { [tid]: { type: "succeeded", message: reponseDuLot(maj()) } });
    await traiterLesLots();
    expect(faux.lots.get(lot)!.efface).toBe(true);
    expect(await lignesDuLot(lot)).toEqual([]);
    expect((await compteDe(cle, { fenetreS: 2 * 86400 })) - avant).toBe(72_500);
  });
});

describe("rien ne reste en lot, rien n’est compté deux fois, rien ne reste chez le prestataire", () => {
  it("une tâche en lot qui a perdu sa ligne de `lots` part en direct au passage d’après ; son lot, fini, est retrouvé par le ménage : son coût noté une fois, il est effacé", async () => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    await db().delete(schema.lots).where(eq(schema.lots.id, lot));
    await traiterLesLots();
    /* Pas tout de suite : l’envoi garde le lot avant d’y mettre sa tâche */
    expect((await tache(tid)).status).toBe("lot");
    await db()
      .update(t)
      .set({ updatedAt: sql`now() - interval '3 minutes'` })
      .where(eq(t.id, tid));
    await traiterLesLots();
    expect(await tache(tid)).toMatchObject({ status: "attente", dans: null, error: "lot:sans_lot", gardee: false });
    expect(relais).toContain(id);
    await executerChaine(id);
    expect((await tache(tid)).status).toBe("fini");
    /* Le lot, lui, a fini chez le prestataire sans que la base le connaisse */
    faux.finir(lot);
    faux.lots.get(lot)!.creeLe = new Date(Date.now() - 3 * 60_000);
    await traiterLesLots();
    expect(faux.lots.get(lot)!.efface).toBe(true);
    expect(await lignesDuLot(lot)).toEqual([]);
    expect(await coutsDuLot(id)).toHaveLength(1);
    await traiterLesLots();
    expect(await coutsDuLot(id)).toHaveLength(1);
  });

  it("un lot parti sans que sa réponse arrive (la connexion coupée pendant l’envoi) : la mise à jour part en direct ; fini, le ménage le retrouve et l’efface ; celui d’un autre outil n’est jamais touché", async () => {
    const { id } = await convLue();
    const autre = faux.etranger(new Date(Date.now() - 10 * 60_000));
    faux.pannes.envoyerApres = 1;
    const tid = await calmee(id);
    await traiterLesLots();
    expect(await tache(tid)).toMatchObject({ status: "attente", dans: null, error: "lot:envoi" });
    const { id: perdu } = faux.dernier();
    expect(await lignesDuLot(perdu)).toEqual([]);
    await executerChaine(id);
    faux.finir(perdu);
    faux.lots.get(perdu)!.creeLe = new Date(Date.now() - 3 * 60_000);
    await traiterLesLots();
    expect(faux.lots.get(perdu)!.efface).toBe(true);
    expect(await coutsDuLot(id)).toHaveLength(1);
    expect(faux.lots.get(autre)).toMatchObject({ efface: false, annule: false });
    /* Regardé une fois, il n’est plus relu */
    const lus = faux.appels.filter((x) => x === "resultats").length;
    await traiterLesLots();
    expect(faux.appels.filter((x) => x === "resultats")).toHaveLength(lus);
  });

  it("l’effacement raté chez le prestataire : un passage d’après l’efface, sans relire ses réponses ni noter leur coût une seconde fois", async () => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    faux.finir(lot);
    faux.pannes.effacer = 1;
    await traiterLesLots();
    expect((await tache(tid)).status).toBe("fini");
    expect(faux.lots.get(lot)!.efface).toBe(false);
    expect(await lignesDuLot(lot)).toHaveLength(1);
    await db()
      .update(schema.lots)
      .set({ luLe: sql`now() - interval '11 minutes'` })
      .where(eq(schema.lots.id, lot));
    await traiterLesLots();
    expect(faux.lots.get(lot)!.efface).toBe(true);
    expect(await lignesDuLot(lot)).toEqual([]);
    expect(await coutsDuLot(id)).toHaveLength(1);
    expect(faux.appels.filter((x) => x === "resultats")).toHaveLength(1);
  });

  it("un lot fini sans réponse pour sa tâche : elle part en direct", async () => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    faux.lots.get(lot)!.vide = true;
    faux.finir(lot);
    await traiterLesLots();
    expect(await tache(tid)).toMatchObject({ status: "attente", dans: null, error: "lot:sans_reponse" });
    expect(faux.lots.get(lot)!.efface).toBe(true);
    expect(relais).toContain(id);
  });

  it("le prestataire qui ne répond plus pour ce lot : passé l’heure, elle part en direct quand même, et l’annulation se retente au passage d’après", async () => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    faux.pannes.etat = 1;
    await traiterLesLots();
    /* Une panne d’un passage, avant l’heure : rien ne bouge */
    expect((await tache(tid)).status).toBe("lot");
    await db()
      .update(schema.lots)
      .set({ envoyeLe: sql`now() - make_interval(secs => ${LOT_AU_PLUS_S + 60})` })
      .where(eq(schema.lots.id, lot));
    faux.pannes.etat = 1;
    faux.pannes.annuler = 1;
    await traiterLesLots();
    expect(await tache(tid)).toMatchObject({ status: "attente", dans: null, error: "lot:illisible" });
    expect(faux.lots.get(lot)!.annule).toBe(false);
    await traiterLesLots();
    expect(faux.lots.get(lot)!.annule).toBe(true);
    expect((await lignesDuLot(lot))[0]!.annuleLe).not.toBeNull();
  });
});

describe("pendant le lot : ce qui attend, ce qui le rapatrie", () => {
  it("un échange qui n’exige rien ouvre une autre mise à jour, qui attend que la réponse revienne pour partir à son tour", async () => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    const r = await auChat(id, 3);
    expect(r.part).toBe(false);
    expect(r.id).not.toBe(tid);
    expect((await tache(r.id!)).dans).toBeGreaterThan(CALME_S - 60);
    /* Son calme passé, elle n’est ni envoyée ni lancée tant que l’autre est en lot */
    await db()
      .update(t)
      .set({ pasAvant: sql`now() - interval '1 second'` })
      .where(eq(t.id, r.id!));
    await traiterLesLots();
    expect(faux.lots.size).toBe(1);
    expect(await prendre(r.id!)).toBeNull();
    await reprendreLesChainesEnPlan();
    expect(relais).not.toContain(id);
    /* La réponse revenue s’applique, et le même passage envoie la suivante */
    faux.finir(lot);
    await traiterLesLots();
    expect((await tache(tid)).status).toBe("fini");
    expect(faux.dernier().requete.id).toBe(r.id);
    expect((await tache(r.id!)).status).toBe("lot");
  });

  it(`au ${ECHANGES_PAR_MAJ}e échange depuis le lot (retenus ou non : le fil les relit tous), il est annulé, et ses échanges partent en direct avec ceux qui attendaient, en un seul appel, dans l’ordre`, async () => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    /* Une question sans neuf : rien à retenir, mais elle compte */
    expect(await auChat(id, 3, { neuf: false })).toEqual({ id: null, part: false });
    expect((await auChat(id, 4)).part).toBe(false);
    expect((await auChat(id, ECHANGES_PAR_MAJ, { neuf: false })).part).toBe(true);
    expect(faux.lots.get(lot)!.annule).toBe(true);
    expect(await tache(tid)).toMatchObject({ status: "attente", dans: null, dits: ["échange numéro 1", "échange numéro 2", "échange numéro 4", "échange numéro 5"] });
    await executerChaine(id);
    const lues = majsLues();
    expect(lues).toHaveLength(1);
    const places = [1, 2, 4, 5].map((k) => lues[0]!.indexOf(`échange numéro ${k}`));
    expect(places.every((p, i) => p >= 0 && (i === 0 || p > places[i - 1]!))).toBe(true);
    expect(lues[0]).not.toContain("échange numéro 3");
    /* Le lot annulé finit sans réponse : effacé au passage suivant */
    faux.finir(lot);
    await traiterLesLots();
    expect(faux.lots.get(lot)!.efface).toBe(true);
    expect(await coutsDuLot(id)).toEqual([]);
  });

  it(`sa réponse revenue sans être relevée, au ${ECHANGES_PAR_MAJ}e échange depuis le lot : elle s’applique, et la mise à jour d’après reprend son calme au lieu de partir en direct pour trois échanges`, async () => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    faux.finir(lot);
    await auChat(id, 3);
    await auChat(id, 4, { neuf: false });
    const r = await auChat(id, ECHANGES_PAR_MAJ, { neuf: false });
    expect(r.part).toBe(false);
    expect(faux.appels).not.toContain("annuler");
    expect((await tache(tid)).status).toBe("fini");
    expect(await faits(id)).toContain("Adore les soirées improvisées");
    expect(await tache(r.id!)).toMatchObject({ status: "attente", dits: ["échange numéro 3", "échange numéro 4", `échange numéro ${ECHANGES_PAR_MAJ}`] });
    expect((await tache(r.id!)).dans).toBeGreaterThan(CALME_S - 60);
    expect(majsLues()).toEqual([]);
  });

  it("pendant qu’un passage lit sa réponse, partir tout de suite ne demande rien au prestataire ; ce passage relance ensuite la chaîne de la conv", async () => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    await db().update(schema.lots).set({ luLe: new Date() }).where(eq(schema.lots.id, lot));
    const avant = faux.appels.length;
    const r = await auChat(id, 3, { maintenant: true });
    expect(r.part).toBe(true);
    expect((await ficheEtMaj(await ligneEnBase(id))).updating).toBe(true);
    expect(faux.appels).toHaveLength(avant);
    expect((await tache(tid)).status).toBe("lot");
    /* Ce passage-là, fini (sa lecture rendue), et le lot avec */
    await db().update(schema.lots).set({ luLe: null }).where(eq(schema.lots.id, lot));
    faux.finir(lot);
    await traiterLesLots();
    expect((await tache(tid)).status).toBe("fini");
    expect(relais).toContain(id);
    await executerChaine(id);
    expect((await tache(r.id!)).status).toBe("fini");
  });

  it("sa réponse déjà revenue quand il faut partir : elle s’applique d’abord, rien n’est annulé, les nouveaux partent seuls", async () => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    faux.finir(lot);
    await auChat(id, 3);
    const r = await auChat(id, 4, { maintenant: true });
    expect(r.part).toBe(true);
    expect(faux.appels).not.toContain("annuler");
    expect((await tache(tid)).status).toBe("fini");
    expect(await faits(id)).toContain("Adore les soirées improvisées");
    expect(await tache(r.id!)).toMatchObject({ status: "attente", dans: null, dits: ["échange numéro 3", "échange numéro 4"] });
  });

  it("sa fiche ouverte pour de bon le rapatrie ; la page (que l’accueil précharge) ne demande rien au prestataire", async () => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    const avant = faux.appels.length;
    expect((await ficheEtMaj(await ligneEnBase(id), { page: true })).updating).toBe(true);
    expect(faux.appels).toHaveLength(avant);
    expect((await tache(tid)).status).toBe("lot");
    /* L’écran se relit (GET /api/fiche) : le lot est annulé, la mise à jour part en direct */
    expect((await ficheEtMaj(await ligneEnBase(id))).updating).toBe(true);
    expect(faux.lots.get(lot)!.annule).toBe(true);
    expect(await tache(tid)).toMatchObject({ status: "attente", dans: null, error: "lot:rapatrie" });
    while (apres.length) await apres.shift()!();
    expect((await tache(tid)).status).toBe("fini");
    expect(majsLues()).toHaveLength(1);
    expect((await ficheEtMaj(await ligneEnBase(id))).updating).toBeUndefined();
  });

  it("une alerte notée par le chat pendant le lot : sa réponse s’applique quand même, et l’alerte reste ; la fiche corrigée pendant le lot : il se refait en direct", async () => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    await modifierMemoire(id, (m) => ({ ...m, etat: noterAlerteDuChat(m.etat, "detresse", 4242) }), { essais: 3 });
    faux.finir(lot);
    await traiterLesLots();
    expect((await tache(tid)).status).toBe("fini");
    const m = (await donneesMemoire(id))!;
    expect(m.etat.alertes_vues).toEqual([{ alerte: "detresse", reponses: [4242] }]);
    expect(m.etat.fiche.faits.map((f) => f.texte)).toContain("Adore les soirées improvisées");
    expect(majsLues()).toEqual([]);
    /* La fiche corrigée à la main : la réponse, faite sans la correction, ne s’écrit pas par-dessus */
    const { tache: deux, lot: lot2 } = await envoyee(id, 3, 4);
    const corrigee = [...m.etat.fiche.faits.map((f) => ({ section: f.section, text: f.texte })), { section: "notes" as const, text: "Allergique aux chats" }];
    await modifierMemoire(id, (x) => fusionnerFaits(x, corrigee), { essais: 3 });
    faux.finir(lot2);
    await traiterLesLots();
    expect(await tache(deux)).toMatchObject({ status: "attente", dans: null, error: "lot:a_refaire" });
    await executerChaine(id);
    expect(majsLues()).toHaveLength(1);
    expect(await faits(id)).toEqual(expect.arrayContaining(["Allergique aux chats", "Adore les soirées improvisées"]));
  });
});

describe("l’interrupteur, et le modèle factice", () => {
  it("éteint : au calme, elle part en direct comme avant, rien ne part en lot ; un lot déjà parti est encore relevé", async () => {
    const { id } = await convLue();
    const { tache: tid, lot } = await envoyee(id);
    LOT.on = false;
    faux.finir(lot);
    await traiterLesLots();
    expect((await tache(tid)).status).toBe("fini");
    const deux = await calmee(id, 3, 4);
    await traiterLesLots();
    expect(faux.lots.size).toBe(1);
    await reprendreLesChainesEnPlan();
    expect(relais).toContain(id);
    await executerChaine(id);
    expect((await tache(deux)).status).toBe("fini");
  });

  it("sans faux, en mode factice (le dev) : le lot du modèle factice, qui revient au passage suivant, sans rien noter au suivi des coûts", async () => {
    definirFournisseurDeLots(null);
    const { id } = await convLue();
    const tid = await calmee(id);
    await traiterLesLots();
    expect((await tache(tid)).status).toBe("lot");
    await traiterLesLots();
    expect((await tache(tid)).status).toBe("fini");
    expect(await faits(id)).toContain("Adore les soirées improvisées");
    expect(majsLues()).toHaveLength(1);
    expect(await coutsDuLot(id)).toEqual([]);
  });
});

describe("en direct : la mémoire relue après l’appel", () => {
  it("une alerte notée par le chat pendant la mise à jour ne fait pas rappeler le modèle : sa sortie s’applique, l’alerte par-dessus", async () => {
    LOT.on = false;
    const { id } = await convLue();
    const r = await auChat(id, 1, { maintenant: true });
    ENTRE.deux = () => modifierMemoire(id, (m) => ({ ...m, etat: noterAlerteDuChat(m.etat, "danger", 4343) }), { essais: 3 });
    await executerChaine(id);
    expect(majsLues()).toHaveLength(1);
    expect((await tache(r.id!)).status).toBe("fini");
    const m = (await donneesMemoire(id))!;
    expect(m.etat).toMatchObject({ alerte: "danger", alertes_vues: [{ alerte: "danger", reponses: [4343] }] });
    expect(m.etat.fiche.faits.map((f) => f.texte)).toContain("Adore les soirées improvisées");
  });

  it("une fiche corrigée pendant la mise à jour, elle, la fait refaire sur la nouvelle (un second appel), sans rien perdre", async () => {
    LOT.on = false;
    const { id } = await convLue();
    const r = await auChat(id, 1, { maintenant: true });
    ENTRE.deux = () =>
      modifierMemoire(
        id,
        (m) => fusionnerFaits(m, [...m.etat.fiche.faits.map((f) => ({ section: f.section, text: f.texte })), { section: "notes", text: "Allergique aux chats" }]),
        { essais: 3 },
      );
    await executerChaine(id);
    expect(majsLues()).toHaveLength(2);
    expect((await tache(r.id!)).status).toBe("fini");
    expect(await faits(id)).toEqual(expect.arrayContaining(["Allergique aux chats", "Adore les soirées improvisées"]));
  });
});
