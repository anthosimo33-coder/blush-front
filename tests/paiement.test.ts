import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Le paiement par Whop, avec la base, par ses routes : commencer un paiement (POST /api/paiement), le webhook
 * (POST /api/paiement/whop : livrer une fois, sous deux webhooks en même temps ; reprendre un remboursement ; refuser une
 * signature fausse ou un montant faux), le retour qui vérifie chez Whop (GET /api/paiement/[achat]), les offres uniques
 * (POST /api/paiement/offre) et le paiement en un geste de ③. Le prestataire est choisi par test (le faux Whop, Whop sur
 * un faux fetch, ou aucun) ; la session, after() de Next, les alertes et la relance de la chaîne du rapport sont simulés.
 * Chaque test a ses comptes : il passe seul comme dans n’importe quel ordre.
 */
const etat = vi.hoisted(() => ({
  /** Le prestataire de ce test : le faux Whop, Whop (son secret, son compte), ou aucun */
  mode: "factice" as "factice" | "whop" | null,
  /** Le compte de la session et sa conv ouverte (contexteRequete) */
  utilisateur: null as { id: string; email: string; bulles: number } | null,
  story: null as { id: string } | null,
  apres: [] as (() => unknown)[],
  alertes: [] as string[],
  relancees: [] as string[],
}));
const WHOP = vi.hoisted(() => ({ secret: "ws_secret_de_test_du_vrai_whop", compte: "biz_blush_test" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => void etat.apres.push(f) }));
vi.mock("@/server/donnees", async (original) => ({
  ...(await original<typeof import("@/server/donnees")>()),
  contexteRequete: async () => ({ utilisateur: etat.utilisateur, story: etat.story }),
}));
vi.mock("@/server/env", async (original) => ({ ...(await original<typeof import("@/server/env")>()), accesLibre: (email: string) => email.startsWith("equipe-") }));
vi.mock("@/server/alertes", async (original) => ({ ...(await original<typeof import("@/server/alertes")>()), alerter: async (sujet: string) => void etat.alertes.push(sujet) }));
vi.mock("@/server/pipeline", async (original) => ({
  ...(await original<typeof import("@/server/pipeline")>()),
  reparerLaChaine: async (story: { id: string }) => (etat.relancees.push(story.id), true),
}));
vi.mock("@/server/paiement/fournisseur", async () => {
  const { COMPTE_FACTICE, SECRET_FACTICE } = await import("@/server/paiement/factice-valeurs");
  return {
    fournisseur: () =>
      etat.mode === "factice"
        ? { mode: "factice", secret: SECRET_FACTICE, compte: COMPTE_FACTICE }
        : etat.mode === "whop"
          ? { mode: "whop", secret: WHOP.secret, compte: WHOP.compte, whop: { cle: "cle_fictive", compte: WHOP.compte, produit: "prod_test", bacASable: false } }
          : null,
  };
});

import { POST as commencer } from "@/app/api/paiement/route";
import { GET as lireEtat } from "@/app/api/paiement/[achat]/route";
import { POST as fauxWhop } from "@/app/api/paiement/factice/route";
import { POST as offre } from "@/app/api/paiement/offre/route";
import { POST as webhookRecu } from "@/app/api/paiement/whop/route";
import { CASE_RENONCIATION } from "@/contenu/consentements";
import type { Utilisateur } from "@/server/auth";
import { soldeDe } from "@/server/bulles";
import { db, schema } from "@/server/db";
import { webhookFactice, type WebhookFactice } from "@/server/paiement/factice";
import { signerWebhook } from "@/server/paiement/signature";
import type { EtatAchat, OffreUniqueMontree, PaiementCommence, WebhookDuFauxWhop } from "@/types/api";
import { compteDeTest, convRattachee, debloquerLaConv, ligneEnBase } from "./aide/fixtures";

const APPLI = "http://localhost";

beforeEach(() => {
  Object.assign(etat, { mode: "factice", utilisateur: null, story: null, apres: [], alertes: [], relancees: [] });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Passe après la réponse ce que les routes ont confié à after() (les alertes, le paiement en un geste du faux Whop). */
async function apresLaReponse(): Promise<void> {
  while (etat.apres.length) await etat.apres.shift()!();
}

/** Connecte ce compte, sur cette conv. */
const connecter = (u: Utilisateur, story: string | null = null) => {
  etat.utilisateur = { id: u.id, email: u.email, bulles: u.bulles };
  etat.story = story ? { id: story } : null;
};

/** Un appel de l’appli (même origine), avec ce corps JSON. */
const depuisLAppli = (chemin: string, corps?: unknown, methode = "POST") =>
  new Request(`${APPLI}${chemin}`, {
    method: methode,
    headers: { origin: APPLI, host: "localhost", "x-forwarded-for": "10.7.7.7", "content-type": "application/json" },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });

/** POST /api/paiement : la réponse et son corps. */
async function payer(corps: Record<string, unknown>): Promise<{ status: number; corps: PaiementCommence & { erreur?: string } }> {
  const r = await commencer(depuisLAppli("/api/paiement", corps));
  return { status: r.status, corps: (await r.json()) as PaiementCommence & { erreur?: string } };
}

/** Poste un webhook à la route de Whop, comme Whop (sans origine). */
const poster = (w: { corps: string; entetes: Record<string, string> }) =>
  webhookRecu(new Request(`${APPLI}/api/paiement/whop`, { method: "POST", headers: { ...w.entetes, "content-type": "application/json" }, body: w.corps }));

/** Le webhook du faux Whop pour cet achat (son bouton « Payer », « Refuser » ou « Rembourser »). */
async function issue(achat: string, quoi: "payer" | "refuser" | "rembourser"): Promise<WebhookFactice> {
  const r = await fauxWhop(depuisLAppli("/api/paiement/factice", { achat, issue: quoi }));
  expect(r.status).toBe(200);
  return ((await r.json()) as WebhookDuFauxWhop).webhook as WebhookFactice;
}

/** L’achat tel qu’il est en base. */
const achatEnBase = async (id: string) => (await db().select().from(schema.achats).where(eq(schema.achats.id, id)))[0]!;
/** Les mouvements de bulles du compte (raison et delta), dans l’ordre. */
const mouvements = async (userId: string) =>
  (await db().select().from(schema.mouvementsBulles).where(eq(schema.mouvementsBulles.userId, userId)).orderBy(schema.mouvementsBulles.id)).map((m) => [m.raison, m.delta]);

/** Un compte connecté, avec une conv à lui (pas lue, pas débloquée). */
async function acheteur(prefixe: string): Promise<{ u: Utilisateur; conv: string }> {
  const u = await compteDeTest(prefixe);
  const conv = (await convRattachee(u, "02-reciproque.txt")).id;
  connecter(u, conv);
  return { u, conv };
}

/** Commande le rapport de sa conv au faux Whop, puis le paie : l’id de l’achat. */
async function rapportPaye(offreId: "rapport" | "premium" = "rapport"): Promise<string> {
  const { corps } = await payer({ offre: offreId, renonciation: CASE_RENONCIATION.version });
  expect((await poster(await issue(corps.achat, "payer"))).status).toBe(200);
  return corps.achat;
}

describe("commencer un paiement (POST /api/paiement)", () => {
  it("sans la case de renonciation cochée, rien ne part : 422 « renonciation », aucun achat", async () => {
    const { u } = await acheteur("paie-renonce");
    /* Sans la case, décochée, l’ancien `true` (un onglet d’avant la version), ou une version qui n’est plus la bonne */
    for (const corps of [
      { offre: "rapport" },
      { offre: "rapport", renonciation: false },
      { offre: "rapport", renonciation: true },
      { offre: "rapport", renonciation: "2020-01-01" },
    ])
      expect(await payer(corps), JSON.stringify(corps)).toEqual({ status: 422, corps: { erreur: "renonciation" } });
    expect(await db().select().from(schema.achats).where(eq(schema.achats.userId, u.id))).toEqual([]);
  });

  it("la case cochée : l’achat garde sa version et l’heure où le serveur l’a reçue", async () => {
    await acheteur("paie-renonce-garde");
    const avant = Date.now();
    const { status, corps } = await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version });
    expect(status).toBe(200);
    const achat = await achatEnBase(corps.achat);
    expect(achat.renonciationVersion).toBe(CASE_RENONCIATION.version);
    expect(achat.renonciationLe!.getTime()).toBeGreaterThanOrEqual(avant - 1000);
    expect(achat.renonciationLe!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("sans paiement branché (ni Whop, ni le faux Whop) : 402 « bientot », aucun achat", async () => {
    const { u } = await acheteur("paie-bientot");
    etat.mode = null;
    expect(await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version })).toEqual({ status: 402, corps: { erreur: "bientot" } });
    expect(await db().select().from(schema.achats).where(eq(schema.achats.userId, u.id))).toEqual([]);
  });

  it("le faux Whop : l’achat en attente au prix du catalogue, pour la conv de la page, et sa page de paiement locale", async () => {
    const { u, conv } = await acheteur("paie-factice");
    const { status, corps } = await payer({ offre: "premium", renonciation: CASE_RENONCIATION.version });
    expect(status).toBe(200);
    expect(corps.url).toBe(`/paiement/factice?achat=${corps.achat}`);
    expect(corps.checkout).toMatch(/^ch_faux_/);
    expect(await achatEnBase(corps.achat)).toMatchObject({
      userId: u.id,
      storyId: conv,
      offre: "premium",
      centimes: 1490,
      bulles: 90,
      statut: "en_attente",
      fournisseur: "factice",
      checkoutId: corps.checkout,
    });
  });

  it("refusé : l’équipe ou un rapport déjà ouvert (409 « deja »), la conv d’un autre (404 « aucune »), une offre unique pas montrée (422 « offre »)", async () => {
    const { conv } = await acheteur("paie-refus");
    await debloquerLaConv(conv);
    expect(await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version })).toEqual({ status: 409, corps: { erreur: "deja" } });
    const autre = await acheteur("paie-refus-autre");
    expect(await payer({ offre: "rapport", conv, renonciation: CASE_RENONCIATION.version })).toEqual({ status: 404, corps: { erreur: "aucune" } });
    expect(await payer({ offre: "suite", renonciation: CASE_RENONCIATION.version })).toEqual({ status: 422, corps: { erreur: "offre" } });
    expect(await payer({ offre: "premium_ajout", renonciation: CASE_RENONCIATION.version })).toEqual({ status: 422, corps: { erreur: "offre" } });
    connecter(await compteDeTest("equipe-paie"));
    expect(await payer({ offre: "pack80", renonciation: CASE_RENONCIATION.version })).toEqual({ status: 409, corps: { erreur: "deja" } });
    expect(autre.conv).not.toBe(conv);
  });

  it("Whop : sa configuration de paiement (prix en ligne, achat en métadonnées, retour sur le site) ; Whop qui refuse laisse l’achat échoué (502)", async () => {
    const { u } = await acheteur("paie-whop");
    etat.mode = "whop";
    const corpsEnvoyes: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_: string, init: RequestInit) => {
        corpsEnvoyes.push(JSON.parse(init.body as string));
        return Response.json({ id: "ch_whop_1", purchase_url: "https://whop.com/checkout/ch_whop_1/" });
      }),
    );
    const { status, corps } = await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version });
    expect([status, corps.url, corps.checkout]).toEqual([200, "https://whop.com/checkout/ch_whop_1/", "ch_whop_1"]);
    expect(corpsEnvoyes).toEqual([expect.objectContaining({ metadata: { achat: corps.achat }, redirect_url: `https://www.askblush.com/paiement/retour?achat=${corps.achat}` })]);
    expect(await achatEnBase(corps.achat)).toMatchObject({ fournisseur: "whop", checkoutId: "ch_whop_1", centimes: 990 });
    /* Ce que Whop voit : l’achat et son prix, ni l’email, ni la conv */
    expect(JSON.stringify(corpsEnvoyes)).not.toContain(u.email);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    expect(await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version })).toEqual({ status: 502, corps: { erreur: "panne" } });
    const statuts = (await db().select().from(schema.achats).where(eq(schema.achats.userId, u.id))).map((a) => a.statut).sort();
    expect(statuts).toEqual(["echoue", "en_attente"]);
  });
});

describe("le webhook (POST /api/paiement/whop)", () => {
  it("payé : la conv débloquée, les bulles créditées, la chaîne relancée, le paiement et son moyen gardés ; rejoué, rien de plus", async () => {
    const { u, conv } = await acheteur("hook-livre");
    const { corps } = await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version });
    const w = await issue(corps.achat, "payer");
    const r = await poster(w);
    expect([r.status, await r.json()]).toEqual([200, { ok: true }]);
    expect(await achatEnBase(corps.achat)).toMatchObject({
      statut: "paye",
      paiementId: expect.stringMatching(/^pay_faux_/),
      membreId: "mber_faux_whop",
      moyenId: "payt_faux_whop",
    });
    expect((await ligneEnBase(conv)).debloqueLe).not.toBeNull();
    expect(await soldeDe(u.id)).toBe(10);
    expect(etat.relancees).toEqual([conv]);
    /* Le même webhook rejoué (Whop réessaie) : ignoré par son identifiant */
    expect((await poster(w)).status).toBe(200);
    /* Un autre envoi du même paiement : ignoré par le paiement (déjà livré) */
    const encore = JSON.parse(w.corps) as { type: string; data: Record<string, unknown> };
    expect((await poster(webhookFactice(encore.type, encore.data))).status).toBe(200);
    expect(await soldeDe(u.id)).toBe(10);
    expect(await mouvements(u.id)).toEqual([["achat", 10]]);
    expect(etat.relancees).toEqual([conv]);
  });

  it("deux webhooks en même temps (le même, et deux envois du même paiement) : livré une seule fois", async () => {
    const { u } = await acheteur("hook-course");
    const { corps } = await payer({ offre: "premium", renonciation: CASE_RENONCIATION.version });
    const w = await issue(corps.achat, "payer");
    const data = (JSON.parse(w.corps) as { data: Record<string, unknown> }).data;
    const reponses = await Promise.all([poster(w), poster(w), poster(webhookFactice("payment.succeeded", data)), poster(webhookFactice("payment.succeeded", data))]);
    expect(reponses.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(await soldeDe(u.id)).toBe(90);
    expect(await mouvements(u.id)).toEqual([["achat", 90]]);
  });

  it("une signature fausse, ou sans signature : 401 « interdit », rien de livré ; l’équipe prévenue d’une signature fausse", async () => {
    const { u } = await acheteur("hook-signature");
    const { corps } = await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version });
    const w = await issue(corps.achat, "payer");
    const touche = { corps: w.corps.replace('"9.90"', '"0.01"'), entetes: w.entetes };
    for (const faux of [touche, { corps: w.corps, entetes: { ...w.entetes, "webhook-signature": "v1,AAAA" } }, { corps: w.corps, entetes: {} }]) {
      const r = await poster(faux);
      expect([r.status, await r.json()]).toEqual([401, { erreur: "interdit" }]);
    }
    /* Signé du secret du vrai Whop alors que c’est le faux qui encaisse : refusé aussi */
    expect((await poster({ corps: w.corps, entetes: signerWebhook(WHOP.secret, "msg_autre", w.corps) })).status).toBe(401);
    await apresLaReponse();
    /* Sans en-têtes de signature (un robot, pas Whop) : le journal seulement */
    expect(etat.alertes).toEqual(Array(3).fill("paiement : webhook refusé"));
    expect((await achatEnBase(corps.achat)).statut).toBe("en_attente");
    expect(await soldeDe(u.id)).toBe(0);
  });

  it("un montant faux (ou une autre devise) : rien de livré, l’équipe prévenue ; un autre compte Whop : ignoré", async () => {
    const { u, conv } = await acheteur("hook-montant");
    const { corps } = await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version });
    const data = (JSON.parse((await issue(corps.achat, "payer")).corps) as { data: Record<string, unknown> }).data;
    for (const faux of [
      { ...data, total: { amount: "0.99", currency: "eur" } },
      { ...data, total: { amount: "9.90", currency: "usd" }, currency: "usd" },
    ])
      expect((await poster(webhookFactice("payment.succeeded", faux))).status).toBe(200);
    /* Signé du bon secret, mais d’un autre compte : ignoré sans bruit */
    const autreCompte = JSON.stringify({ id: "evt_x", type: "payment.succeeded", account_id: "biz_un_autre", data });
    expect((await poster({ corps: autreCompte, entetes: webhookFactice("x", {}).entetes })).status).toBe(401);
    const { SECRET_FACTICE } = await import("@/server/paiement/factice-valeurs");
    expect((await poster({ corps: autreCompte, entetes: signerWebhook(SECRET_FACTICE, "msg_autre_compte", autreCompte) })).status).toBe(200);
    await apresLaReponse();
    expect(etat.alertes.filter((s) => s === "paiement : montant inattendu")).toHaveLength(2);
    expect((await achatEnBase(corps.achat)).statut).toBe("en_attente");
    expect((await ligneEnBase(conv)).debloqueLe).toBeNull();
    expect(await soldeDe(u.id)).toBe(0);
  });

  it("refusé (payment.failed) : l’achat échoue ; remboursé : la conv re-verrouillée, les bulles reprises (sous zéro), l’équipe prévenue, une fois", async () => {
    const { u, conv } = await acheteur("hook-rembourse");
    const { corps: refuse } = await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version });
    expect((await poster(await issue(refuse.achat, "refuser"))).status).toBe(200);
    expect((await achatEnBase(refuse.achat)).statut).toBe("echoue");

    const achat = await rapportPaye();
    expect(await soldeDe(u.id)).toBe(10);
    /* Il a dépensé 4 bulles avant d’être remboursé : le solde passe sous zéro */
    await db().transaction(async (tx) => {
      await tx.insert(schema.mouvementsBulles).values({ userId: u.id, delta: -4, raison: "reponse", ref: `test:${achat}` });
      await tx.update(schema.users).set({ bulles: 6 }).where(eq(schema.users.id, u.id));
    });
    const rembourse = await issue(achat, "rembourser");
    expect((await poster(rembourse)).status).toBe(200);
    expect((await poster(rembourse)).status).toBe(200);
    expect(await achatEnBase(achat)).toMatchObject({ statut: "rembourse" });
    expect((await ligneEnBase(conv)).debloqueLe).toBeNull();
    expect(await soldeDe(u.id)).toBe(-4);
    expect(etat.alertes).toEqual(["paiement remboursé"]);
    /* Remboursé, il ne se livre plus : le paiement rejoué ne rouvre rien */
    expect(
      (await poster(webhookFactice("payment.succeeded", { id: (await achatEnBase(achat)).paiementId, status: "paid", metadata: { achat }, total: 9.9, currency: "eur" }))).status,
    ).toBe(200);
    expect((await ligneEnBase(conv)).debloqueLe).toBeNull();
  });

  it("un litige ouvert (Whop) : contesté, re-verrouillé ; le remboursement arrivé avant le paiement : rien ne sera livré", async () => {
    const { u, conv } = await acheteur("hook-litige");
    etat.mode = "whop";
    /* Ce que Whop dit d’un paiement qu’on lui demande : l’achat de ses métadonnées */
    let achatAttendu = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/checkout_configurations")
          ? Response.json({ id: "ch_1", purchase_url: "https://whop.com/checkout/ch_1/" })
          : Response.json({ id: url.split("/").pop(), status: "paid", metadata: { achat: achatAttendu }, total: 9.9, currency: "eur" }),
      ),
    );
    const signe = (type: string, data: unknown) => {
      const corps = JSON.stringify({ id: `evt_${type}`, type, account_id: WHOP.compte, data });
      return { corps, entetes: signerWebhook(WHOP.secret, `msg_${Math.random()}`, corps) };
    };
    const paiementWhop = (achat: string, id: string) => ({
      id,
      status: "paid",
      metadata: { achat },
      total: { amount: "9.90", currency: "eur" },
      currency: "eur",
      member_id: "mber_w",
      payment_method_id: null,
    });

    const { corps: premier } = await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version });
    expect((await poster(signe("payment.succeeded", paiementWhop(premier.achat, "pay_w1")))).status).toBe(200);
    expect(await soldeDe(u.id)).toBe(10);
    expect((await poster(signe("dispute.created", { id: "dspt_1", status: "needs_response", payment_id: "pay_w1" }))).status).toBe(200);
    expect(await achatEnBase(premier.achat)).toMatchObject({ statut: "conteste" });
    expect((await ligneEnBase(conv)).debloqueLe).toBeNull();
    expect(await soldeDe(u.id)).toBe(0);
    await apresLaReponse();
    expect(etat.alertes).toContain("paiement contesté");

    /* Le remboursement d’un paiement encore inconnu : Whop dit quel achat il payait, qui ne sera plus livré */
    const { corps: second } = await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version });
    achatAttendu = second.achat;
    expect((await poster(signe("refund.created", { id: "rfnd_1", status: "succeeded", payment_id: "pay_w2" }))).status).toBe(200);
    expect(await achatEnBase(second.achat)).toMatchObject({ statut: "rembourse" });
    expect((await poster(signe("payment.succeeded", paiementWhop(second.achat, "pay_w2")))).status).toBe(200);
    expect(await achatEnBase(second.achat)).toMatchObject({ statut: "rembourse" });
    expect((await ligneEnBase(conv)).debloqueLe).toBeNull();
    expect(await soldeDe(u.id)).toBe(0);
  });
});

/** Un webhook de Whop (pas du faux), signé de son secret, de son compte. */
const signeWhop = (type: string, data: unknown) => {
  const corps = JSON.stringify({ id: `evt_${type}`, type, account_id: WHOP.compte, data });
  return { corps, entetes: signerWebhook(WHOP.secret, `msg_${crypto.randomUUID()}`, corps) };
};

/** Un paiement de Whop de cet achat, à ce prix, avec le moyen de paiement gardé de l’acheteur. */
const paiementDeWhop = (achat: string, id: string, montant = "9.90") => ({
  id,
  status: "paid",
  metadata: { achat },
  total: { amount: montant, currency: "eur" },
  currency: "eur",
  member_id: "mber_w",
  payment_method_id: "payt_w",
});

describe("payé deux fois", () => {
  it("le même achat payé par deux paiements : livré une fois, l’équipe prévenue ; rembourser (ou contester) le doublon ne reprend rien", async () => {
    const { u, conv } = await acheteur("double-paiement");
    etat.mode = "whop";
    let achat = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.endsWith("/checkout_configurations") ? Response.json({ id: "ch_d" }) : Response.json(paiementDeWhop(achat, url.split("/").pop()!)))),
    );
    achat = (await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version })).corps.achat;
    expect((await poster(signeWhop("payment.succeeded", paiementDeWhop(achat, "pay_d1")))).status).toBe(200);
    expect((await poster(signeWhop("payment.succeeded", paiementDeWhop(achat, "pay_d2")))).status).toBe(200);
    expect(await mouvements(u.id)).toEqual([["achat", 10]]);
    /* L’équipe rembourse le doublon, comme l’alerte le demande ; puis un litige sur lui : le rapport payé reste ouvert */
    expect((await poster(signeWhop("refund.created", { id: "rfnd_d2", status: "succeeded", payment_id: "pay_d2" }))).status).toBe(200);
    expect((await poster(signeWhop("dispute.created", { id: "dspt_d2", status: "needs_response", payment_id: "pay_d2" }))).status).toBe(200);
    expect(await achatEnBase(achat)).toMatchObject({ statut: "paye", paiementId: "pay_d1" });
    expect((await ligneEnBase(conv)).debloqueLe).not.toBeNull();
    expect(await soldeDe(u.id)).toBe(10);
    await apresLaReponse();
    expect(etat.alertes).toEqual(["paiement : payé deux fois", "paiement en double remboursé", "paiement en double contesté"]);
    /* Le paiement qui l’a livré, remboursé : là, l’achat est repris */
    expect((await poster(signeWhop("refund.created", { id: "rfnd_d1", status: "succeeded", payment_id: "pay_d1" }))).status).toBe(200);
    expect(await achatEnBase(achat)).toMatchObject({ statut: "rembourse" });
    expect((await ligneEnBase(conv)).debloqueLe).toBeNull();
    expect(await soldeDe(u.id)).toBe(0);
  });

  it("deux commandes du même rapport, payées toutes les deux : les bulles de chacune, l’équipe prévenue de la seconde", async () => {
    const { u, conv } = await acheteur("double-commande");
    const [une, deux] = [
      (await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version })).corps,
      (await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version })).corps,
    ];
    expect((await poster(await issue(une.achat, "payer"))).status).toBe(200);
    await apresLaReponse();
    expect(etat.alertes).toEqual([]);
    expect((await poster(await issue(deux.achat, "payer"))).status).toBe(200);
    await apresLaReponse();
    expect(etat.alertes).toEqual(["paiement : rapport déjà ouvert"]);
    expect((await ligneEnBase(conv)).debloqueLe).not.toBeNull();
    expect(await soldeDe(u.id)).toBe(20);
    expect(etat.relancees).toEqual([conv]);
  });

  it("un sous-total au prix mais un total plus bas (une remise chez Whop) : rien de livré, l’équipe prévenue", async () => {
    const { u, conv } = await acheteur("remise");
    const { corps } = await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version });
    const data = (JSON.parse((await issue(corps.achat, "payer")).corps) as { data: Record<string, unknown> }).data;
    const remise = { ...data, total: { amount: "0.00", currency: "eur" }, subtotal: { amount: "9.90", currency: "eur" } };
    expect((await poster(webhookFactice("payment.succeeded", remise))).status).toBe(200);
    await apresLaReponse();
    expect(etat.alertes).toEqual(["paiement : montant inattendu"]);
    expect((await achatEnBase(corps.achat)).statut).toBe("en_attente");
    expect((await ligneEnBase(conv)).debloqueLe).toBeNull();
    expect(await soldeDe(u.id)).toBe(0);
  });
});

describe("le retour (GET /api/paiement/[achat])", () => {
  const etatDe = async (achat: string, paiement?: string) => {
    const r = await lireEtat(new Request(`${APPLI}/api/paiement/${achat}${paiement ? `?paiement=${paiement}` : ""}`), { params: Promise.resolve({ achat }) });
    return { status: r.status, corps: (await r.json()) as EtatAchat };
  };

  it("l’état de son achat ; celui d’un autre compte : 404", async () => {
    const { conv } = await acheteur("retour-etat");
    const achat = await rapportPaye();
    expect(await etatDe(achat)).toEqual({ status: 200, corps: { achat, offre: "rapport", statut: "paye", bulles: 10, conv } });
    await acheteur("retour-intrus");
    expect((await etatDe(achat)).status).toBe(404);
  });

  it("le webhook tarde : le paiement de l’adresse est vérifié chez Whop, et livré s’il paie cet achat, au bon montant", async () => {
    const { u } = await acheteur("retour-whop");
    etat.mode = "whop";
    let paiementChezWhop: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.endsWith("/checkout_configurations") ? Response.json({ id: "ch_r" }) : Response.json(paiementChezWhop))),
    );
    const { corps } = await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version });
    /* Le paiement d’un autre achat, ou pas encore encaissé : rien */
    paiementChezWhop = { id: "pay_r", status: "paid", metadata: { achat: "0b7e3f4c-0000-4000-8000-000000000001" }, total: 9.9, currency: "eur" };
    expect((await etatDe(corps.achat, "pay_r")).corps.statut).toBe("en_attente");
    paiementChezWhop = { id: "pay_r", status: "pending", metadata: { achat: corps.achat }, total: 9.9, currency: "eur" };
    expect((await etatDe(corps.achat, "pay_r")).corps.statut).toBe("en_attente");
    paiementChezWhop = { ...paiementChezWhop, status: "paid" };
    expect((await etatDe(corps.achat, "pay_r")).corps.statut).toBe("paye");
    expect(await soldeDe(u.id)).toBe(10);
  });

  it("une première carte refusée (l’achat échoué), une autre acceptée sur la même page de Whop : le retour le vérifie et le livre, sans attendre le webhook", async () => {
    const { u, conv } = await acheteur("retour-seconde-carte");
    etat.mode = "whop";
    let achat = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.endsWith("/checkout_configurations") ? Response.json({ id: "ch_s" }) : Response.json(paiementDeWhop(achat, "pay_s2")))),
    );
    achat = (await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version })).corps.achat;
    expect((await poster(signeWhop("payment.failed", { ...paiementDeWhop(achat, "pay_s1"), status: "failed" }))).status).toBe(200);
    expect((await etatDe(achat)).corps.statut).toBe("echoue");
    expect((await etatDe(achat, "pay_s2")).corps.statut).toBe("paye");
    expect((await ligneEnBase(conv)).debloqueLe).not.toBeNull();
    expect(await soldeDe(u.id)).toBe(10);
  });
});

describe("les offres uniques et le paiement en un geste", () => {
  const montrer = async (o: "suite" | "premium_ajout") => (await (await offre(depuisLAppli("/api/paiement/offre", { offre: o }))).json()) as OffreUniqueMontree;

  it("① la suite : montrée pour la conv de la page (5 minutes), puis payée 6,90 € ; jamais sans prestataire", async () => {
    await acheteur("offre-suite");
    etat.mode = null;
    expect(await montrer("suite")).toEqual({ offre: null });
    etat.mode = "factice";
    const m = await montrer("suite");
    expect(m).toMatchObject({ offre: "suite", enUnGeste: false });
    const reste = Date.parse((m as { fin: string }).fin) - Date.now();
    expect(reste).toBeGreaterThan(4 * 60_000);
    expect(reste).toBeLessThanOrEqual(5 * 60_000);
    const { status, corps } = await payer({ offre: "suite", renonciation: CASE_RENONCIATION.version });
    expect(status).toBe(200);
    expect(await achatEnBase(corps.achat)).toMatchObject({ offre: "suite", centimes: 690, bulles: 10 });
  });

  it("③ après le rapport seul : montrée, payée en un geste avec le moyen gardé (le webhook suit), +80 bulles ; pas deux fois", async () => {
    const { u } = await acheteur("offre-ajout");
    expect(await montrer("premium_ajout")).toEqual({ offre: null });
    await rapportPaye();
    expect(await montrer("premium_ajout")).toEqual({ offre: "premium_ajout", fin: null, enUnGeste: true });
    const { status, corps } = await payer({ offre: "premium_ajout", renonciation: CASE_RENONCIATION.version });
    expect([status, corps.url, corps.checkout]).toEqual([200, null, null]);
    expect((await achatEnBase(corps.achat)).statut).toBe("en_attente");
    await apresLaReponse();
    expect(await achatEnBase(corps.achat)).toMatchObject({ statut: "paye", centimes: 500 });
    expect(await soldeDe(u.id)).toBe(90);
    expect(await montrer("premium_ajout")).toEqual({ offre: null });
    expect(await payer({ offre: "premium_ajout", renonciation: CASE_RENONCIATION.version })).toEqual({ status: 422, corps: { erreur: "offre" } });
  });

  it("③ en un geste chez Whop, sans réponse ou illisible : aucune page de plus (pas de second débit), l’achat échoue, et son webhook le livre quand même", async () => {
    const { u } = await acheteur("offre-geste-whop");
    etat.mode = "whop";
    let reponseAuGeste: () => Response = () => new Response("{}", { status: 500 });
    const appels: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const chemin = new URL(url).pathname.replace("/api/v1", "");
        appels.push(chemin);
        if (chemin === "/payments") return reponseAuGeste();
        return Response.json({ id: "ch_g", purchase_url: "https://whop.com/checkout/ch_g/" });
      }),
    );
    const rapport = (await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version })).corps.achat;
    expect((await poster(signeWhop("payment.succeeded", paiementDeWhop(rapport, "pay_g1")))).status).toBe(200);
    expect(await montrer("premium_ajout")).toEqual({ offre: "premium_ajout", fin: null, enUnGeste: true });
    appels.length = 0;

    /* Whop ne répond pas (ou une panne) : le paiement a pu partir ; aucune page de plus, l’achat échoue (son webhook le livrerait quand même) */
    for (const reponse of [() => new Response("{}", { status: 500 }), () => new Response("pas du json", { status: 200 })]) {
      reponseAuGeste = reponse;
      expect(await payer({ offre: "premium_ajout", renonciation: CASE_RENONCIATION.version })).toEqual({ status: 502, corps: { erreur: "panne" } });
    }
    expect(appels).toEqual(["/payments", "/payments"]);
    const echoues = (await db().select().from(schema.achats).where(eq(schema.achats.userId, u.id))).filter((a) => a.offre === "premium_ajout");
    expect(echoues.map((a) => a.statut)).toEqual(["echoue", "echoue"]);
    /* Débité malgré la panne : le webhook livre l’achat échoué */
    expect((await poster(signeWhop("payment.succeeded", paiementDeWhop(echoues[1]!.id, "pay_g2", "5.00")))).status).toBe(200);
    expect(await achatEnBase(echoues[1]!.id)).toMatchObject({ statut: "paye" });
    expect(await soldeDe(u.id)).toBe(90);
  });

  it("③ en un geste chez Whop, refusé net : la page de paiement normale", async () => {
    await acheteur("offre-geste-refus");
    etat.mode = "whop";
    const appels: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const chemin = new URL(url).pathname.replace("/api/v1", "");
        appels.push(chemin);
        if (chemin === "/payments") return new Response("{}", { status: 400 });
        return Response.json({ id: "ch_r", purchase_url: "https://whop.com/checkout/ch_r/" });
      }),
    );
    const rapport = (await payer({ offre: "rapport", renonciation: CASE_RENONCIATION.version })).corps.achat;
    expect((await poster(signeWhop("payment.succeeded", paiementDeWhop(rapport, "pay_r1")))).status).toBe(200);
    expect((await montrer("premium_ajout")).offre).toBe("premium_ajout");
    appels.length = 0;
    const { status, corps } = await payer({ offre: "premium_ajout", renonciation: CASE_RENONCIATION.version });
    expect([status, corps.url, corps.checkout]).toEqual([200, "https://whop.com/checkout/ch_r/", "ch_r"]);
    expect(appels).toEqual(["/payments", "/checkout_configurations"]);
    expect(await achatEnBase(corps.achat)).toMatchObject({ statut: "en_attente", centimes: 500 });
  });
});
