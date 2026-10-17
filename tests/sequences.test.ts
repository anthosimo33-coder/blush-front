import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Utilisateur } from "@/server/auth";
import { empreinte } from "@/server/chiffrement";
import * as coffre from "@/server/coffre";
import { db, schema } from "@/server/db";
import { plafondsDesMails } from "@/server/limites";
import { desinscrire, lienDesinscription } from "@/server/relances";
import { aPrisPremium, ECART_ENTRE_DEUX_MAILS_MS, envoyerLesSequences, heureCalme } from "@/server/sequences";
import { compteDeTest, convPrete, histoireLue } from "./aide/fixtures";

/*
 * Les séquences de mails (src/server/sequences.ts), lot 1 : S3 après l’achat (« il t’a répondu ? », le vocal, le
 * prochain pas ou, après un 🧊, « comment tu vas ? ») et S4 les bulles (la réponse prête, 2 bulles ou moins, à zéro).
 * Jamais la nuit, un par jour au plus, une fois par occasion, jamais sur une alerte, jamais à l’équipe, et chaque genre
 * coupé par son lien. Les moments sont fabriqués en base (le déblocage, les bulles, le chat), sans attendre. Les mails
 * partis sont pris au passage (envoyerMail), puis partent comme sans clé de Resend (dans les logs).
 */

const EQUIPE = { email: "" };
vi.mock("@/server/env", async (original) => {
  const m = await original<typeof import("@/server/env")>();
  return { ...m, accesLibre: (email: string) => email === EQUIPE.email || m.accesLibre(email) };
});

/* Les mails partis : à qui, et ce qu’ils disent */
const partis = vi.hoisted(() => [] as { pour: string; sujet: string; texte: string; html: string }[]);
vi.mock("@/server/email", async (original) => {
  const m = await original<typeof import("@/server/email")>();
  return {
    ...m,
    envoyerMail: async (...args: Parameters<typeof m.envoyerMail>) => {
      const [pour, mail] = args;
      partis.push({ pour: String(pour), sujet: mail.sujet, texte: mail.texte, html: mail.html ?? "" });
      return m.envoyerMail(...args);
    },
  };
});

/* Le plafond du jour, partagé avec les relances : la base des tests le garde d’un lancement à l’autre */
const RELANCES_DU_JOUR = empreinte("limite:relances:mails");
const poserLeCompteur = (count: number) =>
  db()
    .insert(schema.rateLimits)
    .values({ key: RELANCES_DU_JOUR, windowStart: new Date(), count })
    .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count, windowStart: new Date() } });

/* Midi à Paris : hors des heures calmes */
const MIDI = new Date("2026-10-17T10:00:00Z");
const passer = () => envoyerLesSequences({ maintenant: MIDI });
const HEURE = 3600e3;
const ilYa = (ms: number) => new Date(Date.now() - ms);
const pour = (u: Utilisateur) => partis.filter((m) => m.pour === u.email);

/* Une conv lue (son verdict, son rapport débloqué), que les convs des comptes du test recopient : la lire une fois suffit */
let lu: { verdict: Buffer; rapport: Buffer; prochainPas: string };
beforeAll(async () => {
  const lecteur = await compteDeTest("sequence-lecteur", "debloque");
  const conv = await histoireLue(lecteur, "01-a-deux-doigts.txt");
  const [v] = await db().select({ data: schema.verdicts.data }).from(schema.verdicts).where(eq(schema.verdicts.storyId, conv.id));
  const [r] = await db().select({ data: schema.reports.data }).from(schema.reports).where(eq(schema.reports.storyId, conv.id));
  lu = { verdict: v!.data, rapport: r!.data!, prochainPas: coffre.lire("verdicts.data", v!.data).sortie.prochain_pas! };
  await poserLeCompteur(0);
}, 60_000);
beforeEach(() => {
  partis.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => poserLeCompteur(0));

type Emoji = "🔥" | "🤏" | "🤔" | "🧊";

/**
 * Un compte et sa conv (Hugo, il, parle de Sophie), son verdict (`emoji`, `alerte`) et son rapport écrits, débloquée il y
 * a `debloque`. `pronom` : celui de l’utilisateur.
 */
async function client(
  prefixe: string,
  { debloque = 25 * HEURE, emoji = "🤏", alerte = false, pronom = "il" }: { debloque?: number; emoji?: Emoji; alerte?: boolean; pronom?: "il" | "elle" } = {},
) {
  const u = await compteDeTest(prefixe);
  const conv = (await convPrete(u, "01-a-deux-doigts.txt", { moi: "Hugo", pronom })).id;
  const v = coffre.lire("verdicts.data", lu.verdict);
  const sortie = { ...v.sortie, emoji, ...(alerte && { alerte: "danger" as const, mode_sobre: true }) };
  await db()
    .insert(schema.verdicts)
    .values({ storyId: conv, data: coffre.ecrire("verdicts.data", { ...v, sortie }) });
  await db().insert(schema.reports).values({ storyId: conv, data: lu.rapport });
  await db()
    .update(schema.stories)
    .set({ debloqueLe: ilYa(debloque) })
    .where(eq(schema.stories.id, conv));
  return { u, conv };
}

/** Un message au chat, il y a `ms` : le sien (« toi »), ou une réponse de BLUSH (verrouillée : écrite à 0 bulle). */
const auChat = (conv: string, ms: number, { role = "toi", verrouillee = false }: { role?: "toi" | "blush"; verrouillee?: boolean } = {}) =>
  db()
    .insert(schema.chatMessages)
    .values({ storyId: conv, role, data: Buffer.from("x"), verrouillee, cout: verrouillee ? 1 : null, createdAt: ilYa(ms) });

/** Des bulles reçues (ou dépensées en réponse, `delta` négatif) il y a `ms`, et le solde posé à `solde`. */
async function bulles(u: Utilisateur, delta: number, ms: number, solde: number) {
  await db()
    .insert(schema.mouvementsBulles)
    .values({ userId: u.id, delta, raison: delta > 0 ? "equipe" : "reponse", ref: randomUUID(), creeLe: ilYa(ms) });
  await db().update(schema.users).set({ bulles: solde }).where(eq(schema.users.id, u.id));
}

/** Les mails des séquences notés pour ce compte : leur clé, et s’ils sont partis. */
const envois = (u: Utilisateur) =>
  db().select({ cle: schema.envoisMails.cle, parti: schema.envoisMails.parti }).from(schema.envoisMails).where(eq(schema.envoisMails.userId, u.id));

describe("les heures calmes", () => {
  it("de 23 h à 8 h à Paris, rien ne part", async () => {
    expect(heureCalme(new Date("2026-10-17T20:59:00Z"))).toBe(false);
    expect(heureCalme(new Date("2026-10-17T21:00:00Z"))).toBe(true);
    expect(heureCalme(new Date("2026-10-18T05:59:00Z"))).toBe(true);
    expect(heureCalme(new Date("2026-10-18T06:00:00Z"))).toBe(false);
    /* En hiver, l’heure de Paris recule : 22 h UTC, c’est 23 h */
    expect(heureCalme(new Date("2026-12-01T21:59:00Z"))).toBe(false);
    expect(heureCalme(new Date("2026-12-01T22:00:00Z"))).toBe(true);
    const { u } = await client("sequence-nuit");
    expect(await envoyerLesSequences({ maintenant: new Date("2026-10-18T01:00:00Z") })).toEqual({ dues: 0, envoyes: 0, ecartes: 0, retenus: 0, echecs: 0 });
    expect(pour(u)).toEqual([]);
  });
});

describe("S3 · après l’achat", () => {
  it("J+1 « il t’a répondu ? » : leurs prénoms dans le corps seulement, une fois, et le bouton tape son début dans le chat", async () => {
    const { u, conv } = await client("sequence-j1");
    await passer();
    const [m, ...autres] = pour(u);
    expect(autres).toEqual([]);
    expect(m!.sujet).toBe("alors\u00a0?");
    expect(m!.html).toContain("Sophie t’a répondu");
    expect(`${m!.sujet}${m!.texte}`).not.toMatch(/Sophie|Hugo/);
    expect(m!.html).toContain(`/ouvrir/${conv}?dire=son%20dernier%20message%C2%A0%3A%20`);
    expect(m!.html).toContain("Plus de conseils comme ça");
    expect(m!.texte).toContain(lienDesinscription(u.id, "conseils"));
    expect(await envois(u)).toEqual([{ cle: "s3_repondre", parti: true }]);
    /* Noté : un autre passage ne le renvoie pas */
    await passer();
    expect(pour(u)).toHaveLength(1);
  });

  it("J+1 : pas si elle a déjà écrit au chat depuis, ni après un 🧊 (écarté, sans compter pour le mail du jour)", async () => {
    const { u, conv } = await client("sequence-j1-ecrit");
    await auChat(conv, 2 * HEURE);
    const glace = await client("sequence-j1-glace", { emoji: "🧊" });
    await passer();
    expect([...pour(u), ...pour(glace.u)]).toEqual([]);
    expect(await envois(u)).toEqual([]);
    expect(await envois(glace.u)).toEqual([{ cle: "s3_repondre", parti: false }]);
  });

  it("un mail par jour au plus : le vocal pas écouté attend 20 h après « il t’a répondu ? », puis part ; écouté, jamais", async () => {
    const { u, conv } = await client("sequence-vocal");
    await passer();
    expect(pour(u).map((m) => m.sujet)).toEqual(["alors\u00a0?"]);
    await db()
      .update(schema.stories)
      .set({ debloqueLe: ilYa(50 * HEURE) })
      .where(eq(schema.stories.id, conv));
    await db()
      .insert(schema.vocals)
      .values({ storyId: conv, voix: "A", data: Buffer.from("x"), audio: Buffer.from("x"), dureeMs: 28_400 });
    await passer();
    expect(pour(u)).toHaveLength(1);
    await db()
      .update(schema.envoisMails)
      .set({ envoyeLe: ilYa(ECART_ENTRE_DEUX_MAILS_MS + HEURE) })
      .where(eq(schema.envoisMails.userId, u.id));
    await passer();
    const vocal = pour(u)[1]!;
    expect(vocal.sujet).toBe("t’as pas écouté ce que j’ai dit sur toi");
    expect(vocal.html).toContain("28 secondes sur toi et Sophie");
    expect(vocal.html).toContain(`/ouvrir/${conv}"`);

    const ecoute = await client("sequence-vocal-ecoute", { debloque: 50 * HEURE });
    await auChat(ecoute.conv, 40 * HEURE);
    await db()
      .insert(schema.vocals)
      .values({ storyId: ecoute.conv, voix: "A", data: Buffer.from("x"), audio: Buffer.from("x"), dureeMs: 28_400 });
    await db().insert(schema.vocalEcoutes).values({ storyId: ecoute.conv, voix: "A", evenement: "debut" });
    await passer();
    expect(pour(ecoute.u)).toEqual([]);
  });

  it("J+4 : son prochain pas tel que le verdict l’a écrit, deux boutons à une touche ; après un 🧊, « comment tu vas ? »", async () => {
    const feu = await client("sequence-j4", { debloque: 97 * HEURE, emoji: "🔥" });
    const glace = await client("sequence-j4-glace", { debloque: 97 * HEURE, emoji: "🧊", pronom: "elle" });
    await passer();
    const [pas] = pour(feu.u);
    expect(pas!.sujet).toBe("alors, ce plan\u00a0?");
    expect(pas!.html).toContain(lu.prochainPas.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
    expect(pas!.html).toContain(`/ouvrir/${feu.conv}?dire=c%E2%80%99est%20fait%C2%A0!%20`);
    expect(pas!.html).toContain(`/ouvrir/${feu.conv}?dire=j%E2%80%99ai%20pas%20os%C3%A9%E2%80%A6`);
    const [doux] = pour(glace.u);
    expect(doux!.sujet).toBe("comment tu vas, vraiment\u00a0?");
    expect(doux!.html).toContain("3114");
    expect(doux!.html).not.toContain("€");
  });

  it("une conv en alerte : rien, jamais", async () => {
    const { u } = await client("sequence-alerte", { alerte: true });
    await passer();
    expect(pour(u)).toEqual([]);
    expect(await envois(u)).toEqual([{ cle: "s3_repondre", parti: false }]);
  });

  it("les conseils coupés : plus de S3 ; les offres (S4) continuent", async () => {
    const { u, conv } = await client("sequence-coupe");
    expect(await desinscrire(u.id, new URL(lienDesinscription(u.id, "conseils")).searchParams.get("cle")!, "conseils")).toBe(true);
    await auChat(conv, 2 * HEURE, { role: "blush", verrouillee: true });
    await passer();
    expect(pour(u).map((m) => m.sujet)).toEqual(["ta réponse est prête"]);
  });

  it("Premium : pris d’emblée, ou ③ payée après son rapport", async () => {
    const { u, conv } = await client("sequence-premium");
    expect(await aPrisPremium(conv, u.id)).toBe(false);
    await db()
      .insert(schema.achats)
      .values({ userId: u.id, storyId: null, offre: "premium_ajout", centimes: 500, bulles: 80, fournisseur: "factice", statut: "paye", payeLe: new Date() });
    expect(await aPrisPremium(conv, u.id)).toBe(true);
  });
});

describe("S4 · les bulles", () => {
  it("la réponse prête : avant tout autre mail, la recharge au bouton, et ④ montrée par le mail", async () => {
    const { u, conv } = await client("sequence-prete");
    await auChat(conv, 2 * HEURE, { role: "blush", verrouillee: true });
    await passer();
    const [m, ...autres] = pour(u);
    expect(autres).toEqual([]);
    expect(m!.sujet).toBe("ta réponse est prête");
    expect(m!.html).toContain("Pour Sophie · prête");
    expect(m!.html).toContain(`/ouvrir/${conv}?recharger=1`);
    expect(m!.html).toContain("avec ta 1re recharge");
    expect(m!.html).toContain("Plus d’offres comme ça");
    const [quatre] = await db()
      .select({ offre: schema.offresUniques.offre })
      .from(schema.offresUniques)
      .where(and(eq(schema.offresUniques.userId, u.id), eq(schema.offresUniques.offre, "premiere_recharge")));
    expect(quatre).toEqual({ offre: "premiere_recharge" });
  });

  it("2 bulles ou moins, elle qui écrivait cette semaine : une fois par bulles reçues", async () => {
    const { u, conv } = await client("sequence-peu", { debloque: 10 * 24 * HEURE });
    await bulles(u, 10, 5 * 24 * HEURE, 2);
    await auChat(conv, 3 * HEURE);
    await passer();
    expect(pour(u).map((m) => m.sujet)).toEqual(["il te reste 2\u00a0réponses"]);
    expect(pour(u)[0]!.html).toContain("ça repart avec Sophie");
    await db()
      .update(schema.envoisMails)
      .set({ envoyeLe: ilYa(2 * 24 * HEURE) })
      .where(eq(schema.envoisMails.userId, u.id));
    await passer();
    expect(pour(u)).toHaveLength(1);
  });

  it("à zéro depuis 3 jours, sa dernière bulle dépensée en réponse : accordé à lui (ou à elle)", async () => {
    const lui = await client("sequence-zero", { debloque: 10 * 24 * HEURE });
    await bulles(lui.u, 10, 6 * 24 * HEURE, 10);
    await bulles(lui.u, -10, 4 * 24 * HEURE, 0);
    await auChat(lui.conv, 4 * 24 * HEURE);
    const elle = await client("sequence-zero-elle", { debloque: 10 * 24 * HEURE, pronom: "elle" });
    await bulles(elle.u, 10, 6 * 24 * HEURE, 10);
    await bulles(elle.u, -10, 4 * 24 * HEURE, 0);
    await auChat(elle.conv, 4 * 24 * HEURE);
    await passer();
    expect(pour(lui.u).map((m) => m.sujet)).toEqual(["je t’ai pas oublié"]);
    expect(pour(elle.u).map((m) => m.sujet)).toEqual(["je t’ai pas oubliée"]);
  });
});

describe("pour tous", () => {
  it("jamais à l’équipe", async () => {
    const { u } = await client("sequence-equipe");
    EQUIPE.email = u.email;
    try {
      const passage = await passer();
      expect(passage.ecartes).toBeGreaterThanOrEqual(1);
      expect(pour(u)).toEqual([]);
    } finally {
      EQUIPE.email = "";
    }
  });

  it("le plafond du jour atteint : rien ne part, le mail oublié repartira", async () => {
    const { u } = await client("sequence-plafond");
    await poserLeCompteur(plafondsDesMails().relances.max);
    const passage = await passer();
    expect(passage.retenus).toBeGreaterThanOrEqual(1);
    expect(pour(u)).toEqual([]);
    expect(await envois(u)).toEqual([]);
    await poserLeCompteur(0);
    await passer();
    expect(pour(u)).toHaveLength(1);
  });

  it("la désinscription : les offres, les conseils, ou tout ; jamais sans la bonne clé", async () => {
    const u = await compteDeTest("sequence-desinscription");
    const cle = new URL(lienDesinscription(u.id)).searchParams.get("cle")!;
    expect(new URL(lienDesinscription(u.id, "conseils")).searchParams.get("quoi")).toBe("conseils");
    expect(new URL(lienDesinscription(u.id)).searchParams.has("quoi")).toBe(false);
    const etat = async () => (await db().select({ o: schema.users.relancesCoupeesLe, c: schema.users.conseilsCoupesLe }).from(schema.users).where(eq(schema.users.id, u.id)))[0]!;
    expect(await desinscrire(u.id, `${cle}x`, "tout")).toBe(false);
    expect(await desinscrire(u.id, cle, "conseils")).toBe(true);
    expect(await etat()).toEqual({ o: null, c: expect.any(Date) });
    expect(await desinscrire(u.id, cle, "tout")).toBe(true);
    expect(await etat()).toEqual({ o: expect.any(Date), c: expect.any(Date) });
  });
});
