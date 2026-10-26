import { randomUUID } from "node:crypto";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

/*
 * La règle « qui est qui » (src/server/population.ts) : chaque appel payant noté dans ai_usage (noterCout) porte sa
 * population, jugée à la fin de l’appel et figée ; le rattrapage (rangerLesCouts) range les lignes d’avant elle, et une
 * lecture faite sans compte prend celle du compte que sa conv trouve ; /admin en tire l’IA du produit et celle des tests,
 * la marge produit et des ratios qui prennent la même population en haut et en bas. Avec la base, sans aucun appel au
 * modèle : les appels se notent directement (noterCout), comme le ferait le vrai modèle après sa réponse. L’équipe des
 * tests est celle de BLUSH_ALERTES (equipe@blush.test, vitest.config.mts) ; ses invités (BLUSH_ACCES_LIBRE) sont posés
 * par ce fichier (`etat.invites`).
 */
const etat = vi.hoisted(() => ({ invites: [] as string[] }));
vi.mock("@/server/env", async (original) => {
  const m = await original<typeof import("@/server/env")>();
  return { ...m, env: () => ({ ...m.env(), BLUSH_ACCES_LIBRE: etat.invites }) };
});

import { db, schema } from "@/server/db";
import { emailCanonique } from "@/server/email-canonique";
import { rattacherBrouillon } from "@/server/histoires";
import { noterCout } from "@/server/ia/usage";
import { emailCanoniqueEnSQL, rangerLesCouts } from "@/server/population";
import { statsAdmin } from "@/server/stats";
import { resumerLaVeille } from "@/server/veille";
import type { Population } from "@/types";
import { compteDeTest, convImportee, convRattachee } from "./aide/fixtures";
import { creees } from "./aide/nettoyage";

/** L’étiquette des appels de ce fichier, hors des postes de /admin ; les lignes notées sous un vrai poste se retiennent par leur id. */
const ETIQUETTE = "population-test";
const notees: number[] = [];
afterAll(async () => {
  await db().delete(schema.aiUsage).where(eq(schema.aiUsage.task, ETIQUETTE));
  if (notees.length) await db().delete(schema.aiUsage).where(inArray(schema.aiUsage.id, notees));
});

let n = 0;
const unique = () => `${Date.now()}-${++n}`;

/** Un compte à l’email choisi (un alias de l’équipe, un invité, le compte du tournage), effacé à la fin du fichier comme ceux des fixtures. */
async function compteA(email: string) {
  const [u] = await db().insert(schema.users).values({ email }).returning();
  creees.comptes.push(u!.id);
  return u!;
}

/** Un achat payé de ce compte, il y a `ilYaS` secondes (maintenant par défaut). */
async function achatPaye(userId: string, { centimes = 990, ilYaS = 0, storyId }: { centimes?: number; ilYaS?: number; storyId?: string } = {}) {
  const le = new Date(Date.now() - ilYaS * 1000);
  await db()
    .insert(schema.achats)
    .values({ userId, storyId: storyId ?? null, offre: "rapport", centimes, bulles: 3, fournisseur: "factice", statut: "paye", payeLe: le, creeLe: le });
}

/** Une prise du mode tournage dans ce compte (sa meta reprise d’une autre conv : rien ne la lit). */
async function prise(userId: string, meta: Buffer) {
  const [s] = await db().insert(schema.stories).values({ userId, messageCount: 1, meta, tournageLe: new Date() }).returning({ id: schema.stories.id });
  return s!.id;
}

const metaDe = async (storyId: string) => (await db().select({ meta: schema.stories.meta }).from(schema.stories).where(eq(schema.stories.id, storyId)))[0]!.meta;

/** La ligne d’ai_usage d’un appel : sa population, son compte, sa conv. */
const ligneDe = async (id: number) =>
  (
    await db()
      .select({ population: schema.aiUsage.population, userId: schema.aiUsage.userId, storyId: schema.aiUsage.storyId })
      .from(schema.aiUsage)
      .where(eq(schema.aiUsage.id, id))
  )[0]!;

/** Note un appel de 1 $ (comme le vrai modèle après sa réponse) et rend sa ligne, avec son id. */
async function noter(qui: { storyId?: string; compte?: { id: string } | null; envoi?: string }, { tache = ETIQUETTE, dollars = 1 }: { tache?: string; dollars?: number } = {}) {
  await noterCout({ ...qui, tache, modele: "test", micros: dollars * 1e6, ms: 1 });
  const [l] = await db().select({ id: schema.aiUsage.id }).from(schema.aiUsage).where(eq(schema.aiUsage.task, tache)).orderBy(desc(schema.aiUsage.id)).limit(1);
  if (tache !== ETIQUETTE) notees.push(l!.id);
  return { id: l!.id, ...(await ligneDe(l!.id)) };
}

/** Une ligne comme l’écrivait la version d’avant la règle : sans population ni compte, à l’heure `le`. */
async function ligneDAvant({ storyId = null, envoi = null, le = new Date() }: { storyId?: string | null; envoi?: string | null; le?: Date }) {
  const [l] = await db()
    .insert(schema.aiUsage)
    .values({ storyId, envoi, task: ETIQUETTE, model: "test", costMicros: 1_000_000, createdAt: le })
    .returning({ id: schema.aiUsage.id });
  return l!.id;
}

/** Le rattrapage jusqu’au bout (5 000 lignes par passage : la base des tests en garde d’autres runs), puis un passage de plus, qui ne range plus rien. */
async function toutRanger(): Promise<number> {
  for (let i = 0; i < 50 && (await rangerLesCouts()) > 0; i++);
  return rangerLesCouts();
}

describe("l’email canonique en SQL", () => {
  it("dit la même chose qu’emailCanonique, cas par cas", async () => {
    const emails = [
      "Noe+1@gmail.com",
      "n.o.e@googlemail.com",
      " Lea@Exemple.FR ",
      "lea+promo+2@exemple.fr",
      "+tag@exemple.fr",
      "...@gmail.com",
      ".+x@gmail.com",
      "pas-un-email",
      "@exemple.fr",
      "lea@",
      "a@b@exemple.fr",
      "equipe+essai@blush.test",
      "tournage+prise@askblush.com",
    ];
    for (const email of emails) {
      const [l] = (await db().execute<{ c: string }>(sql`select ${emailCanoniqueEnSQL(sql`${email}::text`)} as c`)).rows;
      expect({ email, c: l?.c }).toEqual({ email, c: emailCanonique(email) });
    }
  });
});

describe("la règle « qui est qui », à la note de chaque appel", () => {
  it("un client : un compte qui a payé, sa conv ; un appel sans conv de son compte connecté aussi", async () => {
    const u = await compteDeTest("population-client");
    const conv = await convRattachee(u, "01-a-deux-doigts.txt");
    await achatPaye(u.id, { storyId: conv.id });
    expect(await noter({ storyId: conv.id })).toMatchObject({ population: "client", userId: u.id, storyId: conv.id });
    /* Des captures lues avant l’import, connecté : sans conv, par son compte */
    expect(await noter({ compte: { id: u.id }, envoi: "envoi-du-client" })).toMatchObject({ population: "client", userId: u.id, storyId: null });
  });

  it("un prospect qui achète : ses appels d’avant restent en prospect (le produit, toujours), les suivants sont d’un client", async () => {
    const u = await compteDeTest("population-prospect");
    const conv = await convRattachee(u, "01-a-deux-doigts.txt");
    const avant = await noter({ storyId: conv.id });
    expect(avant).toMatchObject({ population: "prospect", userId: u.id });
    await achatPaye(u.id, { storyId: conv.id });
    expect(await noter({ storyId: conv.id })).toMatchObject({ population: "client", userId: u.id });
    expect((await ligneDe(avant.id)).population).toBe("prospect");
  });

  it("sans compte : des captures d’avant l’email (leur envoi) sont d’un prospect, un brouillon aussi ; sans rien qui le dise, « inconnu »", async () => {
    expect(await noter({ envoi: `envoi-${unique()}` })).toMatchObject({ population: "prospect", userId: null });
    const brouillon = await convImportee("02-reciproque.txt");
    expect(await noter({ storyId: brouillon.id })).toMatchObject({ population: "prospect", userId: null });
    expect(await noter({})).toMatchObject({ population: "inconnu", userId: null });
  });

  it("l’équipe : un alias de l’email de l’équipe, toutes ses convs, même après un achat d’essai", async () => {
    const equipe = await compteA(`equipe+population-${unique()}@blush.test`);
    const conv = await convRattachee(equipe, "01-a-deux-doigts.txt");
    await achatPaye(equipe.id, { storyId: conv.id });
    expect(await noter({ storyId: conv.id })).toMatchObject({ population: "equipe", userId: equipe.id });
    expect(await noter({ compte: { id: equipe.id } })).toMatchObject({ population: "equipe" });
  });

  it("le tournage : une prise, la conv qu’un lien rejoue, le compte du tournage, et le compte d’une créatrice", async () => {
    /* Une prise, dans le compte d’un client : la conv l’emporte */
    const client = await compteDeTest("population-creatrice");
    const conv = await convRattachee(client, "01-a-deux-doigts.txt");
    const meta = await metaDe(conv.id);
    await achatPaye(client.id);
    expect(await noter({ storyId: conv.id })).toMatchObject({ population: "client" });
    const laPrise = await prise(client.id, meta);
    expect(await noter({ storyId: laPrise })).toMatchObject({ population: "tournage", userId: client.id });
    /* Depuis sa prise, c’est une créatrice : ses autres convs aussi */
    expect(await noter({ storyId: conv.id })).toMatchObject({ population: "tournage" });
    /* La conv qu’un lien de tournage rejoue, lue dans un compte ordinaire */
    const source = await convRattachee(await compteDeTest("population-source"), "02-reciproque.txt");
    await db()
      .insert(schema.tournages)
      .values({ nom: "A · essai", storyId: source.id, cle: Buffer.from("cle"), cleHash: `population-${unique()}` });
    expect(await noter({ storyId: source.id })).toMatchObject({ population: "tournage" });
    /* Le compte des convs de tournage (son email canonique : un alias le reste) */
    const compteDuTournage = await compteA(`tournage+population-${unique()}@askblush.com`);
    const lue = await convRattachee(compteDuTournage, "04-ghosting.txt");
    expect(await noter({ storyId: lue.id })).toMatchObject({ population: "tournage", userId: compteDuTournage.id });
  });

  it("un invité de BLUSH_ACCES_LIBRE : l’offert, ni un test ni une vente ; l’équipe passe avant lui", async () => {
    const invite = await compteA(`invite-population-${unique()}@blush.test`);
    const equipe = await compteA(`equipe+invitee-${unique()}@blush.test`);
    etat.invites = [invite.email, equipe.email];
    try {
      const conv = await convRattachee(invite, "01-a-deux-doigts.txt");
      expect(await noter({ storyId: conv.id })).toMatchObject({ population: "offert", userId: invite.id });
      expect(await noter({ compte: { id: equipe.id } })).toMatchObject({ population: "equipe" });
    } finally {
      etat.invites = [];
    }
  });

  it("figée : une conv puis un compte effacés laissent leur population, sans identifiant", async () => {
    const u = await compteDeTest("population-efface");
    const conv = await convRattachee(u, "01-a-deux-doigts.txt");
    await achatPaye(u.id);
    const ligne = await noter({ storyId: conv.id });
    await db().delete(schema.stories).where(eq(schema.stories.id, conv.id));
    expect(await ligneDe(ligne.id)).toEqual({ population: "client", userId: u.id, storyId: null });
    await db().delete(schema.users).where(eq(schema.users.id, u.id));
    expect(await ligneDe(ligne.id)).toEqual({ population: "client", userId: null, storyId: null });
  });

  it("jamais une ligne perdue : la conv effacée avant la note, ou la règle en échec, notent « inconnu »", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await noter({ storyId: randomUUID() })).toMatchObject({ population: "inconnu", userId: null, storyId: null });
    /* Un compte qui n’en est pas un : la règle échoue dans l’insert, la ligne se note sans elle */
    expect(await noter({ compte: { id: "pas-un-identifiant" } })).toMatchObject({ population: "inconnu", userId: null });
  });
});

describe("le rattrapage (rangerLesCouts, au passage des 5 minutes)", () => {
  it("range les lignes d’avant la règle à leur heure, par leur conv ou l’import de leur envoi ; le reste en « inconnu » ; rejoué, rien de plus", async () => {
    const u = await compteDeTest("population-rattrapage");
    const conv = await convRattachee(u, "01-a-deux-doigts.txt");
    /* Un achat payé maintenant : une ligne d’il y a une heure était d’un prospect, une d’après, d’un client */
    await achatPaye(u.id, { storyId: conv.id });
    const avantLAchat = await ligneDAvant({ storyId: conv.id, le: new Date(Date.now() - 3600e3) });
    const apresLAchat = await ligneDAvant({ storyId: conv.id });
    /* Des captures d’avant l’import (sans conv) : retrouvées par l’import de leur envoi, une conv de l’équipe */
    const equipe = await compteA(`equipe+rattrapage-${unique()}@blush.test`);
    const convDeLEquipe = await convRattachee(equipe, "02-reciproque.txt");
    const envoi = `envoi-${unique()}`;
    await db().insert(schema.imports).values({ storyId: convDeLEquipe.id, envoi, type: "captures", appli: "whatsapp", ecrans: 3, lots: 1 });
    const parLEnvoi = await ligneDAvant({ envoi });
    /* Une prise du tournage ; une ligne sans conv ni import : rien ne dit qui */
    const laPrise = await prise(u.id, await metaDe(conv.id));
    const duTournage = await ligneDAvant({ storyId: laPrise, le: new Date(Date.now() + 1000) });
    const sansRien = await ligneDAvant({ envoi: `lu-pour-rien-${unique()}` });

    expect(await toutRanger()).toBe(0);
    expect(await ligneDe(avantLAchat)).toEqual({ population: "prospect", userId: u.id, storyId: conv.id });
    expect(await ligneDe(apresLAchat)).toMatchObject({ population: "client", userId: u.id });
    expect(await ligneDe(parLEnvoi)).toEqual({ population: "equipe", userId: equipe.id, storyId: null });
    expect(await ligneDe(duTournage)).toMatchObject({ population: "tournage" });
    expect(await ligneDe(sansRien)).toEqual({ population: "inconnu", userId: null, storyId: null });
    await db().delete(schema.imports).where(eq(schema.imports.envoi, envoi));
  });

  it("une lecture faite sans compte prend la population du compte que sa conv trouve : l’équipe qui essaie l’import sans être connectée", async () => {
    const brouillon = await convImportee("01-a-deux-doigts.txt");
    const lue = await noter({ storyId: brouillon.id, envoi: `envoi-${unique()}` });
    expect(lue).toMatchObject({ population: "prospect", userId: null });
    const equipe = await compteA(`equipe+brouillon-${unique()}@blush.test`);
    expect(await rattacherBrouillon(equipe, brouillon.secret)).toBe(brouillon.id);
    expect(await toutRanger()).toBe(0);
    expect(await ligneDe(lue.id)).toEqual({ population: "equipe", userId: equipe.id, storyId: brouillon.id });
    /* Un compte ordinaire : prospect, son compte noté (la ligne ne se relit plus) */
    const autre = await convImportee("02-reciproque.txt");
    const lueAussi = await noter({ storyId: autre.id, envoi: `envoi-${unique()}` });
    const u = await compteDeTest("population-brouillon");
    await rattacherBrouillon(u, autre.secret);
    expect(await toutRanger()).toBe(0);
    expect(await ligneDe(lueAussi.id)).toEqual({ population: "prospect", userId: u.id, storyId: autre.id });
  });
});

describe("le tableau de bord : l’IA du produit et celle des tests à part, la marge produit, des ratios sur la même population", () => {
  it("le produit (un client) et les tests (l’équipe, le tournage) ; les ventes des vrais clients seulement ; un verdict des tests ne bouge pas le coût par verdict", async () => {
    const avant = await statsAdmin(7);
    const client = await compteDeTest("population-stats-client");
    const convClient = await convRattachee(client, "01-a-deux-doigts.txt");
    const equipe = await compteA(`equipe+stats-${unique()}@blush.test`);
    const convEquipe = await convRattachee(equipe, "02-reciproque.txt");
    /* Les achats : 9,90 € d’un client, 14,90 € d’essai payés par l’équipe */
    await achatPaye(client.id, { storyId: convClient.id, centimes: 990 });
    await achatPaye(equipe.id, { storyId: convEquipe.id, centimes: 1490 });
    /* Un verdict des tests (l’équipe), avec son coût : ni en haut ni en bas du coût par verdict */
    const meta = await metaDe(convEquipe.id);
    await db().insert(schema.verdicts).values({ storyId: convEquipe.id, data: meta });
    await noter({ storyId: convEquipe.id }, { tache: "verdict", dollars: 2 });
    /* Une prise du tournage, son chat */
    await noter({ storyId: await prise(equipe.id, meta) }, { tache: "chat", dollars: 3 });
    const tests = await statsAdmin(7);
    expect(tests.couts.parVerdict).toBe(avant.couts.parVerdict);
    /* Le client : son verdict (1,50 $) et son chat (0,50 $) */
    await db().insert(schema.verdicts).values({ storyId: convClient.id, data: meta });
    await noter({ storyId: convClient.id }, { tache: "verdict", dollars: 1.5 });
    await noter({ storyId: convClient.id }, { tache: "chat", dollars: 0.5 });
    const apres = await statsAdmin(7);

    const d = (f: (s: typeof avant) => number) => Math.round((f(apres) - f(avant)) * 100) / 100;
    const de = (s: typeof avant, p: Population) => s.couts.populations.find((x) => x.population === p)!.dollars;
    expect(apres.couts.populations.map((x) => x.population)).toEqual(["client", "prospect", "offert", "equipe", "tournage", "inconnu"]);
    expect([d((s) => s.couts.total), d((s) => s.couts.produit.valeur), d((s) => s.couts.tests.valeur)]).toEqual([7, 2, 5]);
    expect([d((s) => de(s, "client")), d((s) => de(s, "equipe")), d((s) => de(s, "tournage"))]).toEqual([2, 2, 3]);
    /* Les postes : en tout, et pour le produit seul */
    const poste = (s: typeof avant, nom: string) => s.couts.postes.find((p) => p.nom === nom) ?? { dollars: 0, produit: { dollars: 0 } };
    expect([d((s) => poste(s, "Verdict").dollars), d((s) => poste(s, "Verdict").produit.dollars), d((s) => poste(s, "Chat").produit.dollars)]).toEqual([3.5, 1.5, 0.5]);
    /* Les ventes : le net de tous, celui des vrais clients (sans l’essai de l’équipe), leurs acheteurs */
    expect([d((s) => s.pilotage.net.valeur), d((s) => s.pilotage.netProduit.valeur), d((s) => s.pilotage.acheteursProduit.valeur)]).toEqual([2480, 990, 1]);
    /* Case par case aussi (la dernière, aujourd’hui) : le payé et l’IA du produit, la marge produit en sort */
    const derniere = (s: typeof avant) => s.pilotage.cases.at(-1)!;
    expect([d((s) => derniere(s).centimesProduit), d((s) => derniere(s).dollarsProduit), d((s) => derniere(s).dollars)]).toEqual([990, 2, 7]);
    /* Un verdict du client et son coût : le coût par verdict du produit le compte, en haut et en bas */
    expect(apres.couts.parVerdict).not.toBeNull();
    if (avant.couts.parVerdict === null) expect(apres.couts.parVerdict).toBeCloseTo(1.5, 6);
  });

  it("un rapport de l’équipe et ses appels ne bougent pas le coût par rapport ; les lignes pas encore rangées comptent « inconnu »", async () => {
    const avant = await statsAdmin(7);
    const equipe = await compteA(`equipe+rapport-${unique()}@blush.test`);
    const conv = await convRattachee(equipe, "01-a-deux-doigts.txt");
    await db()
      .insert(schema.reports)
      .values({ storyId: conv.id, data: await metaDe(conv.id) });
    await noter({ storyId: conv.id }, { tache: "rapport_chapitres", dollars: 4 });
    const pasRangee = await ligneDAvant({});
    try {
      const apres = await statsAdmin(7);
      expect(apres.couts.parRapport).toBe(avant.couts.parRapport);
      const inconnu = (s: typeof avant) => s.couts.populations.find((x) => x.population === "inconnu")!.dollars;
      expect(Math.round((inconnu(apres) - inconnu(avant)) * 100) / 100).toBe(1);
      expect(Math.round((apres.couts.tests.valeur - avant.couts.tests.valeur) * 100) / 100).toBe(4);
    } finally {
      await db().delete(schema.aiUsage).where(eq(schema.aiUsage.id, pasRangee));
    }
  });
});

describe("le résumé de la nuit", () => {
  /** Le résumé des dernières 24 h, tel qu’il s’écrit en local (sans prestataire de mails : dans la console). */
  async function resume(): Promise<string> {
    const lignes: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((l: unknown) => void lignes.push(String(l)));
    try {
      await resumerLaVeille();
    } finally {
      log.mockRestore();
    }
    return lignes.join("\n");
  }
  /** Les dollars d’une ligne du résumé (« IA du produit … : 12.34 $ »), 0 si elle manque. */
  const dollarsDe = (texte: string, ligne: string) => Number(texte.match(new RegExp(`${ligne} : ([\\d.]+) \\$`))?.[1] ?? 0);

  it("sépare l’IA du produit et celle des tests, comme /admin, et dit la part du produit de chaque étiquette", async () => {
    const PRODUIT = "IA du produit \\(les clients et les prospects\\)";
    const TESTS = "IA des tests \\(l’équipe et le tournage\\)";
    const avant = await resume();
    const client = await compteDeTest("population-veille");
    await achatPaye(client.id);
    await noter({ compte: { id: client.id } }, { dollars: 1.25 });
    await noter({ compte: { id: (await compteA(`equipe+veille-${unique()}@blush.test`)).id } }, { dollars: 2 });
    const apres = await resume();
    expect(Math.round((dollarsDe(apres, PRODUIT) - dollarsDe(avant, PRODUIT)) * 100) / 100).toBe(1.25);
    expect(Math.round((dollarsDe(apres, TESTS) - dollarsDe(avant, TESTS)) * 100) / 100).toBe(2);
    expect(apres).toMatch(new RegExp(`  ${ETIQUETTE} : [\\d.]+ \\$ \\(\\d+ appels?\\), dont [\\d.]+ \\$ pour le produit`));
    expect(apres).toMatch(/BLUSH · la veille : \d+ imports?, [\d.]+ \$ d’IA \([\d.]+ \$ pour le produit\)/);
  });
});
