import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

/*
 * Le socle des achats et des bulles, avec la base : les droits d’un compte (src/server/droits.ts), les bulles
 * (src/server/bulles.ts), la commande, la livraison et la reprise d’un achat (src/server/achats.ts), et les offres
 * uniques (src/server/offres-uniques.ts). Chaque test a ses comptes (compteDeTest) : il passe seul comme dans
 * n’importe quel ordre. L’équipe est simulée (un email en « equipe- ») ; after() de Next et les alertes sont gardés.
 */
const etat = vi.hoisted(() => ({ apres: [] as (() => unknown)[], alertes: [] as string[] }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => etat.apres.push(f) }));
vi.mock("@/server/env", async (original) => {
  const o = await original<typeof import("@/server/env")>();
  return { ...o, accesLibre: (email: string) => email.startsWith("equipe-") };
});
vi.mock("@/server/alertes", async (original) => ({
  ...(await original<typeof import("@/server/alertes")>()),
  alerter: async (sujet: string) => void etat.alertes.push(sujet),
}));

import { CATALOGUE, DUREE_SUITE_MS, PREMIERE_RECHARGE } from "@/contenu/offres";
import { commander, livrer, marquerEchoue, offrirLeRapport, reprendre, uneFoisParEvenement, type Achat } from "@/server/achats";
import type { Utilisateur } from "@/server/auth";
import { crediter, debiter, deverrouiller, refDuMessage, rendre, reponseVerrouillee, soldeDe } from "@/server/bulles";
import * as coffre from "@/server/coffre";
import { db, schema } from "@/server/db";
import { compteAffiche, estClient, rapportOuvert, rapportOuvertEnBase } from "@/server/droits";
import { montrer, offreValable } from "@/server/offres-uniques";
import { tachesDe } from "./aide/essai";
import { compteDeTest, convRattachee, debloquerLaConv, histoireLue, ligneEnBase } from "./aide/fixtures";

/** Un compte de l’équipe (BLUSH_ACCES_LIBRE simulé : son email commence par « equipe- »). */
const compteEquipe = () => compteDeTest("equipe");
/** Une conv à lui, rattachée (pas lue). */
const conv = async (u: Utilisateur) => (await convRattachee(u, "02-reciproque.txt")).id;
/** Les mouvements de bulles du compte, du plus ancien au plus récent. */
const mouvements = (userId: string) =>
  db()
    .select({ delta: schema.mouvementsBulles.delta, raison: schema.mouvementsBulles.raison, ref: schema.mouvementsBulles.ref })
    .from(schema.mouvementsBulles)
    .where(eq(schema.mouvementsBulles.userId, userId))
    .orderBy(schema.mouvementsBulles.id);
/** L’achat tel qu’il est en base. */
const achatEnBase = async (id: string) => (await db().select().from(schema.achats).where(eq(schema.achats.id, id)))[0]!;
/** Une commande qui doit passer : l’achat, jamais un refus. */
async function commande(...args: Parameters<typeof commander>): Promise<Achat> {
  const r = await commander(...args);
  if (typeof r === "string") throw new Error(`commande refusée : ${r}`);
  return r;
}
/** Recule l’heure où cette offre unique a été montrée (et sa fin) de `ms`, comme si le temps avait passé. */
const reculer = (userId: string, offre: string, ms: number) =>
  db()
    .update(schema.offresUniques)
    .set({
      montreeLe: sql`${schema.offresUniques.montreeLe} - make_interval(secs => ${ms / 1000})`,
      expireLe: sql`${schema.offresUniques.expireLe} - make_interval(secs => ${ms / 1000})`,
    })
    .where(and(eq(schema.offresUniques.userId, userId), sql`${schema.offresUniques.offre} = ${offre}`));

describe("les droits", () => {
  it("le rapport d’une conv : débloqué, ou un compte de l’équipe ; lu en base, celui du compte de la conv", async () => {
    const [u, equipe] = [await compteDeTest("droits"), await compteEquipe()];
    const [id, idEquipe] = [await conv(u), await conv(equipe)];
    expect(rapportOuvert(await ligneEnBase(id), u)).toBe(false);
    expect(await rapportOuvertEnBase(id)).toBe(false);
    await debloquerLaConv(id);
    expect(rapportOuvert(await ligneEnBase(id), u)).toBe(true);
    expect(await rapportOuvertEnBase(id)).toBe(true);
    /* L’équipe a tout ouvert, sans rien débloquer ; un brouillon sans compte, rien */
    expect(rapportOuvert(await ligneEnBase(idEquipe), equipe)).toBe(true);
    expect(await rapportOuvertEnBase(idEquipe)).toBe(true);
    expect(rapportOuvert({ debloqueLe: null }, null)).toBe(false);
  });

  it("un client : un rapport débloqué, ou un achat payé, ou l’équipe", async () => {
    const [rien, debloque, payeur, equipe] = [await compteDeTest("client-rien"), await compteDeTest("client-conv"), await compteDeTest("client-achat"), await compteEquipe()];
    await debloquerLaConv(await conv(debloque));
    const achat = await commande(payeur, "pack30", { fournisseur: "factice" });
    expect(await estClient(payeur)).toBe(false);
    await livrer(achat.id);
    expect([await estClient(rien), await estClient(debloque), await estClient(payeur), await estClient(equipe)]).toEqual([false, true, true, true]);
    expect(await compteAffiche({ ...payeur, bulles: 30 }, { storyDeleted: false })).toEqual({ email: payeur.email, bulles: 30, client: true, equipe: false, storyDeleted: false });
  });
});

describe("les bulles", () => {
  it("créditées une fois par raison et par référence, avec leur ligne au journal", async () => {
    const u = await compteDeTest("bulles-credit");
    expect(await crediter(u.id, 50, "equipe", "equipe:test-1")).toBe(true);
    expect(await crediter(u.id, 50, "equipe", "equipe:test-1")).toBe(false);
    expect(await crediter(u.id, 20, "equipe", "equipe:test-2")).toBe(true);
    expect(await soldeDe(u.id)).toBe(70);
    expect(await mouvements(u.id)).toEqual([
      { delta: 50, raison: "equipe", ref: "equipe:test-1" },
      { delta: 20, raison: "equipe", ref: "equipe:test-2" },
    ]);
  });

  it("un débit ne passe jamais sous zéro ; débité une fois par réponse ; rendu une fois", async () => {
    const u = await compteDeTest("bulles-debit");
    await crediter(u.id, 3, "equipe", `equipe:${u.id}`);
    expect(await debiter(u, 2, "reponse-a")).toBe("debite");
    expect(await debiter(u, 2, "reponse-a")).toBe("deja");
    /* Il reste 1 : un vocal (2) ne passe pas, et rien n’est écrit */
    expect(await debiter(u, 2, "reponse-b")).toBe("insuffisant");
    expect(await soldeDe(u.id)).toBe(1);
    expect((await mouvements(u.id)).map((m) => m.ref)).toEqual([`equipe:${u.id}`, "reponse-a"]);
    /* La réponse a échoué : rendue, une fois ; une réponse jamais débitée n’a rien à rendre */
    expect(await rendre(u, "reponse-a")).toBe(true);
    expect(await rendre(u, "reponse-a")).toBe(false);
    expect(await rendre(u, "reponse-b")).toBe(false);
    expect(await soldeDe(u.id)).toBe(3);
  });

  it("deux débits en même temps sur la dernière bulle : un seul passe", async () => {
    const u = await compteDeTest("bulles-course");
    await crediter(u.id, 1, "equipe", `equipe:${u.id}`);
    const debits = await Promise.all([debiter(u, 1, "course-a"), debiter(u, 1, "course-b"), debiter(u, 1, "course-c")]);
    expect(debits.filter((d) => d === "debite")).toHaveLength(1);
    expect(debits.filter((d) => d === "insuffisant")).toHaveLength(2);
    expect(await soldeDe(u.id)).toBe(0);
    expect((await mouvements(u.id)).filter((m) => m.raison === "reponse")).toHaveLength(1);
  });

  it("l’équipe : jamais débitée", async () => {
    const equipe = await compteEquipe();
    expect(await debiter(equipe, 3, "reponse-equipe")).toBe("equipe");
    expect(await soldeDe(equipe.id)).toBe(0);
    expect(await mouvements(equipe.id)).toEqual([]);
  });

  it("une réponse verrouillée : payée à la recharge, une fois, et seulement par son compte", async () => {
    const [u, autre] = [await compteDeTest("bulles-verrou"), await compteDeTest("bulles-verrou-autre")];
    const id = await conv(u);
    const [message] = await db()
      .insert(schema.chatMessages)
      .values({
        storyId: id,
        role: "blush",
        data: coffre.ecrire("chat_messages.data:blush", { reponse: { kind: "bubbles", bubbles: [{ text: "Une réponse inventée." }] }, resume: "inventé" }),
        cout: 1,
        verrouillee: true,
      })
      .returning({ id: schema.chatMessages.id });
    expect(await reponseVerrouillee(u.id)).toEqual({ id: message!.id, storyId: id, cout: 1 });
    expect(await deverrouiller(u, message!.id)).toBe("insuffisant");
    expect(await deverrouiller(autre, message!.id)).toBe("aucune");
    await crediter(u.id, 30, "equipe", `equipe:${u.id}`);
    expect(await deverrouiller(u, message!.id)).toBe("deverrouillee");
    expect(await deverrouiller(u, message!.id)).toBe("aucune");
    expect(await reponseVerrouillee(u.id)).toBeNull();
    expect(await soldeDe(u.id)).toBe(29);
    expect((await mouvements(u.id)).at(-1)).toEqual({ delta: -1, raison: "reponse", ref: refDuMessage(message!.id) });
  });
});

describe("commander", () => {
  it("au prix et avec les bulles du catalogue, pour une conv à lui pas encore débloquée", async () => {
    const [u, autre, equipe] = [await compteDeTest("commande"), await compteDeTest("commande-autre"), await compteEquipe()];
    const id = await conv(u);
    const achat = await commande(u, "premium", { storyId: id, fournisseur: "factice" });
    expect(achat).toMatchObject({ userId: u.id, storyId: id, offre: "premium", centimes: CATALOGUE.premium.centimes, bulles: 90, statut: "en_attente", offreUnique: null });
    /* Sans conv, la conv d’un autre, une conv déjà débloquée, ou un compte de l’équipe (tout lui est ouvert) */
    expect(await commander(u, "rapport", { fournisseur: "factice" })).toBe("aucune");
    expect(await commander(autre, "rapport", { storyId: id, fournisseur: "factice" })).toBe("aucune");
    expect(await commander(equipe, "rapport", { storyId: await conv(equipe), fournisseur: "factice" })).toBe("deja");
    await debloquerLaConv(id);
    expect(await commander(u, "rapport", { storyId: id, fournisseur: "factice" })).toBe("deja");
    /* Des bulles seules : sans conv, même donnée */
    expect(await commande(u, "pack200", { storyId: id, fournisseur: "factice" })).toMatchObject({ storyId: null, centimes: 1990, bulles: 200 });
  });

  it("une offre unique seulement montrée et valable ; Premium pour 5 € de plus, seulement après un rapport payé", async () => {
    const u = await compteDeTest("commande-unique");
    const id = await conv(u);
    expect(await commander(u, "suite", { storyId: id, fournisseur: "factice" })).toBe("offre");
    expect(await montrer(u, "suite", { storyId: id })).not.toBeNull();
    /* La suite montrée pour cette conv ne se prend pas pour une autre */
    expect(await commander(u, "suite", { storyId: await conv(u), fournisseur: "factice" })).toBe("offre");
    const suite = await commande(u, "suite", { storyId: id, fournisseur: "factice" });
    expect(suite).toMatchObject({ centimes: 690, bulles: 10, offreUnique: "suite" });
    expect(await commander(u, "premium_ajout", { fournisseur: "factice" })).toBe("offre");
    await livrer(suite.id);
    /* Montrée juste après le paiement : mais la suite l’a été il y a moins de 24 h. Le lendemain, elle passe */
    expect(await montrer(u, "premium_ajout")).toBeNull();
    await reculer(u.id, "suite", 25 * 3600e3);
    expect(await montrer(u, "premium_ajout")).not.toBeNull();
    expect(await commande(u, "premium_ajout", { fournisseur: "factice" })).toMatchObject({ centimes: 500, bulles: 80, offreUnique: "premium_ajout", storyId: null });
  });

  it("le pack conseillé à la première recharge : +40 bulles, si l’offre est montrée", async () => {
    const u = await compteDeTest("commande-recharge");
    expect(await commande(u, "pack80", { fournisseur: "factice" })).toMatchObject({ bulles: 80, offreUnique: null });
    await montrer(u, "premiere_recharge");
    const achat = await commande(u, "pack80", { fournisseur: "factice" });
    expect(achat).toMatchObject({ bulles: 80 + PREMIERE_RECHARGE.bonus, offreUnique: "premiere_recharge" });
    /* Seulement sur le pack conseillé */
    expect(await commande(u, "pack30", { fournisseur: "factice" })).toMatchObject({ bulles: 30, offreUnique: null });
    await livrer(achat.id);
    expect(await offreValable(u.id, "premiere_recharge")).toBeNull();
    expect(await commande(u, "pack80", { fournisseur: "factice" })).toMatchObject({ bulles: 80, offreUnique: null });
  });
});

describe("livrer et reprendre", () => {
  beforeAll(() => {
    etat.apres.length = 0;
  });

  it("livrer, rejoué deux fois : la conv débloquée, les bulles créditées et le rapport relancé, une seule fois", async () => {
    const u = await compteDeTest("livrer");
    /* Une conv lue (le verdict seul) : le déblocage lance le rapport */
    const { id } = await histoireLue(u, "06-elle-hesite.txt");
    const achat = await commande(u, "rapport", { storyId: id, fournisseur: "factice" });
    const lances = etat.apres.length;
    const premiere = await livrer(achat.id, { paiementId: `pay_test_${achat.id}`, membreId: "mber_test", moyenId: "payt_test" });
    expect(premiere).toMatchObject({ effet: "livre", debloquee: true });
    expect(await rapportOuvertEnBase(id)).toBe(true);
    expect((await tachesDe(id)).filter((t) => t.kind === "rapport_plan").map((t) => t.status)).toEqual(["attente"]);
    expect(etat.apres.length).toBeGreaterThan(lances);
    expect(await achatEnBase(achat.id)).toMatchObject({ statut: "paye", paiementId: `pay_test_${achat.id}`, membreId: "mber_test", moyenId: "payt_test" });

    const apres = etat.apres.length;
    const [a, b] = await Promise.all([livrer(achat.id), livrer(achat.id)]);
    expect([a.effet, b.effet]).toEqual(["deja", "deja"]);
    expect(etat.apres).toHaveLength(apres);
    expect(await soldeDe(u.id)).toBe(10);
    expect(await mouvements(u.id)).toEqual([{ delta: 10, raison: "achat", ref: achat.id }]);
    etat.apres.length = 0;
  });

  it("deux livraisons du même achat en même temps : une seule livre", async () => {
    const u = await compteDeTest("livrer-course");
    const achat = await commande(u, "pack80", { fournisseur: "factice" });
    const effets = (await Promise.all([livrer(achat.id), livrer(achat.id), livrer(achat.id)])).map((l) => l.effet);
    expect(effets.filter((e) => e === "livre")).toHaveLength(1);
    expect(await soldeDe(u.id)).toBe(80);
  });

  it("reprendre, rejoué deux fois : la conv re-verrouillée, les bulles reprises (sous zéro s’il le faut), l’équipe prévenue une fois", async () => {
    const u = await compteDeTest("reprendre");
    const id = await conv(u);
    const achat = await commande(u, "premium", { storyId: id, fournisseur: "factice" });
    await livrer(achat.id);
    expect(await debiter(u, 1, "reponse-avant-remboursement")).toBe("debite");
    etat.alertes.length = 0;
    expect((await reprendre(achat.id, "rembourse")).effet).toBe("repris");
    expect((await reprendre(achat.id, "rembourse")).effet).toBe("deja");
    expect((await reprendre(achat.id, "conteste")).effet).toBe("deja");
    expect(etat.alertes).toEqual(["paiement remboursé"]);
    expect(await rapportOuvertEnBase(id)).toBe(false);
    expect(await soldeDe(u.id)).toBe(-1);
    expect((await achatEnBase(achat.id)).statut).toBe("rembourse");
    /* Le paiement réussi qui arrive après (les webhooks n’ont pas d’ordre) ne livre plus rien */
    expect((await livrer(achat.id)).effet).toBe("annule");
    expect(await soldeDe(u.id)).toBe(-1);
    expect(await estClient(u)).toBe(false);
  });

  it("un achat jamais livré : repris sans rien reprendre ; un paiement refusé ne passe qu’un achat en attente", async () => {
    const u = await compteDeTest("reprendre-rien");
    const [a, b] = [await commande(u, "pack30", { fournisseur: "factice" }), await commande(u, "pack30", { fournisseur: "factice" })];
    expect((await reprendre(a.id, "conteste")).effet).toBe("rien");
    expect(await mouvements(u.id)).toEqual([]);
    expect(await marquerEchoue(b.id)).toBe(true);
    expect(await marquerEchoue(b.id)).toBe(false);
    /* Un paiement qui réussit après un refus (une nouvelle tentative) livre quand même */
    expect((await livrer(b.id)).effet).toBe("livre");
    expect(await soldeDe(u.id)).toBe(30);
    expect((await livrer("00000000-0000-4000-8000-000000000000")).effet).toBe("inconnu");
  });

  it("une conv offerte par l’équipe (sans achat) : débloquée une fois", async () => {
    const u = await compteDeTest("offert");
    const id = await conv(u);
    expect(await offrirLeRapport({ id, userId: u.id })).toBe(true);
    expect(await offrirLeRapport({ id, userId: u.id })).toBe(false);
    expect(await rapportOuvertEnBase(id)).toBe(true);
  });

  it("un webhook déjà traité est ignoré ; un traitement qui échoue sera rejoué", async () => {
    const id = `msg_test_${Date.now()}`;
    let fois = 0;
    const panne = async (): Promise<number> => {
      throw new Error("panne");
    };
    await expect(uneFoisParEvenement(id, "payment.succeeded", panne)).rejects.toThrow("panne");
    expect(await uneFoisParEvenement(id, "payment.succeeded", async () => ++fois)).toBe(1);
    expect(await uneFoisParEvenement(id, "payment.succeeded", async () => ++fois)).toBe("deja");
    expect(fois).toBe(1);
    await db().delete(schema.evenementsPaiement).where(eq(schema.evenementsPaiement.id, id));
  });
});

describe("les offres uniques", () => {
  it("une fois par compte : montrée, retrouvée tant qu’elle vaut, puis plus jamais", async () => {
    const u = await compteDeTest("unique-une-fois");
    const id = await conv(u);
    const montree = await montrer(u, "suite", { storyId: id });
    expect(montree).toMatchObject({ offre: "suite", storyId: id });
    /* L’heure de fin vient du serveur : 5 minutes après l’avoir montrée */
    expect(montree!.expireLe!.getTime() - montree!.montreeLe.getTime()).toBe(DUREE_SUITE_MS);
    /* Une page rechargée retrouve le même compte à rebours */
    expect((await montrer(u, "suite", { storyId: id }))?.expireLe?.getTime()).toBe(montree!.expireLe!.getTime());
    const achat = await commande(u, "suite", { storyId: id, fournisseur: "factice" });
    await livrer(achat.id);
    expect(await montrer(u, "suite", { storyId: id })).toBeNull();
    expect(await offreValable(u.id, "suite")).toBeNull();
  });

  it("la suite expire après 5 minutes : plus montrée, plus vendue", async () => {
    const u = await compteDeTest("unique-expiree");
    const id = await conv(u);
    await montrer(u, "suite", { storyId: id });
    await reculer(u.id, "suite", DUREE_SUITE_MS + 1000);
    expect(await offreValable(u.id, "suite")).toBeNull();
    expect(await montrer(u, "suite", { storyId: id })).toBeNull();
    expect(await commander(u, "suite", { storyId: id, fournisseur: "factice" })).toBe("offre");
  });

  it("jamais deux à moins de 24 h l’une de l’autre, même demandées en même temps ; jamais à l’équipe", async () => {
    const u = await compteDeTest("unique-24h");
    const ensemble = await Promise.all([montrer(u, "relance_mail"), montrer(u, "premiere_recharge")]);
    expect(ensemble.filter((o) => o !== null)).toHaveLength(1);
    const montree = ensemble.find((o) => o !== null)!.offre;
    const autre = montree === "relance_mail" ? "premiere_recharge" : "relance_mail";
    expect(await montrer(u, autre)).toBeNull();
    await reculer(u.id, montree, 23 * 3600e3);
    expect(await montrer(u, autre)).toBeNull();
    await reculer(u.id, montree, 2 * 3600e3);
    expect(await montrer(u, autre)).not.toBeNull();
    expect(await montrer(await compteEquipe(), "suite")).toBeNull();
  });

  it("le mail de relance d’une conv compte comme pris quand son rapport est payé", async () => {
    const u = await compteDeTest("unique-relance");
    const id = await conv(u);
    await montrer(u, "relance_mail", { storyId: id });
    await livrer((await commande(u, "rapport", { storyId: id, fournisseur: "factice" })).id);
    const [l] = await db()
      .select({ priseLe: schema.offresUniques.priseLe })
      .from(schema.offresUniques)
      .where(and(eq(schema.offresUniques.userId, u.id), eq(schema.offresUniques.offre, "relance_mail")));
    expect(l?.priseLe).not.toBeNull();
  });
});
