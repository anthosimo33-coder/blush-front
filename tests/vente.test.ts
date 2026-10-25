import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * La vente dans le chat (src/server/vente.ts), par ses routes, comme le navigateur : la réponse de BLUSH (POST /api/chat)
 * qui porte la carte que le code choisit d’après le moment vu par le modèle factice (FACTICE.achat, FACTICE.autrePersonne),
 * ses limites (une fois par prénom, une spontanée par jour, « Pas maintenant », POST /api/chat/vente), le test A/B,
 * l’achat payé depuis une carte (achats.vente) et ce que /admin en compte. Le faux Whop encaisse. Chaque test a son
 * compte et sa conv ; les compteurs de /admin sont partagés : on compare avant et après.
 */
const etat = vi.hoisted(() => ({ cookies: new Map<string, string>(), apres: [] as (() => unknown)[] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (etat.cookies.has(n) ? { name: n, value: etat.cookies.get(n)! } : undefined),
    has: (n: string) => etat.cookies.has(n),
    set: (n: string, v: string) => etat.cookies.set(n, v),
    delete: (n: string | { name: string }) => etat.cookies.delete(typeof n === "string" ? n : n.name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => etat.apres.push(f) }));
vi.mock("@/server/alertes", async (original) => ({ ...(await original<typeof import("@/server/alertes")>()), alerter: async () => {} }));
vi.mock("@/server/env", async (original) => {
  const o = await original<typeof import("@/server/env")>();
  return { ...o, accesLibre: (email: string) => email.startsWith("equipe-") };
});
vi.mock("@/server/paiement/fournisseur", async () => {
  const { COMPTE_FACTICE, SECRET_FACTICE } = await import("@/server/paiement/factice-valeurs");
  return { fournisseur: () => ({ mode: "factice", secret: SECRET_FACTICE, compte: COMPTE_FACTICE }) };
});

import { POST as chat } from "@/app/api/chat/route";
import { POST as geste } from "@/app/api/chat/vente/route";
import { POST as commencer } from "@/app/api/paiement/route";
import { CASE_RENONCIATION } from "@/contenu/consentements";
import { CATALOGUE } from "@/contenu/offres";
import { livrer } from "@/server/achats";
import { ouvrirSession, type Utilisateur } from "@/server/auth";
import { db, schema } from "@/server/db";
import { FACTICE } from "@/server/ia/factice-valeurs";
import { statsAdmin } from "@/server/stats";
import { groupeDeVente, VENTE, type GroupeDeVente } from "@/server/vente";
import type { BlushAnswer, EvenementChat, GenreVendu } from "@/types";
import { compteDeTest, donnerDesBulles, histoireLue } from "./aide/fixtures";

beforeEach(() => {
  etat.cookies.clear();
  etat.apres.length = 0;
});

const lancerApres = async () => {
  while (etat.apres.length) await etat.apres.shift()!();
};

/** Un compte de la moitié `groupe` du test A/B (« avec » par défaut), qui a lu sa conv, connecté, avec `bulles` bulles. */
async function parleur(prefixe: string, bulles: number, { groupe = "avec", email }: { groupe?: GroupeDeVente; email?: string } = {}): Promise<{ u: Utilisateur; id: string }> {
  let u = await compteDeTest(prefixe, "debloque");
  while (groupeDeVente(u.id) !== groupe) u = await compteDeTest(prefixe, "debloque");
  if (email) u = (await db().update(schema.users).set({ email }).where(eq(schema.users.id, u.id)).returning())[0] ?? u;
  if (bulles) await donnerDesBulles(u, bulles);
  const id = (await histoireLue(u, "01-a-deux-doigts.txt", { qui: { moi: "Hugo" } })).id;
  await lancerApres();
  etat.cookies.set("blush-session", (await ouvrirSession(u.id)).secret);
  return { u, id };
}

/** Le rapport seul payé pour cette conv, avec la carte gardée du faux Whop (de quoi payer en un geste). */
const rapportSeulPaye = (u: Utilisateur, storyId: string) =>
  db().insert(schema.achats).values({
    userId: u.id,
    storyId,
    offre: "rapport",
    centimes: 990,
    bulles: 3,
    fournisseur: "factice",
    statut: "paye",
    payeLe: new Date(),
    membreId: "mber_test",
    moyenId: "payt_test",
  });

const requete = (chemin: string, corps: unknown, entetes: Record<string, string> = {}) =>
  new Request(`http://localhost${chemin}`, {
    method: "POST",
    headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "content-type": "application/json", ...entetes },
    body: JSON.stringify(corps),
  });

/** Ce que BLUSH répond à ce message (en flux, comme le navigateur) : la réponse validée, avec sa carte s’il y en a une. */
async function dire(texte: string, { question = false } = {}): Promise<BlushAnswer> {
  const r = await chat(requete("/api/chat", { texte, ...(question ? { question: true } : {}) }, { accept: "application/x-ndjson" }));
  const evenements = (await r.text())
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as EvenementChat);
  await lancerApres();
  return evenements.flatMap((e) => ("reponse" in e ? [e.reponse] : [])).at(-1)!;
}

/** Les compteurs de vente du jour (jour de Paris) : « vente:<événement>:<genre> ». */
async function compteur(evenement: string, genre: GenreVendu): Promise<number> {
  const [l] = await db()
    .select({ n: schema.counters.count })
    .from(schema.counters)
    .where(and(eq(schema.counters.key, `${VENTE}${evenement}:${genre}`), eq(schema.counters.day, sql`(now() at time zone 'Europe/Paris')::date`)));
  return l?.n ?? 0;
}

const noter = (evenement: string, genre: string) => geste(requete("/api/chat/vente", { evenement, genre }));

describe("la carte que la réponse du chat porte", () => {
  it("il demande à acheter, après le rapport seul : Premium pour 6,90 € de plus, en un geste, montrée comme offre unique et comptée", async () => {
    const { u, id } = await parleur("vente-premium", 5);
    await rapportSeulPaye(u, id);
    const vues = await compteur("vue", "premium");
    const r = await dire(`je veux plus de bulles ${FACTICE.achat}`);
    expect(r.offre).toEqual({ genre: "premium", enUnGeste: true });
    const [montree] = await db()
      .select()
      .from(schema.offresUniques)
      .where(and(eq(schema.offresUniques.userId, u.id), eq(schema.offresUniques.offre, "premium_ajout")));
    expect(montree).toBeDefined();
    expect(await compteur("vue", "premium")).toBe(vues + 1);
  });

  it("déjà passé en Premium (③, celui d’aujourd’hui comme celui d’avant le 23 octobre) : plus de carte Premium, la recharge", async () => {
    for (const passage of ["passe_premium", "premium_ajout"] as const) {
      const { u, id } = await parleur(`vente-deja-premium-${passage}`, 5);
      await rapportSeulPaye(u, id);
      await db().insert(schema.achats).values({
        userId: u.id,
        offre: passage,
        centimes: CATALOGUE[passage].centimes,
        bulles: CATALOGUE[passage].bulles,
        fournisseur: "factice",
        statut: "paye",
        payeLe: new Date(),
      });
      expect((await dire(`je veux plus de bulles ${FACTICE.achat}`)).offre, passage).toMatchObject({ genre: "bulles" });
    }
  });

  it("il demande, Premium déjà vu ailleurs : la recharge à la place, avec son solde", async () => {
    const { u, id } = await parleur("vente-premium-vu", 5);
    await rapportSeulPaye(u, id);
    await db()
      .insert(schema.offresUniques)
      .values({ userId: u.id, offre: "premium_ajout", montreeLe: sql`now() - interval '2 days'`, expireLe: sql`now() - interval '2 days'` });
    const r = await dire(`je reprends des bulles ${FACTICE.achat}`);
    expect(r.offre).toEqual({ genre: "bulles", solde: 4, enUnGeste: true });
  });

  it("à zéro bulle, la réponse verrouillée porte la recharge qui la débloque, même pour la moitié « sans »", async () => {
    await parleur("vente-zero", 0, { groupe: "sans" });
    const r = await dire("je lui dis quoi ?");
    expect(r.verrouillee).toBeDefined();
    expect(r.offre).toEqual({ genre: "bulles", solde: 0, enUnGeste: false });
  });

  it("il parle de quelqu’un d’autre : l’autre conv, une fois ; la moitié « sans » ne la voit pas", async () => {
    await parleur("vente-autre", 6);
    expect((await dire(`et Léa alors ${FACTICE.autrePersonne}`)).offre).toEqual({ genre: "autre", prenom: "Léa" });
    expect((await dire(`Léa m’a réécrit ${FACTICE.autrePersonne}`)).offre).toBeUndefined();
    await parleur("vente-autre-sans", 6, { groupe: "sans" });
    expect((await dire(`et Léa alors ${FACTICE.autrePersonne}`)).offre).toBeUndefined();
  });

  it("il demande le rapport d’une autre conv : l’autre conv, même pour la moitié « sans »", async () => {
    await parleur("vente-autre-rapport", 4, { groupe: "sans" });
    expect((await dire(`je veux le rapport de ma conv avec Léa ${FACTICE.autreRapport}`)).offre).toEqual({ genre: "autre", prenom: "Léa" });
  });

  it("« Pas maintenant » : compté, et cette carte ne se repropose plus d’elle-même", async () => {
    await parleur("vente-refus", 6);
    const avant = await compteur("refusee", "autre");
    expect((await noter("refusee", "autre")).status).toBe(200);
    expect(await compteur("refusee", "autre")).toBe(avant + 1);
    expect((await dire(`et Léa alors ${FACTICE.autrePersonne}`)).offre).toBeUndefined();
    /* Ce qu’il demande passe quand même */
    expect((await dire(`je reprends des bulles ${FACTICE.achat}`)).offre).toMatchObject({ genre: "bulles" });
  });

  it("un geste mal formé est refusé ; trop de gestes, plus rien n’est noté", async () => {
    await parleur("vente-gestes", 1);
    expect((await noter("vue", "bulles")).status).toBe(422);
    expect((await noter("touchee", "rapport")).status).toBe(422);
    const avant = await compteur("touchee", "a_jour");
    const statuts: number[] = [];
    for (let i = 0; i < 61; i++) statuts.push((await noter("touchee", "a_jour")).status);
    expect(statuts.filter((s) => s === 200)).toHaveLength(60);
    expect(statuts.at(-1)).toBe(429);
    expect(await compteur("touchee", "a_jour")).toBe(avant + 60);
  });

  it("ni sous la question du rapport, ni pour l’équipe", async () => {
    await parleur("vente-question", 5);
    expect((await dire(`je veux le rapport complet ${FACTICE.achat}`, { question: true })).offre).toBeUndefined();
    await parleur("vente-equipe", 0, { email: `equipe-vente-${Date.now()}@blush.test` });
    expect((await dire(`je reprends des bulles ${FACTICE.achat}`)).offre).toBeUndefined();
  });
});

describe("l’achat payé depuis une carte, et /admin", () => {
  it("une recharge payée en un geste depuis le chat : notée avec l’achat, comptée payée, et dans la moitié de son compte", async () => {
    const avant = await statsAdmin(7);
    const { u, id } = await parleur("vente-payee", 3);
    await rapportSeulPaye(u, id);
    await dire("je lui dis quoi ?");
    const r = await commencer(requete("/api/paiement", { offre: "pack10", renonciation: CASE_RENONCIATION.version, geste: true, vente: "bulles" }));
    expect(r.status).toBe(200);
    const { achat, url } = (await r.json()) as { achat: string; url: string | null };
    /* La carte gardée : payé d’un geste, sans page de paiement */
    expect(url).toBeNull();
    const [ligne] = await db().select().from(schema.achats).where(eq(schema.achats.id, achat));
    expect(ligne).toMatchObject({ vente: "bulles", offre: "pack10" });
    await lancerApres();
    expect((await livrer(achat)).achat?.statut).toBe("paye");

    const apres = await statsAdmin(7);
    const ligneDe = (s: typeof avant, g: GenreVendu) => s.pilotage.ventesDuChat.find((v) => v.genre === g)!;
    expect(ligneDe(apres, "bulles").payees - ligneDe(avant, "bulles").payees).toBe(1);
    expect(ligneDe(apres, "bulles").centimes - ligneDe(avant, "bulles").centimes).toBe(CATALOGUE.pack10.centimes);
    const moitie = (s: typeof avant) => s.pilotage.abDuChat.find((g) => g.groupe === "avec")!;
    expect(moitie(apres).comptes - moitie(avant).comptes).toBe(1);
    expect(moitie(apres).acheteurs - moitie(avant).acheteurs).toBe(1);
    expect(moitie(apres).centimes - moitie(avant).centimes).toBe(990 + CATALOGUE.pack10.centimes);
    expect(apres.pilotage.ventesDuChat.map((v) => v.genre)).toEqual(["bulles", "premium", "autre", "a_jour", "reimport"]);
  });

  it("le partage du test A/B en SQL est celui du code", async () => {
    const comptes = await Promise.all(Array.from({ length: 12 }, () => compteDeTest("vente-ab")));
    const { dansLaMoitieAvec } = await import("@/server/vente");
    const lignes = await db()
      .select({ id: schema.users.id, avec: sql<boolean>`${dansLaMoitieAvec(sql`${schema.users.id}`)}` })
      .from(schema.users)
      .where(
        sql`${schema.users.id} in (${sql.join(
          comptes.map((c) => sql`${c.id}::uuid`),
          sql`, `,
        )})`,
      );
    for (const l of lignes) expect(l.avec).toBe(groupeDeVente(l.id) === "avec");
  });
});
