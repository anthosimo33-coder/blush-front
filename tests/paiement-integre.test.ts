import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Le paiement dans la feuille et les offres de « C’est débloqué », avec la base, par leurs routes : le jeton des Elements
 * de Whop (POST /api/paiement avec `jeton` : le faux Whop, puis Whop sur un faux fetch), ce que la feuille doit savoir
 * (GET /api/paiement/feuille), le 2e rapport (⑤) et son usage (POST /api/paiement/avance), le −50 % gardé (⑥), et la
 * règle des 24 h assouplie entre les offres du merci. Le prestataire est choisi par test ; la session, after() de Next,
 * les alertes et la relance de la chaîne du rapport sont simulés. Chaque test a ses comptes.
 */
const etat = vi.hoisted(() => ({
  mode: "factice" as "factice" | "whop" | null,
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
import { POST as avance } from "@/app/api/paiement/avance/route";
import { GET as lireFeuille } from "@/app/api/paiement/feuille/route";
import { POST as offre } from "@/app/api/paiement/offre/route";
import { POST as fauxWhop } from "@/app/api/paiement/factice/route";
import { POST as webhookRecu } from "@/app/api/paiement/whop/route";
import { CASE_RENONCIATION } from "@/contenu/consentements";
import { DUREE_GARDE_MS, RAPPORT_D_AVANCE } from "@/contenu/offres";
import type { Utilisateur } from "@/server/auth";
import { soldeDe } from "@/server/bulles";
import { db, schema } from "@/server/db";
import type { WebhookFactice } from "@/server/paiement/factice";
import type { FeuilleDuPaiement, OffreUniqueMontree, PaiementCommence, WebhookDuFauxWhop } from "@/types/api";
import type { OffreProposee } from "@/types";
import { compteDeTest, convRattachee, ligneEnBase } from "./aide/fixtures";

const APPLI = "http://localhost";

beforeEach(() => {
  Object.assign(etat, { mode: "factice", utilisateur: null, story: null, apres: [], alertes: [], relancees: [] });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Passe après la réponse ce que les routes ont confié à after() (le webhook du faux Whop, les alertes). */
async function apresLaReponse(): Promise<void> {
  while (etat.apres.length) await etat.apres.shift()!();
}

const connecter = (u: Utilisateur, story: string | null = null) => {
  etat.utilisateur = { id: u.id, email: u.email, bulles: u.bulles };
  etat.story = story ? { id: story } : null;
};

const depuisLAppli = (chemin: string, corps?: unknown, methode = "POST") =>
  new Request(`${APPLI}${chemin}`, {
    method: methode,
    headers: { origin: APPLI, host: "localhost", "x-forwarded-for": "10.7.7.8", "content-type": "application/json" },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });

/** POST /api/paiement : la réponse et son corps. */
async function payer(corps: Record<string, unknown>): Promise<{ status: number; corps: PaiementCommence & { erreur?: string } }> {
  const r = await commencer(depuisLAppli("/api/paiement", { renonciation: CASE_RENONCIATION.version, ...corps }));
  return { status: r.status, corps: (await r.json()) as PaiementCommence & { erreur?: string } };
}

/** POST /api/paiement/avance : la réponse et son corps. */
async function utiliser(corps: Record<string, unknown> = {}): Promise<{ status: number; corps: { achat?: string; erreur?: string } }> {
  const r = await avance(depuisLAppli("/api/paiement/avance", { renonciation: CASE_RENONCIATION.version, ...corps }));
  return { status: r.status, corps: (await r.json()) as { achat?: string; erreur?: string } };
}

/** GET /api/paiement/feuille. */
async function feuille(): Promise<FeuilleDuPaiement> {
  const r = await lireFeuille();
  expect(r.status).toBe(200);
  return (await r.json()) as FeuilleDuPaiement;
}

/** POST /api/paiement/offre, pour l’achat qui vient d’être payé. */
const montrer = async (o: OffreProposee, achat?: string) =>
  (await (await offre(depuisLAppli("/api/paiement/offre", { offre: o, ...(achat ? { achat } : {}) }))).json()) as OffreUniqueMontree;

const poster = (w: { corps: string; entetes: Record<string, string> }) =>
  webhookRecu(new Request(`${APPLI}/api/paiement/whop`, { method: "POST", headers: { ...w.entetes, "content-type": "application/json" }, body: w.corps }));

/** Le webhook du faux Whop pour cet achat (son bouton « Payer » ou « Rembourser »). */
async function issue(achat: string, quoi: "payer" | "rembourser"): Promise<WebhookFactice> {
  const r = await fauxWhop(depuisLAppli("/api/paiement/factice", { achat, issue: quoi }));
  expect(r.status).toBe(200);
  return ((await r.json()) as WebhookDuFauxWhop).webhook as WebhookFactice;
}

const achatEnBase = async (id: string) => (await db().select().from(schema.achats).where(eq(schema.achats.id, id)))[0]!;

/** Un compte connecté, avec une conv à lui (pas débloquée). */
async function acheteur(prefixe: string): Promise<{ u: Utilisateur; conv: string }> {
  const u = await compteDeTest(prefixe);
  const conv = (await convRattachee(u, "02-reciproque.txt")).id;
  connecter(u, conv);
  return { u, conv };
}

/** Une autre conv du même compte, ouverte à son tour (la page la désigne). */
async function autreConv(u: Utilisateur): Promise<string> {
  const conv = (await convRattachee(u, "02-reciproque.txt")).id;
  connecter(u, conv);
  return conv;
}

/** Paie cette offre dans la feuille du faux Whop (sa carte de test), puis le webhook qui suit : l’id de l’achat. */
async function payeDansLaFeuille(offreId: string): Promise<string> {
  const { status, corps } = await payer({ offre: offreId, jeton: "ctok_faux_payer" });
  expect(status).toBe(200);
  await apresLaReponse();
  expect((await achatEnBase(corps.achat)).statut).toBe("paye");
  return corps.achat;
}

/** Le 2e rapport pris sur « C’est débloqué », juste après Premium : l’id de son achat. */
async function secondPris(): Promise<string> {
  const premium = await payeDansLaFeuille("premium");
  expect((await montrer("second_rapport", premium)).offre).toBe("second_rapport");
  return payeDansLaFeuille("second");
}

describe("le paiement dans la feuille (POST /api/paiement avec un jeton)", () => {
  it("le faux Whop : sa carte de test paie l’achat ; le webhook qui suit le livre (la conv s’ouvre, les bulles arrivent)", async () => {
    const { u, conv } = await acheteur("feuille-factice");
    const { status, corps } = await payer({ offre: "premium", jeton: "ctok_faux_payer" });
    expect(status).toBe(200);
    expect(corps).toMatchObject({ checkout: null, url: null, paiement: { statut: "paid", secret: null } });
    expect(corps.paiement?.id).toMatch(/^pay_faux_/);
    /* Rien n’est livré par la réponse : seulement par le webhook */
    expect((await achatEnBase(corps.achat)).statut).toBe("en_attente");
    await apresLaReponse();
    expect(await achatEnBase(corps.achat)).toMatchObject({ statut: "paye", storyId: conv, renonciationVersion: CASE_RENONCIATION.version });
    expect((await ligneEnBase(conv)).debloqueLe).not.toBeNull();
    expect(await soldeDe(u.id)).toBe(90);
  });

  it("la banque qui dit non : 402 « carte », l’achat échoue, rien n’est livré ; un jeton mal formé ne part pas", async () => {
    const { u, conv } = await acheteur("feuille-refus");
    expect(await payer({ offre: "rapport", jeton: "ctok_faux_refuser" })).toEqual({ status: 402, corps: { erreur: "carte" } });
    const [achat] = await db().select().from(schema.achats).where(eq(schema.achats.userId, u.id));
    expect(achat?.statut).toBe("echoue");
    expect((await ligneEnBase(conv)).debloqueLe).toBeNull();
    for (const jeton of ["pas_un_jeton", "ctok_", `ctok_${"x".repeat(201)}`, "ctok_a b"]) expect((await payer({ offre: "rapport", jeton })).status, jeton).toBe(422);
    expect(await db().select().from(schema.achats).where(eq(schema.achats.userId, u.id))).toHaveLength(1);
  });

  it("Whop : le jeton payé au prix de l’achat (le prix en ligne, l’achat en métadonnées, l’email du compte, le retour) ; une étape à finir rend la clé du paiement", async () => {
    const { u } = await acheteur("feuille-whop");
    etat.mode = "whop";
    const envoyes: { url: string; corps: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        envoyes.push({ url, corps: JSON.parse(init.body as string) as Record<string, unknown> });
        return Response.json({ id: "pay_w1", status: "open", substatus: "pending", client_secret: "pay_w1_secret_v1_x" });
      }),
    );
    const { status, corps } = await payer({ offre: "premium", jeton: "ctok_w1" });
    expect(status).toBe(200);
    expect(corps.paiement).toEqual({ id: "pay_w1", statut: "open", secret: "pay_w1_secret_v1_x" });
    expect(envoyes).toEqual([
      {
        url: "https://api.whop.com/api/v1/payments",
        corps: expect.objectContaining({
          account_id: WHOP.compte,
          confirmation_token: "ctok_w1",
          email: u.email,
          metadata: { achat: corps.achat },
          return_url: `https://www.askblush.com/paiement/retour?achat=${corps.achat}`,
          plan: expect.objectContaining({ initial_price: 14.9, currency: "eur", plan_type: "one_time", product_id: "prod_test", visibility: "hidden" }),
        }),
      },
    ]);
    /* Ni la conv ni un prénom chez Whop */
    expect(JSON.stringify(envoyes)).not.toMatch(/stories|prenom/);
    expect(await achatEnBase(corps.achat)).toMatchObject({ statut: "en_attente", fournisseur: "whop", centimes: 1490 });
  });

  it("Whop qui refuse : un sous-statut refusé ou un 402, 402 « carte » (l’achat échoue) ; un autre refus net (4xx), 502 « panne » (l’achat échoue aussi)", async () => {
    const { u } = await acheteur("feuille-whop-refus");
    etat.mode = "whop";
    const repondre = (reponse: () => Response) =>
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => reponse()),
      );
    repondre(() => Response.json({ id: "pay_w2", status: "open", substatus: "failed", client_secret: "s" }));
    expect(await payer({ offre: "rapport", jeton: "ctok_w2" })).toEqual({ status: 402, corps: { erreur: "carte" } });
    repondre(() => Response.json({ error: { message: "declined" } }, { status: 402 }));
    expect(await payer({ offre: "rapport", jeton: "ctok_w3" })).toEqual({ status: 402, corps: { erreur: "carte" } });
    repondre(() => Response.json({ error: { message: "Missing required parameter: plan" } }, { status: 400 }));
    expect(await payer({ offre: "rapport", jeton: "ctok_w4" })).toEqual({ status: 502, corps: { erreur: "panne" } });
    const statuts = (await db().select().from(schema.achats).where(eq(schema.achats.userId, u.id))).map((a) => a.statut);
    expect(statuts).toEqual(["echoue", "echoue", "echoue"]);
  });

  it("Whop sans réponse sûre (PAY-1) : une panne se réessaie une fois avec la même clé ; un délai, ou deux pannes, laissent l’achat en attente sans « panne » (l’écran attend son webhook)", async () => {
    const { u } = await acheteur("feuille-whop-incertain");
    etat.mode = "whop";
    const cles: (string | null)[] = [];
    const suite = (...reponses: (() => Response)[]) =>
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          cles.push(new Headers(init.headers).get("idempotency-key"));
          const r = reponses.shift();
          if (!r) throw new Error("un appel de trop");
          return r();
        }),
      );
    /* Une panne, puis le paiement : le même jeton repart avec la même clé d’idempotence, Whop ne paie qu’une fois */
    suite(
      () => new Response("{}", { status: 502 }),
      () => Response.json({ id: "pay_w5", status: "paid", substatus: "succeeded", client_secret: null }),
    );
    const repris = await payer({ offre: "rapport", jeton: "ctok_w5" });
    expect(repris).toMatchObject({ status: 200, corps: { paiement: { id: "pay_w5", statut: "paid", secret: null } } });
    expect(cles).toHaveLength(2);
    expect(cles[0]).toBe(cles[1]);
    expect(cles[0]).toMatch(/^jeton:/);
    /* Pas de réponse à temps (le réseau, le délai) : pas de nouvel essai, l’achat attend son webhook */
    cles.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        cles.push(null);
        throw new TypeError("fetch failed");
      }),
    );
    const sansReponse = await payer({ offre: "rapport", jeton: "ctok_w6" });
    expect(sansReponse).toEqual({ status: 200, corps: { achat: expect.any(String), checkout: null, url: null, paiement: null } });
    expect(cles).toHaveLength(1);
    expect((await achatEnBase(sansReponse.corps.achat)).statut).toBe("en_attente");
    /* Deux pannes de suite : l’achat attend aussi, l’acheteur n’est pas invité à repayer */
    suite(
      () => new Response("{}", { status: 500 }),
      () => new Response("pas du json", { status: 200 }),
    );
    const deuxPannes = await payer({ offre: "rapport", jeton: "ctok_w7" });
    expect(deuxPannes).toMatchObject({ status: 200, corps: { paiement: null, url: null } });
    expect((await achatEnBase(deuxPannes.corps.achat)).statut).toBe("en_attente");
    expect((await db().select().from(schema.achats).where(eq(schema.achats.userId, u.id))).map((a) => a.statut)).not.toContain("echoue");
  });
});

describe("ce que la feuille doit savoir (GET /api/paiement/feuille)", () => {
  it("comment payer dans la feuille : le faux Whop, Whop et son compte, ou rien ; sans avoirs pour commencer", async () => {
    await acheteur("feuille-mode");
    expect(await feuille()).toEqual({ paiement: { mode: "factice" }, avance: null, garde: null });
    etat.mode = "whop";
    expect(await feuille()).toEqual({ paiement: { mode: "whop", compte: WHOP.compte, bacASable: false }, avance: null, garde: null });
    etat.mode = null;
    expect(await feuille()).toEqual({ paiement: { mode: null }, avance: null, garde: null });
    etat.utilisateur = null;
    expect((await lireFeuille()).status).toBe(401);
  });
});

describe("le 2e rapport (⑤), un rapport d’avance", () => {
  it("après Premium : montré pour l’achat qui vient d’être payé, payé 4,95 € ; rien n’est livré à l’achat (ni conv, ni bulles), la feuille le dit, valable un an", async () => {
    const { u } = await acheteur("second-prix");
    const premium = await payeDansLaFeuille("premium");
    expect(await montrer("second_rapport")).toEqual({ offre: null });
    expect(await montrer("second_rapport", premium)).toMatchObject({ offre: "second_rapport", enUnGeste: true });
    const second = await payeDansLaFeuille("second");
    /* Livré seulement à son usage : aucune renonciation gardée à l’achat, même envoyée par le navigateur */
    expect(await achatEnBase(second)).toMatchObject({
      offre: "second",
      centimes: 495,
      bulles: 0,
      storyId: null,
      utiliseLe: null,
      offreUnique: "second_rapport",
      renonciationVersion: null,
      renonciationLe: null,
    });
    expect(await soldeDe(u.id)).toBe(90);
    const f = await feuille();
    const fin = new Date((await achatEnBase(second)).payeLe!.getTime() + RAPPORT_D_AVANCE.dureeMs).toISOString();
    expect(f.avance).toEqual({ fin });
    /* Une seule fois par compte */
    expect(await montrer("second_rapport", premium)).toEqual({ offre: null });
  });

  it("utilisé pour une autre conv : son rapport s’ouvre sans payer, les bulles du rapport arrivent, la renonciation est gardée ; une seule fois", async () => {
    const { u } = await acheteur("second-usage");
    const second = await secondPris();
    const conv = await autreConv(u);
    expect(await utiliser({ renonciation: "2020-01-01" })).toEqual({ status: 422, corps: { erreur: "renonciation" } });
    const avant = Date.now();
    expect(await utiliser()).toEqual({ status: 200, corps: { achat: second } });
    const achat = await achatEnBase(second);
    expect(achat).toMatchObject({ storyId: conv, bulles: RAPPORT_D_AVANCE.bulles, renonciationVersion: CASE_RENONCIATION.version });
    expect(achat.utiliseLe!.getTime()).toBeGreaterThanOrEqual(avant - 1000);
    expect((await ligneEnBase(conv)).debloqueLe).not.toBeNull();
    expect(await soldeDe(u.id)).toBe(90 + RAPPORT_D_AVANCE.bulles);
    expect(etat.relancees).toContain(conv);
    expect((await feuille()).avance).toBeNull();
    /* Utilisé : plus rien pour une troisième conv */
    await autreConv(u);
    expect(await utiliser()).toEqual({ status: 422, corps: { erreur: "offre" } });
  });

  it("refusé : sans rapport d’avance (422 « offre »), la conv d’un autre (404 « aucune »), une conv déjà débloquée (409 « deja »), passé d’un an (422 « offre »)", async () => {
    const { u, conv } = await acheteur("second-refus");
    expect(await utiliser()).toEqual({ status: 422, corps: { erreur: "offre" } });
    const second = await secondPris();
    /* La conv de Premium, déjà débloquée */
    connecter(u, conv);
    expect(await utiliser()).toEqual({ status: 409, corps: { erreur: "deja" } });
    const autre = await acheteur("second-refus-autre");
    connecter(u, null);
    expect(await utiliser({ conv: autre.conv })).toEqual({ status: 404, corps: { erreur: "aucune" } });
    await db()
      .update(schema.achats)
      .set({ payeLe: new Date(Date.now() - RAPPORT_D_AVANCE.dureeMs - 60_000) })
      .where(eq(schema.achats.id, second));
    await autreConv(u);
    expect(await utiliser()).toEqual({ status: 422, corps: { erreur: "offre" } });
    expect((await feuille()).avance).toBeNull();
  });

  it("remboursé : pas utilisé, il ne s’utilise plus ; utilisé, sa conv se re-verrouille et ses bulles repartent", async () => {
    const { u } = await acheteur("second-rembourse");
    const second = await secondPris();
    const conv = await autreConv(u);
    expect((await utiliser()).status).toBe(200);
    expect((await poster(await issue(second, "rembourser"))).status).toBe(200);
    expect((await achatEnBase(second)).statut).toBe("rembourse");
    expect((await ligneEnBase(conv)).debloqueLe).toBeNull();
    expect(await soldeDe(u.id)).toBe(90);

    const b = await acheteur("second-rembourse-avant");
    const avantUsage = await secondPris();
    expect((await poster(await issue(avantUsage, "rembourser"))).status).toBe(200);
    await autreConv(b.u);
    expect(await utiliser()).toEqual({ status: 422, corps: { erreur: "offre" } });
  });

  it("en un geste, avec la carte gardée du paiement d’avant, sans renonciation (rien n’est livré à l’achat) : pas de page, le webhook le livre", async () => {
    await acheteur("second-geste");
    const premium = await payeDansLaFeuille("premium");
    expect(await montrer("second_rapport", premium)).toMatchObject({ enUnGeste: true });
    const r = await commencer(depuisLAppli("/api/paiement", { offre: "second" }));
    const { status, corps } = { status: r.status, corps: (await r.json()) as PaiementCommence };
    expect([status, corps.url, corps.paiement]).toEqual([200, null, null]);
    await apresLaReponse();
    expect((await achatEnBase(corps.achat)).statut).toBe("paye");
  });
});

describe("le −50 % gardé (⑥) et les offres du merci", () => {
  it("le 2e rapport refusé après Premium : « Garde-le-moi » le garde 7 jours ; la conv suivante paie le rapport seul 4,95 €, une fois", async () => {
    const { u } = await acheteur("garde");
    const premium = await payeDansLaFeuille("premium");
    /* Sans le 2e rapport montré d’abord, rien à garder */
    expect(await montrer("garde_second", premium)).toEqual({ offre: null });
    expect((await montrer("second_rapport", premium)).offre).toBe("second_rapport");
    const garde = await montrer("garde_second", premium);
    expect(garde.offre).toBe("garde_second");
    const fin = new Date((garde as { fin: string }).fin).getTime();
    expect(Math.abs(fin - (Date.now() + DUREE_GARDE_MS))).toBeLessThan(60_000);
    expect((await feuille()).garde).toEqual({ fin: (garde as { fin: string }).fin });
    const conv = await autreConv(u);
    /* Sans le −50 % : pas de rapport à moitié prix ; avec lui, pour cette autre conv */
    const achat = await payeDansLaFeuille("rapport_garde");
    expect(await achatEnBase(achat)).toMatchObject({ offre: "rapport_garde", centimes: 495, bulles: 10, storyId: conv, offreUnique: "garde_second" });
    expect((await ligneEnBase(conv)).debloqueLe).not.toBeNull();
    expect((await feuille()).garde).toBeNull();
    await autreConv(u);
    expect(await payer({ offre: "rapport_garde" })).toEqual({ status: 422, corps: { erreur: "offre" } });
  });

  it("la règle des 24 h ne joue pas entre les offres du merci (③ puis ⑤ en repli, après la suite qu’on vient de payer), mais retient encore ④", async () => {
    const { u } = await acheteur("merci-regle");
    expect((await montrer("suite")).offre).toBe("suite");
    const suite = await payeDansLaFeuille("suite");
    expect((await montrer("premium_ajout", suite)).offre).toBe("premium_ajout");
    expect((await montrer("second_rapport", suite)).offre).toBe("second_rapport");
    /* Hors du merci, la règle tient : pas de bonus de première recharge le même jour */
    expect(await montrer("premiere_recharge")).toEqual({ offre: null });
    const lignes = await db().select({ offre: schema.offresUniques.offre }).from(schema.offresUniques).where(eq(schema.offresUniques.userId, u.id));
    expect(lignes.map((l) => l.offre).sort()).toEqual(["premium_ajout", "second_rapport", "suite"]);
  });

  it("③ complète aussi le rapport à −50 % gardé", async () => {
    const { u } = await acheteur("merci-garde-ajout");
    const premium = await payeDansLaFeuille("premium");
    await montrer("second_rapport", premium);
    await montrer("garde_second", premium);
    await autreConv(u);
    const garde = await payeDansLaFeuille("rapport_garde");
    expect((await montrer("premium_ajout", garde)).offre).toBe("premium_ajout");
  });

  it("le 2e rapport ne suit qu’un rapport payé il y a moins de 15 minutes, et jamais un pack de bulles", async () => {
    await acheteur("merci-tard");
    const pack = await payeDansLaFeuille("pack30");
    expect(await montrer("second_rapport", pack)).toEqual({ offre: null });
    const tard = await payeDansLaFeuille("premium");
    await db()
      .update(schema.achats)
      .set({ payeLe: new Date(Date.now() - 16 * 60_000) })
      .where(eq(schema.achats.id, tard));
    expect(await montrer("second_rapport", tard)).toEqual({ offre: null });
  });
});
