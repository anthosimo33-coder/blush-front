import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GRILLE_DU_23_OCTOBRE, RAPPORT_D_AVANCE } from "@/contenu/offres";
import type { Utilisateur } from "@/server/auth";
import { empreinte } from "@/server/chiffrement";
import * as coffre from "@/server/coffre";
import { db, schema } from "@/server/db";
import { LIMITES, plafondsDesMails } from "@/server/limites";
import { desinscrire, envoyerLesRelances, lienDesinscription, lienDesinscriptionUnClic } from "@/server/relances";
import { aPrisPremium, ECART_ENTRE_DEUX_MAILS_MS, envoyerLesSequences, groupeDuJ6, heureCalme } from "@/server/sequences";
import type { LevelId } from "@/types";
import { jourDeParisAvant } from "@/lib/jours";
import { compteDeTest, convPrete, histoireLue } from "./aide/fixtures";

/*
 * Les séquences de mails (src/server/sequences.ts), lot 1 : S3 après l’achat (« il t’a répondu ? », le vocal, le
 * prochain pas ou, après un 🧊, « comment tu vas ? ») et S4 les bulles (la réponse prête, la dernière bulle, à zéro).
 * Jamais la nuit, un par jour au plus, une fois par occasion, jamais sur une alerte, jamais à l’équipe, et chaque genre
 * coupé par son lien. Les moments sont fabriqués en base (le déblocage, les bulles, le chat), sans attendre. Les mails
 * partis sont pris au passage (envoyerMail), puis partent comme sans clé de Resend (dans les logs).
 */

const EQUIPE = { email: "" };
/* Les mails aux prospects (S1, S2), éteints par défaut, allumés le temps d’un test */
const PROSPECTS = vi.hoisted(() => ({ on: false }));
vi.mock("@/server/env", async (original) => {
  const m = await original<typeof import("@/server/env")>();
  return { ...m, env: () => ({ ...m.env(), BLUSH_MAILS_PROSPECTS: PROSPECTS.on }), accesLibre: (email: string) => email === EQUIPE.email || m.accesLibre(email) };
});

/* Les mails partis : à qui, et ce qu’ils disent */
const partis = vi.hoisted(() => [] as { pour: string; sujet: string; texte: string; html: string; entetes?: Record<string, string> }[]);
vi.mock("@/server/email", async (original) => {
  const m = await original<typeof import("@/server/email")>();
  return {
    ...m,
    envoyerMail: async (...args: Parameters<typeof m.envoyerMail>) => {
      const [pour, mail] = args;
      partis.push({ pour: String(pour), sujet: mail.sujet, texte: mail.texte, html: mail.html ?? "", ...(mail.entetes && { entetes: mail.entetes }) });
      return m.envoyerMail(...args);
    },
  };
});

/* Les compteurs du jour (le garde-fou des séquences, le plafond de la relance) : la base des tests les garde d’un lancement à l’autre */
const SEQUENCES_DU_JOUR = empreinte("limite:sequences:mails");
const RELANCES_DU_JOUR = empreinte("limite:relances:mails");
const poser = (key: string, count: number) =>
  db()
    .insert(schema.rateLimits)
    .values({ key, windowStart: new Date(), count })
    .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count, windowStart: new Date() } });
const poserLeCompteur = async (count: number) => {
  await poser(SEQUENCES_DU_JOUR, count);
  await poser(RELANCES_DU_JOUR, 0);
};

/* Midi à Paris : hors des heures calmes */
const MIDI = new Date("2026-10-17T10:00:00Z");
const passer = () => envoyerLesSequences({ maintenant: MIDI });
const HEURE = 3600e3;
const ilYa = (ms: number) => new Date(Date.now() - ms);
const pour = (u: Utilisateur) => partis.filter((m) => m.pour === u.email);

/* Une conv lue (son verdict, son rapport débloqué), que les convs des comptes du test recopient : la lire une fois suffit */
let lu: { verdict: Buffer; rapport: Buffer; memoire: Buffer; prochainPas: string };
beforeAll(async () => {
  const lecteur = await compteDeTest("sequence-lecteur", "debloque");
  const conv = await histoireLue(lecteur, "01-a-deux-doigts.txt");
  const [v] = await db().select({ data: schema.verdicts.data }).from(schema.verdicts).where(eq(schema.verdicts.storyId, conv.id));
  const [r] = await db().select({ data: schema.reports.data }).from(schema.reports).where(eq(schema.reports.storyId, conv.id));
  const [m] = await db().select({ data: schema.memories.data }).from(schema.memories).where(eq(schema.memories.storyId, conv.id));
  lu = { verdict: v!.data, rapport: r!.data!, memoire: m!.data, prochainPas: coffre.lire("verdicts.data", v!.data).sortie.prochain_pas! };
  await poserLeCompteur(0);
}, 60_000);
beforeEach(() => {
  partis.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => poserLeCompteur(0));

type Emoji = "🔥" | "🤏" | "🤔" | "🧊";

/**
 * Un compte et sa conv (Hugo, il, parle de Sophie), son verdict (`emoji`, `alerte`, `niveau`) et son rapport écrits,
 * débloquée il y a `debloque`. `alerte` : celle du verdict, en mode sobre ou non. `pronom` : celui de l’utilisateur ;
 * `bulles` : son solde.
 */
async function client(
  prefixe: string,
  {
    debloque = 25 * HEURE,
    emoji = "🤏",
    alerte,
    pronom = "il",
    niveau = "voit",
    bulles = 0,
  }: {
    debloque?: number;
    emoji?: Emoji;
    alerte?: { alerte: "danger" | "detresse" | "mineur"; mode_sobre: boolean };
    pronom?: "il" | "elle";
    niveau?: LevelId;
    bulles?: number;
  } = {},
) {
  const u = await compteDeTest(prefixe);
  const conv = (await convPrete(u, "01-a-deux-doigts.txt", { moi: "Hugo", pronom })).id;
  if (bulles) await db().update(schema.users).set({ bulles }).where(eq(schema.users.id, u.id));
  const v = coffre.lire("verdicts.data", lu.verdict);
  const sortie = { ...v.sortie, emoji, niveau, ...alerte };
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
    expect(m!.html).toContain(`/ouvrir/${conv}?m=s3_repondre&amp;dire=son%20dernier%20message%C2%A0%3A%20`);
    expect(m!.html).toContain("Plus de conseils comme ça");
    expect(m!.texte).toContain(lienDesinscription(u.id, "conseils"));
    /* La désinscription en un clic, dans les en-têtes (RFC 8058) : les conseils, signée */
    expect(m!.entetes).toEqual({ "List-Unsubscribe": `<${lienDesinscriptionUnClic(u.id, "conseils")}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
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
    expect(vocal.html).toContain(`/ouvrir/${conv}?m=s3_vocal"`);

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
    expect(pas!.html).toContain(`/ouvrir/${feu.conv}?m=s3_pas&amp;dire=c%E2%80%99est%20fait%C2%A0!%20`);
    expect(pas!.html).toContain(`/ouvrir/${feu.conv}?m=s3_pas&amp;dire=j%E2%80%99ai%20pas%20os%C3%A9%E2%80%A6`);
    const [doux] = pour(glace.u);
    expect(doux!.sujet).toBe("comment tu vas, vraiment\u00a0?");
    expect(doux!.html).toContain("3114");
    expect(doux!.html).not.toContain("€");
  });

  it.each(["danger", "detresse"] as const)("une alerte %s d’aujourd’hui (22 octobre 2026, sans mode sobre) : ses mails comme les autres", async (alerte) => {
    const { u } = await client(`sequence-${alerte}`, { alerte: { alerte, mode_sobre: false } });
    await passer();
    expect(pour(u).map((m) => m.sujet)).toEqual(["alors\u00a0?"]);
    expect(await envois(u)).toEqual([{ cle: "s3_repondre", parti: true }]);
  });

  it("une conv en alerte sobre (la règle de l’âge, ou un rapport doux gardé) : rien, jamais", async () => {
    const { u } = await client("sequence-alerte", { alerte: { alerte: "mineur", mode_sobre: true } });
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

  it("Premium : pris d’emblée, ou ③ payée après son rapport (celle d’aujourd’hui, ou celle d’avant le 23 octobre)", async () => {
    for (const passage of [
      { offre: "passe_premium", centimes: 690, bulles: 22 },
      { offre: "premium_ajout", centimes: 500, bulles: 80 },
    ] as const) {
      const { u, conv } = await client(`sequence-premium-${passage.offre}`);
      expect(await aPrisPremium(conv, u.id)).toBe(false);
      await db()
        .insert(schema.achats)
        .values({ userId: u.id, storyId: null, ...passage, fournisseur: "factice", statut: "paye", payeLe: new Date() });
      expect(await aPrisPremium(conv, u.id), passage.offre).toBe(true);
    }
  });
});

describe("S4 · les bulles", () => {
  it("la réponse prête : avant tout autre mail, la recharge au bouton, le plus petit pack ; plus de ④ (arrêtée le 23 octobre), ni dite ni montrée", async () => {
    const { u, conv } = await client("sequence-prete");
    await auChat(conv, 2 * HEURE, { role: "blush", verrouillee: true });
    await passer();
    const [m, ...autres] = pour(u);
    expect(autres).toEqual([]);
    expect(m!.sujet).toBe("ta réponse est prête");
    expect(m!.html).toContain("Pour Sophie · prête");
    expect(m!.html).toContain(`/ouvrir/${conv}?m=s4_prete&amp;recharger=1`);
    expect(m!.html).toContain("Ta réponse attend 6,90&nbsp;€");
    expect(m!.html).not.toContain("1re recharge");
    expect(m!.html).toContain("Plus d’offres comme ça");
    const quatre = await db()
      .select({ offre: schema.offresUniques.offre })
      .from(schema.offresUniques)
      .where(and(eq(schema.offresUniques.userId, u.id), eq(schema.offresUniques.offre, "premiere_recharge")));
    expect(quatre).toEqual([]);
  });

  it("la dernière bulle, elle qui écrivait cette semaine : une fois par bulles reçues ; à 2, rien encore (le rapport n’en donne que 3)", async () => {
    const deux = await client("sequence-peu-deux", { debloque: 10 * 24 * HEURE });
    await bulles(deux.u, 3, 5 * 24 * HEURE, 2);
    await auChat(deux.conv, 3 * HEURE);
    const { u, conv } = await client("sequence-peu", { debloque: 10 * 24 * HEURE });
    await bulles(u, 3, 5 * 24 * HEURE, 1);
    await auChat(conv, 3 * HEURE);
    await passer();
    expect(pour(deux.u)).toEqual([]);
    expect(pour(u).map((m) => m.sujet)).toEqual(["il te reste 1\u00a0réponse"]);
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

describe("S5 · le chat endormi", () => {
  it("7 jours sans un mot au chat, encore des bulles : leur niveau, trois réponses à une touche ; une fois par silence", async () => {
    const { u, conv } = await client("sequence-j7", { debloque: 9 * 24 * HEURE, bulles: 5 });
    await auChat(conv, 8 * 24 * HEURE);
    await passer();
    const [m, ...autres] = pour(u);
    expect(autres).toEqual([]);
    expect(m!.sujet).toBe("7 jours");
    expect(m!.html).toContain("vous en êtes où, toi et Sophie");
    expect(m!.html).toContain(`/ouvrir/${conv}?m=s5_endormi&amp;dire=on%20se%20l%E2%80%99est%20dit%C2%A0!%20`);
    await db()
      .update(schema.envoisMails)
      .set({ envoyeLe: ilYa(2 * 24 * HEURE) })
      .where(eq(schema.envoisMails.userId, u.id));
    await passer();
    expect(pour(u)).toHaveLength(1);
  });

  it("sans bulles, ou après un 🧊 : rien ; un couple à J+7 : pas ce mail-là (écarté)", async () => {
    const sec = await client("sequence-j7-sec", { debloque: 9 * 24 * HEURE });
    const glace = await client("sequence-j7-glace", { debloque: 9 * 24 * HEURE, emoji: "🧊", bulles: 5 });
    const couple = await client("sequence-j7-couple", { debloque: 9 * 24 * HEURE, niveau: "va", bulles: 5 });
    await passer();
    expect([...pour(sec.u), ...pour(glace.u), ...pour(couple.u)]).toEqual([]);
    expect(await envois(couple.u)).toEqual([{ cle: "s5_endormi", parti: false }]);
  });

  it("21 jours : « parfait, ou abandonné ? »", async () => {
    const { u } = await client("sequence-j21", { debloque: 22 * 24 * HEURE, bulles: 3 });
    await passer();
    expect(pour(u).map((m) => m.sujet)).toEqual(["parfait, ou abandonné\u00a0?"]);
    expect(pour(u)[0]!.html).toContain("t’as encore 3&nbsp;bulles");
  });

  it("un couple, un mois après son rapport : sa température d’alors", async () => {
    const { u } = await client("sequence-couple", { debloque: 31 * 24 * HEURE, niveau: "coince", bulles: 3 });
    await passer();
    const [m] = pour(u);
    expect(m!.sujet).toBe("un mois déjà");
    expect(m!.html).toContain("vous étiez à «&nbsp;ça coince&nbsp;»");
  });
});

describe("S6 · les offres gardées, S7 · après un 🧊", () => {
  it("le −50 % gardé qui finit dans deux jours : son prix, sa fin, et la page d’une nouvelle conv", async () => {
    const { u, conv } = await client("sequence-garde", { debloque: 10 * 24 * HEURE });
    await db()
      .insert(schema.offresUniques)
      .values({ userId: u.id, offre: "garde_second", montreeLe: ilYa(5 * 24 * HEURE), expireLe: new Date(Date.now() + 2 * 24 * HEURE) });
    await passer();
    const [m] = pour(u);
    expect(m!.sujet).toMatch(/^ton −50\u00a0% saute (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)$/);
    expect(m!.html).toContain("4,95&nbsp;€");
    expect(m!.html).toContain(`/ouvrir/${conv}?m=s6_garde&amp;nouvelle=1"`);
    expect(m!.html).toContain("Plus d’offres comme ça");
  });

  it("le rapport d’avance payé qui dort depuis une semaine : jusqu’à quand il vaut, et les bulles promises à sa commande", async () => {
    const { u } = await client("sequence-avance", { debloque: 10 * 24 * HEURE });
    /* Commandé avant la grille du 23 octobre 2026 : le rapport d’alors, à 10 bulles */
    const avant = await client("sequence-avance-avant", { debloque: 10 * 24 * HEURE });
    const avance = { storyId: null, offre: "second", centimes: 695, bulles: 0, fournisseur: "factice", statut: "paye", payeLe: ilYa(8 * 24 * HEURE) } as const;
    await db()
      .insert(schema.achats)
      .values([
        { ...avance, userId: u.id },
        { ...avance, userId: avant.u.id, creeLe: new Date(GRILLE_DU_23_OCTOBRE.getTime() - 60_000) },
      ]);
    await passer();
    const [m] = pour(u);
    expect(m!.sujet).toBe("t’as un rapport payé qui dort");
    expect(m!.html).toContain("Plus de rappels comme ça");
    expect(m!.texte).toMatch(/jusqu’au \d{1,2} [a-zéû]+ \d{4}/);
    expect(m!.html).toContain(`avec ${RAPPORT_D_AVANCE.bulles} réponses de BLUSH`);
    expect(pour(avant.u)[0]!.html).toContain(`avec ${RAPPORT_D_AVANCE.bullesAvantLaGrille} réponses de BLUSH`);
  });

  it("trois semaines après un 🧊, sans nouvelle conv : rien de l’ancienne histoire ; avec une nouvelle conv, rien", async () => {
    const glace = await client("sequence-s7", { debloque: 22 * 24 * HEURE, emoji: "🧊" });
    const repartie = await client("sequence-s7-nouvelle", { debloque: 22 * 24 * HEURE, emoji: "🧊" });
    await convPrete(repartie.u, "01-a-deux-doigts.txt", { moi: "Hugo" });
    const chaud = await client("sequence-s7-chaud", { debloque: 22 * 24 * HEURE, emoji: "🔥" });
    await passer();
    const [m] = pour(glace.u);
    expect(m!.sujet).toBe("trois semaines déjà");
    expect(m!.html).not.toMatch(/Sophie|Hugo/);
    expect([...pour(repartie.u), ...pour(chaud.u)]).toEqual([]);
  });
});

describe("S8 · son anniversaire", () => {
  /* La recherche des anniversaires, deux fois par jour au plus : remise à zéro pour chaque test */
  const ANNIVERSAIRES = empreinte("limite:sequences:anniversaires");
  beforeEach(() => db().delete(schema.rateLimits).where(eq(schema.rateLimits.key, ANNIVERSAIRES)));

  /** Sa fiche (la mémoire lue), un fait en plus. */
  async function ficheAvec(conv: string, texte: string) {
    const memoire = coffre.lire("memories.data", lu.memoire);
    const faits = [...memoire.etat.fiche.faits, { section: "dates" as const, texte, preuves: [], statut: "nouveau" as const }];
    await db()
      .insert(schema.memories)
      .values({ storyId: conv, data: coffre.ecrire("memories.data", { ...memoire, etat: { ...memoire.etat, fiche: { ...memoire.etat.fiche, faits } } }) });
  }

  /** Le jour et le mois à Paris, dans `jours` jours du calendrier (jamais `jours` × 24 h, faux autour d’un changement d’heure) : « 23/10 ». */
  const dansJours = (jours: number) => {
    const [, m, j] = jourDeParisAvant(-jours).split("-");
    return `${j}/${m}`;
  };

  it("dans trois jours, une date entière dans sa fiche : le rappel, une fois ; le bouton écrit sa demande", async () => {
    const { u, conv } = await client("sequence-anniv", { debloque: 40 * 24 * HEURE, bulles: 4 });
    await ficheAvec(conv, `Son anniversaire : ${dansJours(3)}`);
    await passer();
    const [m, ...autres] = pour(u);
    expect(autres).toEqual([]);
    expect(m!.sujet).toMatch(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche), t’as un truc à pas rater$/);
    expect(m!.html).toContain("c’est l’anniv de Sophie 🎂");
    expect(m!.html).toContain(`/ouvrir/${conv}?m=s8_anniv&amp;dire=${encodeURIComponent("écris-moi son message d’anniv 🎂")}`);
    expect(m!.texte).not.toContain("Sophie");
    await db()
      .update(schema.envoisMails)
      .set({ envoyeLe: ilYa(2 * 24 * HEURE) })
      .where(eq(schema.envoisMails.userId, u.id));
    await db().delete(schema.rateLimits).where(eq(schema.rateLimits.key, ANNIVERSAIRES));
    await passer();
    expect(pour(u)).toHaveLength(1);
  });

  it("dans dix jours, ou sans date entière : rien", async () => {
    const loin = await client("sequence-anniv-loin", { debloque: 40 * 24 * HEURE });
    await ficheAvec(loin.conv, `Son anniversaire : ${dansJours(10)}`);
    const flou = await client("sequence-anniv-flou", { debloque: 40 * 24 * HEURE });
    await ficheAvec(flou.conv, "Son anniv est en mars");
    await passer();
    expect([...pour(loin.u), ...pour(flou.u)]).toEqual([]);
  });
});

describe("S3 J+5 · le parrainage", () => {
  it("après un 🔥 : son lien, et le bouton vers sa page ; pas après un 🤏", async () => {
    const feu = await client("sequence-parrainage", { debloque: 5.5 * 24 * HEURE, emoji: "🔥" });
    const tiede = await client("sequence-parrainage-tiede", { debloque: 5.5 * 24 * HEURE, emoji: "🤏" });
    /* Le prochain pas (J+4) est déjà parti, il y a deux jours */
    for (const c of [feu, tiede])
      await db()
        .insert(schema.envoisMails)
        .values({ userId: c.u.id, storyId: c.conv, cle: "s3_pas", occasion: c.conv, envoyeLe: ilYa(2 * 24 * HEURE) });
    await passer();
    const [m] = pour(feu.u);
    expect(m!.sujet).toBe("tu connais quelqu’un qui relit ses messages à 1\u00a0h du mat’\u00a0?");
    expect(m!.html).toMatch(/\/p\/[a-z2-9]{7}</);
    expect(m!.html).toContain(`/ouvrir/${feu.conv}?m=s3_parrainage&amp;parrainage=1`);
    expect(pour(tiede.u)).toEqual([]);
  });
});

describe("S1, S2 · les prospects (éteints par défaut)", () => {
  /** Un compte, sa conv au paywall (sa lecture attend son paiement) depuis `depuis`, rien de payé. */
  async function auPaywall(prefixe: string, depuis = 3 * HEURE) {
    const u = await compteDeTest(prefixe);
    const conv = (await convPrete(u, "01-a-deux-doigts.txt", { moi: "Hugo" })).id;
    await db()
      .insert(schema.tasks)
      .values({ storyId: conv, kind: "verdict", status: "paiement", updatedAt: ilYa(depuis) });
    return { u, conv };
  }

  it("éteints : rien, et la relance ② part comme avant", async () => {
    const { u } = await auPaywall("sequence-s1-eteint");
    await passer();
    expect(pour(u)).toEqual([]);
  });

  it("allumés : H+2 le titre de son paywall et ses chiffres, vers son paywall tout de suite ; la relance ② s’arrête", async () => {
    PROSPECTS.on = true;
    try {
      const { u, conv } = await auPaywall("sequence-s1");
      await passer();
      const [m] = pour(u);
      expect(["j’ai vu une date dans ta conv", "question honnête", "t’as remarqué\u00a0?", "t’as vu le chiffre\u00a0?", "50/50", "t’as fermé juste avant le meilleur"]).toContain(
        m!.sujet,
      );
      expect(m!.html).toContain("Ton rapport sur Sophie");
      expect(m!.html).toContain(`/ouvrir/${conv}?m=s1_haut&amp;paywall=1`);
      expect(m!.html).toContain("Plus de relances");
      expect(`${m!.sujet}${m!.texte}`).not.toMatch(/Sophie|Hugo/);
      expect(await envoyerLesRelances()).toEqual({ dues: 0, envoyees: 0, ecartees: 0, retenues: 0, echecs: 0 });
    } finally {
      PROSPECTS.on = false;
    }
  });

  /** Un compte au paywall depuis `depuis`, tiré dans ce groupe de l’A/B de J+6 (le tirage suit son identifiant). */
  async function auPaywallDansLeGroupe(prefixe: string, groupe: "avec" | "sans", depuis: number) {
    for (let k = 0; k < 40; k++) {
      const c = await auPaywall(`${prefixe}-${k}`, depuis);
      if (groupeDuJ6(c.u.id) === groupe) return c;
    }
    throw new Error(`aucun compte tiré dans le groupe ${groupe}`);
  }

  it("allumés : J+6, la moitié reçoit la one time offer rouverte jusqu’à après-demain minuit ; l’autre, rien (le témoin)", async () => {
    PROSPECTS.on = true;
    try {
      const avec = await auPaywallDansLeGroupe("sequence-j6-avec", "avec", 6.5 * 24 * HEURE);
      const sans = await auPaywallDansLeGroupe("sequence-j6-sans", "sans", 6.5 * 24 * HEURE);
      /* H+2 et J+1 sont déjà partis (deux jours avant) */
      for (const c of [avec, sans])
        for (const cle of ["s1_haut", "s1_chapitres"] as const)
          await db()
            .insert(schema.envoisMails)
            .values({ userId: c.u.id, storyId: c.conv, cle, occasion: c.conv, envoyeLe: ilYa(2 * 24 * HEURE) });
      await passer();
      const [m] = pour(avec.u);
      expect(m!.sujet).toBe("dernière fois que je t’en parle");
      expect(m!.html).toContain("6,90&nbsp;€");
      expect(m!.html).toContain(`/ouvrir/${avec.conv}?m=s1_derniere&amp;paywall=1&amp;offre=1`);
      const [suite] = await db()
        .select({ expireLe: schema.offresUniques.expireLe, storyId: schema.offresUniques.storyId })
        .from(schema.offresUniques)
        .where(and(eq(schema.offresUniques.userId, avec.u.id), eq(schema.offresUniques.offre, "suite")));
      expect(suite!.storyId).toBe(avec.conv);
      /* Après-demain, 23 h 59 59 à Paris : entre 2 et 3 jours d’ici */
      const dans = suite!.expireLe!.getTime() - Date.now();
      expect(dans).toBeGreaterThan(24 * HEURE);
      expect(dans).toBeLessThan(3 * 24 * HEURE);
      expect(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(suite!.expireLe!)).toBe("23:59");
      expect(pour(sans.u)).toEqual([]);
      const temoin = await db()
        .select({ occasion: schema.envoisMails.occasion, parti: schema.envoisMails.parti })
        .from(schema.envoisMails)
        .where(and(eq(schema.envoisMails.userId, sans.u.id), eq(schema.envoisMails.cle, "s1_derniere")));
      expect(temoin).toEqual([{ occasion: `${sans.conv}:temoin`, parti: false }]);
    } finally {
      PROSPECTS.on = false;
    }
  });

  it("allumés : un compte sans conv, H+1, vers une nouvelle conv sans connexion", async () => {
    PROSPECTS.on = true;
    try {
      const u = await compteDeTest("sequence-s2");
      await db()
        .update(schema.users)
        .set({ createdAt: ilYa(2 * HEURE) })
        .where(eq(schema.users.id, u.id));
      await passer();
      const [m] = pour(u);
      expect(m!.html).toContain("Envoie la conv. Je te montre qui court après qui.");
      expect(m!.html).toContain("/ouvrir/nouvelle?m=s2_heure&amp;nouvelle=1");
      expect(m!.html).toContain("Plus de mails comme ça");
    } finally {
      PROSPECTS.on = false;
    }
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

  it("le plafond de la relance ne compte plus : atteint, les séquences partent quand même", async () => {
    const { u } = await client("sequence-sans-plafond");
    await poser(RELANCES_DU_JOUR, plafondsDesMails().relances.max);
    await passer();
    expect(pour(u)).toHaveLength(1);
  });

  it("le garde-fou de 300 par jour atteint : rien ne part, le mail oublié repartira", async () => {
    const { u } = await client("sequence-plafond");
    await poserLeCompteur(LIMITES.sequencesParJour.max);
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
