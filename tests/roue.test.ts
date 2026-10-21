import { and, eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * La roue du paywall, avec la base, par ses routes : tourner (POST /api/roue, la case tirée par le serveur, imposée par
 * un en-tête avec le faux Whop seulement), la refuser, une fois par compte ; le plafond des gros lots ; le lot figé dans
 * la commande d’une formule (son prix, ses bulles), pris une fois à la livraison ; le 2e rapport à −50 % gardé 30 jours ;
 * l’offre ① qui ne vient plus après un lot gagné ; ce que la feuille du paiement en dit. Le prestataire est choisi par
 * test (le faux Whop, Whop, ou aucun) ; la session et after() de Next sont simulés. Chaque test a ses comptes.
 */
const etat = vi.hoisted(() => ({
  mode: "factice" as "factice" | "whop" | null,
  utilisateur: null as { id: string; email: string; bulles: number } | null,
  story: null as { id: string } | null,
  apres: [] as (() => unknown)[],
}));

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
vi.mock("@/server/alertes", async (original) => ({ ...(await original<typeof import("@/server/alertes")>()), alerter: async () => {} }));
vi.mock("@/server/pipeline", async (original) => ({ ...(await original<typeof import("@/server/pipeline")>()), reparerLaChaine: async () => true }));
vi.mock("@/server/paiement/fournisseur", async () => {
  const { COMPTE_FACTICE, SECRET_FACTICE } = await import("@/server/paiement/factice-valeurs");
  return {
    fournisseur: () =>
      etat.mode === "factice"
        ? { mode: "factice", secret: SECRET_FACTICE, compte: COMPTE_FACTICE }
        : etat.mode === "whop"
          ? { mode: "whop", secret: "ws_secret_de_test", compte: "biz_test", whop: { cle: "cle_fictive", compte: "biz_test", produit: "prod_test", bacASable: false } }
          : null,
  };
});

import { POST as commencer } from "@/app/api/paiement/route";
import { GET as lireFeuille } from "@/app/api/paiement/feuille/route";
import { POST as offre } from "@/app/api/paiement/offre/route";
import { POST as roue } from "@/app/api/roue/route";
import { CASE_RENONCIATION } from "@/contenu/consentements";
import { CASES_DE_LA_ROUE, DUREE_DU_CADEAU_MS, GROS_LOTS_PAR_JOUR } from "@/contenu/roue";
import type { Utilisateur } from "@/server/auth";
import { soldeDe } from "@/server/bulles";
import { db, schema } from "@/server/db";
import { LOTS_DE_LA_ROUE, type LotDeLaRoue } from "@/types";
import type { FeuilleDuPaiement, OffreUniqueMontree, PaiementCommence, RoueDuCompte } from "@/types/api";
import { compteDeTest, convRattachee } from "./aide/fixtures";

const APPLI = "http://localhost";

beforeEach(() => {
  Object.assign(etat, { mode: "factice", utilisateur: null, story: null, apres: [] });
});

/** Passe après la réponse ce que les routes ont confié à after() (le webhook du faux Whop, qui livre). */
async function apresLaReponse(): Promise<void> {
  while (etat.apres.length) await etat.apres.shift()!();
}

/** Un appel de l’appli (même origine), avec ce corps JSON et ces en-têtes. */
const depuisLAppli = (chemin: string, corps: unknown, entetes: Record<string, string> = {}) =>
  new Request(`${APPLI}${chemin}`, {
    method: "POST",
    headers: { origin: APPLI, host: "localhost", "x-forwarded-for": "10.7.7.8", "content-type": "application/json", ...entetes },
    body: JSON.stringify(corps),
  });

/** Un compte connecté, avec une conv à lui (pas lue, pas débloquée). */
async function joueur(prefixe: string): Promise<{ u: Utilisateur; conv: string }> {
  const u = await compteDeTest(prefixe);
  const conv = (await convRattachee(u, "02-reciproque.txt")).id;
  etat.utilisateur = { id: u.id, email: u.email, bulles: u.bulles };
  etat.story = { id: conv };
  return { u, conv };
}

/** La case de ce lot sur la roue (la première, pour +10 bulles). */
const caseDe = (lot: LotDeLaRoue) => CASES_DE_LA_ROUE.findIndex((c) => c.lot === lot);

/** POST /api/roue : tourner (la case imposée, avec le faux Whop) ou refuser ; la réponse. */
async function jouer(geste: "tourner" | "refuser", imposee?: number): Promise<{ status: number; corps: RoueDuCompte }> {
  const r = await roue(depuisLAppli("/api/roue", { geste }, imposee === undefined ? {} : { "x-blush-roue-case": String(imposee) }));
  return { status: r.status, corps: (await r.json()) as RoueDuCompte };
}

/** Une formule payée dans la feuille au faux Whop (sa carte de test, puis son webhook) : l’achat tel qu’il est en base. */
async function payee(offreId: "rapport" | "premium") {
  const r = await commencer(depuisLAppli("/api/paiement", { offre: offreId, renonciation: CASE_RENONCIATION.version, jeton: "ctok_faux_payer" }));
  expect(r.status).toBe(200);
  const { achat } = (await r.json()) as PaiementCommence;
  await apresLaReponse();
  return (await db().select().from(schema.achats).where(eq(schema.achats.id, achat)))[0]!;
}

/** La ligne de la roue du compte. */
const ligne = async (userId: string) => (await db().select().from(schema.roue).where(eq(schema.roue.userId, userId)))[0];

/** GET /api/paiement/feuille. */
const feuille = async () => (await (await lireFeuille()).json()) as FeuilleDuPaiement;

describe("tourner la roue (POST /api/roue)", () => {
  it("une fois par compte : la case tirée et son lot, valable 15 minutes ; rejouée, la même réponse, même refusée ensuite", async () => {
    const { u } = await joueur("roue-une-fois");
    const avant = Date.now();
    const { status, corps } = await jouer("tourner", caseDe("bulles20"));
    expect(status).toBe(200);
    expect(corps).toMatchObject({ etat: "gagnee", case: caseDe("bulles20"), lot: "bulles20", valable: true });
    if (corps.etat !== "gagnee") throw new Error("gagnée");
    expect(Date.parse(corps.fin)).toBeGreaterThanOrEqual(avant + DUREE_DU_CADEAU_MS - 2000);
    expect(corps.reste).toBeLessThanOrEqual(DUREE_DU_CADEAU_MS);
    /* Une autre case imposée, puis un refus : rien ne change */
    expect((await jouer("tourner", caseDe("premium_prix"))).corps).toMatchObject({ etat: "gagnee", lot: "bulles20" });
    expect((await jouer("refuser")).corps).toMatchObject({ etat: "gagnee", lot: "bulles20" });
    expect(await ligne(u.id)).toMatchObject({ caseTiree: caseDe("bulles20"), lot: "bulles20", priseLe: null });
  });

  it("refusée (« Je ne veux pas de cadeau ») : pour de bon, elle ne se tourne plus", async () => {
    const { u } = await joueur("roue-refus");
    expect((await jouer("refuser")).corps).toEqual({ etat: "refusee" });
    expect((await jouer("tourner", 0)).corps).toEqual({ etat: "refusee" });
    expect(await ligne(u.id)).toMatchObject({ caseTiree: null, lot: null });
  });

  it("la case imposée ne vaut qu’avec le faux Whop : avec Whop, le tirage du serveur ; sans paiement, ni l’équipe : « aucune »", async () => {
    etat.mode = "whop";
    await joueur("roue-whop");
    const { corps } = await jouer("tourner", 99);
    expect(corps.etat).toBe("gagnee");
    if (corps.etat === "gagnee") expect(LOTS_DE_LA_ROUE).toContain(corps.lot);
    etat.mode = null;
    await joueur("roue-sans-paiement");
    expect((await jouer("tourner", 0)).corps).toEqual({ etat: "aucune" });
    etat.mode = "factice";
    const equipe = await compteDeTest("equipe-roue");
    etat.utilisateur = { id: equipe.id, email: equipe.email, bulles: 0 };
    expect((await jouer("tourner", 0)).corps).toEqual({ etat: "aucune" });
  });

  it("un geste inconnu : refusé, rien n’est noté", async () => {
    const { u } = await joueur("roue-geste");
    const r = await roue(depuisLAppli("/api/roue", { geste: "relancer" }));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(await ligne(u.id)).toBeUndefined();
  });

  it("un gros lot au-delà de son plafond du jour tombe sur +10 bulles", async () => {
    /* Le plafond du jour déjà atteint, par d’autres comptes, aujourd’hui à Paris */
    const autres = await Promise.all(Array.from({ length: GROS_LOTS_PAR_JOUR }, (_, k) => compteDeTest(`roue-plafond-${k}`)));
    const deja = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.roue)
      .where(eq(schema.roue.lot, "premium_prix"));
    const manque = Math.max(0, GROS_LOTS_PAR_JOUR - (deja[0]?.n ?? 0));
    if (manque)
      await db()
        .insert(schema.roue)
        .values(autres.slice(0, manque).map((a) => ({ userId: a.id, caseTiree: caseDe("premium_prix"), lot: "premium_prix" as const })));
    try {
      await joueur("roue-plafond");
      expect((await jouer("tourner", caseDe("premium_prix"))).corps).toMatchObject({ etat: "gagnee", lot: "bulles10", case: caseDe("bulles10") });
    } finally {
      /* Le plafond rendu : les autres tests tirent encore le gros lot */
      await db()
        .delete(schema.roue)
        .where(
          inArray(
            schema.roue.userId,
            autres.map((a) => a.id),
          ),
        );
    }
  });
});

describe("le lot dans la commande, puis à la livraison", () => {
  it("−10 % : Premium payé 17,01 € avec ses 90 bulles ; le lot pris par cet achat, une fois", async () => {
    const { u } = await joueur("roue-moins10");
    await jouer("tourner", caseDe("moins10"));
    const achat = await payee("premium");
    expect(achat).toMatchObject({ offre: "premium", centimes: 1341, bulles: 90, lotRoue: "moins10", statut: "paye" });
    expect(await ligne(u.id)).toMatchObject({ achatId: achat.id });
    expect((await ligne(u.id))!.priseLe).not.toBeNull();
    expect(await soldeDe(u.id)).toBe(90);
  });

  it("+20 bulles sur le rapport : 9,90 € et 30 bulles", async () => {
    const { u } = await joueur("roue-bulles20");
    await jouer("tourner", caseDe("bulles20"));
    expect(await payee("rapport")).toMatchObject({ centimes: 990, bulles: 30, lotRoue: "bulles20", statut: "paye" });
    expect(await soldeDe(u.id)).toBe(30);
  });

  it("Premium au prix du rapport : sur Premium (9,90 €, 90 bulles), jamais sur le rapport seul", async () => {
    await joueur("roue-premium-rapport");
    await jouer("tourner", caseDe("premium_prix"));
    expect(await payee("rapport")).toMatchObject({ centimes: 990, bulles: 10, lotRoue: null });
    const { u } = await joueur("roue-premium-premium");
    await jouer("tourner", caseDe("premium_prix"));
    expect(await payee("premium")).toMatchObject({ centimes: 990, bulles: 90, lotRoue: "premium_prix" });
    expect(await soldeDe(u.id)).toBe(90);
  });

  it("passé (15 minutes) : la commande se fait au prix du catalogue, sans lot", async () => {
    const { u } = await joueur("roue-passee");
    await jouer("tourner", caseDe("moins15"));
    await db()
      .update(schema.roue)
      .set({ expireLe: sql`now() - interval '1 minute'` })
      .where(eq(schema.roue.userId, u.id));
    expect(await payee("premium")).toMatchObject({ centimes: 1490, bulles: 90, lotRoue: null });
  });

  it("le 2e rapport à −50 % gagné : la formule à son prix, puis le −50 % gardé 30 jours pour une autre conv", async () => {
    const { u } = await joueur("roue-second");
    await jouer("tourner", caseDe("second50"));
    expect(await payee("rapport")).toMatchObject({ centimes: 990, bulles: 10, lotRoue: "second50", statut: "paye" });
    const [garde] = await db()
      .select()
      .from(schema.offresUniques)
      .where(and(eq(schema.offresUniques.userId, u.id), eq(schema.offresUniques.offre, "garde_second")));
    expect(garde).toBeDefined();
    expect(garde!.expireLe!.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600e3);
    /* Une autre conv : la feuille propose le −50 % gardé, et plus la roue (le compte a déjà mieux) */
    etat.story = { id: (await convRattachee(u, "02-reciproque.txt")).id };
    expect(await feuille()).toMatchObject({ roue: { etat: "aucune" }, garde: { fin: garde!.expireLe!.toISOString() } });
  });

  it("deux commandes passées avec le même lot, payées toutes les deux : une remise ne se livre qu’une fois ; des bulles, la seconde sans elles", async () => {
    const { u } = await joueur("roue-deux-remises");
    await jouer("tourner", caseDe("moins10"));
    const r1 = await commencer(depuisLAppli("/api/paiement", { offre: "premium", renonciation: CASE_RENONCIATION.version }));
    const r2 = await commencer(depuisLAppli("/api/paiement", { offre: "premium", renonciation: CASE_RENONCIATION.version }));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const [a1, a2] = [((await r1.json()) as PaiementCommence).achat, ((await r2.json()) as PaiementCommence).achat];
    const { livrer } = await import("@/server/achats");
    expect((await livrer(a1)).effet).toBe("livre");
    expect((await livrer(a2)).effet).toBe("offre");
    const { u: v } = await joueur("roue-deux-bulles");
    await jouer("tourner", caseDe("bulles30"));
    const b1 = await commencer(depuisLAppli("/api/paiement", { offre: "rapport", renonciation: CASE_RENONCIATION.version }));
    const b2 = await commencer(depuisLAppli("/api/paiement", { offre: "rapport", renonciation: CASE_RENONCIATION.version }));
    const [c1, c2] = [((await b1.json()) as PaiementCommence).achat, ((await b2.json()) as PaiementCommence).achat];
    expect((await livrer(c1)).achat).toMatchObject({ bulles: 40 });
    const seconde = await livrer(c2);
    expect(seconde.effet).toBe("livre");
    expect(seconde.achat).toMatchObject({ bulles: 10 });
    expect(await soldeDe(v.id)).toBe(50);
    expect(u.id).not.toBe(v.id);
  });
});

describe("la roue et le reste du paiement", () => {
  it("un lot gagné remplace l’offre ① : elle ne se montre plus ; refusée, ① reste possible", async () => {
    await joueur("roue-sans-suite");
    await jouer("tourner", caseDe("bulles10"));
    const r = await offre(depuisLAppli("/api/paiement/offre", { offre: "suite" }));
    expect((await r.json()) as OffreUniqueMontree).toEqual({ offre: null });
    await joueur("roue-refus-suite");
    await jouer("refuser");
    const s = await offre(depuisLAppli("/api/paiement/offre", { offre: "suite" }));
    expect(((await s.json()) as OffreUniqueMontree).offre).toBe("suite");
  });

  it("la feuille du paiement dit la roue : à tourner, puis gagnée", async () => {
    await joueur("roue-feuille");
    expect((await feuille()).roue).toEqual({ etat: "a_tourner" });
    await jouer("tourner", caseDe("moins15"));
    expect((await feuille()).roue).toMatchObject({ etat: "gagnee", lot: "moins15", valable: true });
  });
});
