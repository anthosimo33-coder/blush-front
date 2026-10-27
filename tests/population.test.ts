import { randomUUID } from "node:crypto";
import { desc, eq, inArray, sql, TransactionRollbackError, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, describe, expect, it, vi } from "vitest";

/*
 * La règle « qui est qui » (src/server/population.ts) : chaque appel payant noté dans ai_usage (noterCout) porte sa
 * population, jugée à la fin de l’appel et figée, chaque achat payé celle de son acheteur (rangerLAchat) ; le rattrapage
 * (rangerLesCouts) range ce qui n’en a pas, et une lecture jugée sans compte prend celle du compte que sa conv trouve ;
 * /admin en tire l’IA du produit et celle des tests, la marge produit et des ratios qui prennent la même population en
 * haut et en bas, sans jamais rejuger la règle (le coût estimé de chaque requête reste sous le seuil de la compilation
 * JIT). Avec la base, sans aucun appel au modèle : les appels se notent directement (noterCout), comme le ferait le vrai
 * modèle après sa réponse. L’équipe des tests est celle de BLUSH_ALERTES (equipe@blush.test, vitest.config.mts) ; ses
 * invités (BLUSH_ACCES_LIBRE) sont posés par ce fichier (`etat.invites`).
 */
const etat = vi.hoisted(() => ({ invites: [] as string[] }));
vi.mock("@/server/env", async (original) => {
  const m = await original<typeof import("@/server/env")>();
  return { ...m, env: () => ({ ...m.env(), BLUSH_ACCES_LIBRE: etat.invites }) };
});

import { supprimerCompte } from "@/server/comptes";
import { db, schema } from "@/server/db";
import { emailCanonique } from "@/server/email-canonique";
import { rattacherBrouillon } from "@/server/histoires";
import { noterCout } from "@/server/ia/usage";
import { emailCanoniqueEnSQL, rangerLAchat, rangerLesCouts } from "@/server/population";
import { statsAdmin } from "@/server/stats";
import { resumerLaVeille } from "@/server/veille";
import type { Population } from "@/types";
import { compteDeTest, convImportee, convRattachee } from "./aide/fixtures";
import { creees } from "./aide/nettoyage";

/** L’étiquette des appels de ce fichier, hors des postes de /admin ; les lignes notées sous un vrai poste se retiennent par leur id. */
const ETIQUETTE = "population-test";
const notees: number[] = [];
/** Les achats qu’un compte effacé laisse sans compte : le nettoyage des fixtures ne les retrouve plus. */
const achatsOrphelins: string[] = [];
afterAll(async () => {
  await db().delete(schema.aiUsage).where(eq(schema.aiUsage.task, ETIQUETTE));
  if (notees.length) await db().delete(schema.aiUsage).where(inArray(schema.aiUsage.id, notees));
  if (achatsOrphelins.length) await db().delete(schema.achats).where(inArray(schema.achats.id, achatsOrphelins));
});

let n = 0;
const unique = () => `${Date.now()}-${++n}`;

/** Un compte à l’email choisi (un alias de l’équipe, un invité, le compte du tournage), effacé à la fin du fichier comme ceux des fixtures. */
async function compteA(email: string) {
  const [u] = await db().insert(schema.users).values({ email }).returning();
  creees.comptes.push(u!.id);
  return u!;
}

/** Un achat payé de ce compte, il y a `ilYaS` secondes (maintenant par défaut), rangé comme à sa livraison (rangerLAchat). Rend son id. */
async function achatPaye(userId: string, { centimes = 990, ilYaS = 0, storyId }: { centimes?: number; ilYaS?: number; storyId?: string } = {}) {
  const le = new Date(Date.now() - ilYaS * 1000);
  const [a] = await db()
    .insert(schema.achats)
    .values({ userId, storyId: storyId ?? null, offre: "rapport", centimes, bulles: 3, fournisseur: "factice", statut: "paye", payeLe: le, creeLe: le })
    .returning({ id: schema.achats.id });
  await rangerLAchat(a!.id);
  return a!.id;
}

const populationDeLAchat = async (id: string) => (await db().select({ p: schema.achats.population }).from(schema.achats).where(eq(schema.achats.id, id)))[0]?.p;

/** Une prise du mode tournage dans ce compte (sa meta reprise d’une autre conv : rien ne la lit). */
async function prise(userId: string, meta: Buffer) {
  const [s] = await db().insert(schema.stories).values({ userId, messageCount: 1, meta, tournageLe: new Date() }).returning({ id: schema.stories.id });
  return s!.id;
}

const metaDe = async (storyId: string) => (await db().select({ meta: schema.stories.meta }).from(schema.stories).where(eq(schema.stories.id, storyId)))[0]!.meta;

/** La ligne d’ai_usage d’un appel : sa population, si elle s’est jugée sans compte, sa conv. */
const ligneDe = async (id: number) =>
  (
    await db()
      .select({ population: schema.aiUsage.population, sansCompte: schema.aiUsage.sansCompte, storyId: schema.aiUsage.storyId })
      .from(schema.aiUsage)
      .where(eq(schema.aiUsage.id, id))
  )[0]!;

/** La dernière ligne notée sous cette étiquette, et son id. */
async function derniere(tache: string) {
  const [l] = await db().select({ id: schema.aiUsage.id }).from(schema.aiUsage).where(eq(schema.aiUsage.task, tache)).orderBy(desc(schema.aiUsage.id)).limit(1);
  if (tache !== ETIQUETTE) notees.push(l!.id);
  return { id: l!.id, ...(await ligneDe(l!.id)) };
}

/** Note un appel de 1 $ (comme le vrai modèle après sa réponse) et rend sa ligne, avec son id. */
async function noter(qui: { storyId?: string; compte?: { id: string } | null; envoi?: string }, { tache = ETIQUETTE, dollars = 1 }: { tache?: string; dollars?: number } = {}) {
  await noterCout({ ...qui, tache, modele: "test", micros: dollars * 1e6, ms: 1 });
  return derniere(tache);
}

/** Une ligne comme l’écrivait la version d’avant la règle : sans population, à l’heure `le`. */
async function ligneDAvant({ storyId = null, envoi = null, le = new Date(), tache = ETIQUETTE }: { storyId?: string | null; envoi?: string | null; le?: Date; tache?: string }) {
  const [l] = await db().insert(schema.aiUsage).values({ storyId, envoi, task: tache, model: "test", costMicros: 1_000_000, createdAt: le }).returning({ id: schema.aiUsage.id });
  if (tache !== ETIQUETTE) notees.push(l!.id);
  return l!.id;
}

/** Le rattrapage jusqu’au bout (5 000 lignes par passage : la base des tests en garde d’autres runs), puis un passage de plus, qui ne range plus rien. */
async function toutRanger() {
  for (let i = 0; i < 50; i++) {
    const r = await rangerLesCouts();
    if (r.couts + r.achats === 0) break;
  }
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
    /* La colonne générée users.email_canonique, la même règle : des comptes écrits dans une transaction annulée */
    const colonne = new Map<string, string>();
    await db()
      .transaction(async (tx) => {
        for (const email of emails) {
          const [l] = (await tx.execute<{ c: string }>(sql`insert into users (email) values (${email}) returning email_canonique as c`)).rows;
          colonne.set(email, l!.c);
        }
        tx.rollback();
      })
      .catch((e: unknown) => {
        if (!(e instanceof TransactionRollbackError)) throw e;
      });
    expect(Object.fromEntries(colonne)).toEqual(Object.fromEntries(emails.map((e) => [e, emailCanonique(e)])));
  });
});

describe("la règle « qui est qui », à la note de chaque appel", () => {
  it("un client : un compte qui a payé, sa conv ; un appel sans conv de son compte connecté aussi", async () => {
    const u = await compteDeTest("population-client");
    const conv = await convRattachee(u, "01-a-deux-doigts.txt");
    expect(await populationDeLAchat(await achatPaye(u.id, { storyId: conv.id }))).toBe("client");
    expect(await noter({ storyId: conv.id })).toMatchObject({ population: "client", sansCompte: false, storyId: conv.id });
    /* Des captures lues avant l’import, connecté : sans conv, par son compte */
    expect(await noter({ compte: { id: u.id }, envoi: "envoi-du-client" })).toMatchObject({ population: "client", sansCompte: false, storyId: null });
  });

  it("un prospect qui achète : ses appels d’avant restent en prospect (le produit, toujours), les suivants sont d’un client", async () => {
    const u = await compteDeTest("population-prospect");
    const conv = await convRattachee(u, "01-a-deux-doigts.txt");
    const avant = await noter({ storyId: conv.id });
    expect(avant).toMatchObject({ population: "prospect", sansCompte: false });
    await achatPaye(u.id, { storyId: conv.id });
    expect(await noter({ storyId: conv.id })).toMatchObject({ population: "client" });
    expect((await ligneDe(avant.id)).population).toBe("prospect");
  });

  it("sans compte : des captures d’avant l’email (leur envoi) sont d’un prospect, un brouillon aussi ; sans rien qui le dise, « inconnu »", async () => {
    expect(await noter({ envoi: `envoi-${unique()}` })).toMatchObject({ population: "prospect", sansCompte: true });
    const brouillon = await convImportee("02-reciproque.txt");
    expect(await noter({ storyId: brouillon.id })).toMatchObject({ population: "prospect", sansCompte: true });
    expect(await noter({})).toMatchObject({ population: "inconnu", sansCompte: true });
  });

  it("l’équipe : un alias de l’email de l’équipe, toutes ses convs, même après un achat d’essai (rangé équipe lui aussi)", async () => {
    const equipe = await compteA(`equipe+population-${unique()}@blush.test`);
    const conv = await convRattachee(equipe, "01-a-deux-doigts.txt");
    expect(await populationDeLAchat(await achatPaye(equipe.id, { storyId: conv.id }))).toBe("equipe");
    expect(await noter({ storyId: conv.id })).toMatchObject({ population: "equipe" });
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
    expect(await noter({ storyId: laPrise })).toMatchObject({ population: "tournage" });
    /* Depuis sa prise, c’est une créatrice : ses autres convs aussi, et ses achats */
    expect(await noter({ storyId: conv.id })).toMatchObject({ population: "tournage" });
    expect(await populationDeLAchat(await achatPaye(client.id))).toBe("tournage");
    /* La conv qu’un lien de tournage rejoue, lue dans un compte ordinaire */
    const source = await convRattachee(await compteDeTest("population-source"), "02-reciproque.txt");
    await db()
      .insert(schema.tournages)
      .values({ nom: "A · essai", storyId: source.id, cle: Buffer.from("cle"), cleHash: `population-${unique()}` });
    expect(await noter({ storyId: source.id })).toMatchObject({ population: "tournage" });
    /* Le compte des convs de tournage (son email canonique : un alias le reste) */
    const compteDuTournage = await compteA(`tournage+population-${unique()}@askblush.com`);
    const lue = await convRattachee(compteDuTournage, "04-ghosting.txt");
    expect(await noter({ storyId: lue.id })).toMatchObject({ population: "tournage" });
  });

  it("un invité de BLUSH_ACCES_LIBRE : l’offert, ni un test ni une vente ; l’équipe passe avant lui", async () => {
    const invite = await compteA(`invite-population-${unique()}@blush.test`);
    const equipe = await compteA(`equipe+invitee-${unique()}@blush.test`);
    etat.invites = [invite.email, equipe.email];
    try {
      const conv = await convRattachee(invite, "01-a-deux-doigts.txt");
      expect(await noter({ storyId: conv.id })).toMatchObject({ population: "offert" });
      expect(await noter({ compte: { id: equipe.id } })).toMatchObject({ population: "equipe" });
    } finally {
      etat.invites = [];
    }
  });

  it("figée : une conv puis un compte effacés laissent leur population à leurs lignes et à leurs achats", async () => {
    const u = await compteDeTest("population-efface");
    const conv = await convRattachee(u, "01-a-deux-doigts.txt");
    const achat = await achatPaye(u.id);
    const ligne = await noter({ storyId: conv.id });
    await db().delete(schema.stories).where(eq(schema.stories.id, conv.id));
    expect(await ligneDe(ligne.id)).toEqual({ population: "client", sansCompte: false, storyId: null });
    await db().delete(schema.users).where(eq(schema.users.id, u.id));
    achatsOrphelins.push(achat);
    expect(await ligneDe(ligne.id)).toEqual({ population: "client", sansCompte: false, storyId: null });
    expect(await populationDeLAchat(achat)).toBe("client");
  });

  it("jamais une ligne perdue : la conv effacée avant la note, ou la règle en échec, notent la ligne sans population, que le rattrapage range", async () => {
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      /* Une conv qui n’existe plus : la clé étrangère refuse, la ligne se note sans conv */
      const sansConv = await noter({ storyId: randomUUID() });
      expect(sansConv).toEqual({ id: sansConv.id, population: null, sansCompte: false, storyId: null });
      /* Un compte qui n’en est pas un : la règle échoue dans l’insert, la ligne se note sans elle */
      const sansRegle = await noter({ compte: { id: "pas-un-identifiant" } });
      expect(sansRegle).toMatchObject({ population: null });
      expect(erreurs.mock.calls.map(([l]) => JSON.parse(String(l)) as { evenement: string; code?: string; codeCause?: string })).toEqual([
        expect.objectContaining({ evenement: "usage noté sans sa population", codeCause: "23503" }),
        expect.objectContaining({ evenement: "usage noté sans sa population", codeCause: "22P02" }),
      ]);
      await toutRanger();
      expect([(await ligneDe(sansConv.id)).population, (await ligneDe(sansRegle.id)).population]).toEqual(["inconnu", "inconnu"]);
    } finally {
      erreurs.mockRestore();
    }
  });

  it("une panne de la connexion n’a pas de nouvel essai : la ligne perdue part dans les logs, jamais en double", async () => {
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => {});
    /* Le premier insert part, puis la connexion se coupe avant sa réponse (comme pg : une Error sans code SQL) */
    const insert = vi.spyOn(db(), "insert").mockImplementation(() => {
      throw new Error("Connection terminated unexpectedly");
    });
    try {
      await noterCout({ tache: ETIQUETTE, modele: "test", micros: 1e6, ms: 1, envoi: `envoi-${unique()}` });
      expect(insert).toHaveBeenCalledTimes(1);
      expect(erreurs.mock.calls.map(([l]) => (JSON.parse(String(l)) as { evenement: string }).evenement)).toEqual(["usage non noté"]);
    } finally {
      insert.mockRestore();
      erreurs.mockRestore();
    }
  });
});

describe("le rattrapage (rangerLesCouts, au passage des 5 minutes)", () => {
  it("range les lignes d’avant la règle à leur heure, par leur conv ou l’import de leur envoi ; une lecture d’avant l’import en prospect ; le reste en « inconnu » ; rejoué, rien de plus", async () => {
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
    /* Une prise du tournage */
    const laPrise = await prise(u.id, await metaDe(conv.id));
    const duTournage = await ligneDAvant({ storyId: laPrise, le: new Date(Date.now() + 1000) });
    /* Lues pour rien (un envoi sans import), ou des captures d’avant la mesure des imports (ni conv ni envoi) : un prospect, sans compte */
    const luePourRien = await ligneDAvant({ envoi: `lu-pour-rien-${unique()}` });
    const capturesDAvant = await ligneDAvant({ tache: "captures" });
    /* Une autre étiquette sans conv ni envoi : rien ne dit qui */
    const sansRien = await ligneDAvant({});

    expect(await toutRanger()).toEqual({ couts: 0, achats: 0 });
    expect(await ligneDe(avantLAchat)).toEqual({ population: "prospect", sansCompte: false, storyId: conv.id });
    expect(await ligneDe(apresLAchat)).toMatchObject({ population: "client" });
    expect(await ligneDe(parLEnvoi)).toEqual({ population: "equipe", sansCompte: false, storyId: null });
    expect(await ligneDe(duTournage)).toMatchObject({ population: "tournage" });
    expect(await ligneDe(luePourRien)).toEqual({ population: "prospect", sansCompte: true, storyId: null });
    expect(await ligneDe(capturesDAvant)).toEqual({ population: "prospect", sansCompte: true, storyId: null });
    expect(await ligneDe(sansRien)).toEqual({ population: "inconnu", sansCompte: true, storyId: null });
    await db().delete(schema.imports).where(eq(schema.imports.envoi, envoi));
  });

  it("une lecture jugée sans compte prend la population du compte que sa conv trouve : l’équipe qui essaie l’import sans être connectée", async () => {
    const brouillon = await convImportee("01-a-deux-doigts.txt");
    const lue = await noter({ storyId: brouillon.id, envoi: `envoi-${unique()}` });
    expect(lue).toMatchObject({ population: "prospect", sansCompte: true });
    const equipe = await compteA(`equipe+brouillon-${unique()}@blush.test`);
    expect(await rattacherBrouillon(equipe, brouillon.secret)).toBe(brouillon.id);
    expect(await toutRanger()).toEqual({ couts: 0, achats: 0 });
    expect(await ligneDe(lue.id)).toEqual({ population: "equipe", sansCompte: false, storyId: brouillon.id });
    /* Un compte ordinaire : prospect, son compte trouvé (la ligne ne se relit plus) */
    const autre = await convImportee("02-reciproque.txt");
    const lueAussi = await noter({ storyId: autre.id, envoi: `envoi-${unique()}` });
    const u = await compteDeTest("population-brouillon");
    await rattacherBrouillon(u, autre.secret);
    expect(await toutRanger()).toEqual({ couts: 0, achats: 0 });
    expect(await ligneDe(lueAussi.id)).toEqual({ population: "prospect", sansCompte: false, storyId: autre.id });
  });

  it("une lecture écrite sans population pendant une mise en ligne, avant son import, se reprend quand l’import la relie : jamais « inconnu » pour de bon", async () => {
    const envoi = `envoi-${unique()}`;
    const lue = await ligneDAvant({ envoi });
    expect(await toutRanger()).toEqual({ couts: 0, achats: 0 });
    expect(await ligneDe(lue)).toEqual({ population: "prospect", sansCompte: true, storyId: null });
    /* L’import arrive ensuite, sur une conv de l’équipe */
    const equipe = await compteA(`equipe+mise-en-ligne-${unique()}@blush.test`);
    const conv = await convRattachee(equipe, "02-reciproque.txt");
    await db().insert(schema.imports).values({ storyId: conv.id, envoi, type: "captures", appli: "whatsapp", ecrans: 1, lots: 1 });
    try {
      expect(await toutRanger()).toEqual({ couts: 0, achats: 0 });
      expect(await ligneDe(lue)).toEqual({ population: "equipe", sansCompte: false, storyId: null });
    } finally {
      await db().delete(schema.imports).where(eq(schema.imports.envoi, envoi));
    }
  });

  it("range les achats payés d’avant la règle à l’heure de leur paiement ; celui d’un compte effacé depuis, en client", async () => {
    const u = await compteDeTest("population-achats");
    const equipe = await compteA(`equipe+achats-${unique()}@blush.test`);
    const valeurs = { offre: "rapport" as const, centimes: 990, bulles: 3, fournisseur: "factice" as const, statut: "paye" as const, payeLe: new Date() };
    const ids = await db()
      .insert(schema.achats)
      .values([
        { ...valeurs, userId: u.id },
        { ...valeurs, userId: equipe.id },
        { ...valeurs, userId: null },
      ])
      .returning({ id: schema.achats.id });
    achatsOrphelins.push(ids[2]!.id);
    expect((await toutRanger()).achats).toBe(0);
    expect(await Promise.all(ids.map((a) => populationDeLAchat(a.id)))).toEqual(["client", "equipe", "client"]);
  });
});

describe("le tableau de bord : l’IA du produit et celle des tests à part, la marge produit, des ratios sur la même population", () => {
  it("le produit (un client) et les tests (l’équipe, le tournage) ; les ventes des vrais clients seulement ; un verdict des tests ne bouge pas le coût par verdict", async () => {
    const avant = await statsAdmin(7);
    const client = await compteDeTest("population-stats-client");
    const convClient = await convRattachee(client, "01-a-deux-doigts.txt");
    const equipe = await compteA(`equipe+stats-${unique()}@blush.test`);
    const convEquipe = await convRattachee(equipe, "02-reciproque.txt");
    /*
     * Les achats : 9,90 € puis 6,90 € d’un client (qui devient racheteur), 14,90 € puis 6,90 € d’essai payés par l’équipe
     * (jamais racheteuse : ses achats sont retirés) ; les bulles livrées avec le premier de chacun
     */
    const duClient = await achatPaye(client.id, { storyId: convClient.id, centimes: 990 });
    const deLEquipe = await achatPaye(equipe.id, { storyId: convEquipe.id, centimes: 1490 });
    await achatPaye(client.id, { centimes: 690 });
    await achatPaye(equipe.id, { centimes: 690 });
    await db()
      .insert(schema.mouvementsBulles)
      .values([
        { userId: client.id, delta: 3, raison: "achat", ref: duClient },
        { userId: equipe.id, delta: 3, raison: "achat", ref: deLEquipe },
      ]);
    /*
     * Ce qui n’a aucune population figée se juge par son compte (comptesDesTests) : une conv jamais lue et une commande
     * jamais payée de l’équipe sortent ; une conv jamais lue du client compte
     */
    await convRattachee(equipe, "01-a-deux-doigts.txt");
    await convRattachee(client, "02-reciproque.txt");
    await db().insert(schema.achats).values({ userId: equipe.id, offre: "rapport", centimes: 990, bulles: 3, fournisseur: "factice", statut: "en_attente", creeLe: new Date() });
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
    /*
     * Les ventes, toutes celles des vrais clients (sans les essais de l’équipe, dits à côté) : le net, le payé, les
     * acheteurs, ce qui se vend, les sources, les ventes et les bulles vendues de la semaine, l’entonnoir des commandes
     */
    const mix = (s: typeof avant) => s.pilotage.mix.reduce((t, g) => t + g.centimes, 0);
    const sources = (s: typeof avant) => s.pilotage.sources.reduce((t, x) => t + x.centimes, 0);
    expect([d((s) => s.pilotage.net.valeur), d((s) => s.pilotage.centimesPayes.valeur), d((s) => s.pilotage.acheteurs.valeur), d(mix), d(sources)]).toEqual([
      1680, 1680, 1, 1680, 1680,
    ]);
    expect([d((s) => s.pilotage.achatsRetires.n), d((s) => s.pilotage.achatsRetires.centimes), d((s) => s.ventes.semaine.payes.centimes)]).toEqual([2, 2180, 1680]);
    expect([d((s) => s.bulles.semaine.vendues), d((s) => s.achats.payees), d((s) => s.achats.commandes), d((s) => s.achats.enAttente)]).toEqual([3, 2, 2, 0]);
    /*
     * Le tunnel et « Qui importe » : les deux convs du client (lue, et jamais lue), aucune de l’équipe (lue, et jamais
     * lue) ; le client racheteur, pas l’équipe
     */
    const t = (s: typeof avant) => s.pilotage.tunnel;
    expect([d((s) => t(s).imports), d((s) => t(s).acheteurs), d((s) => t(s).racheteurs)]).toEqual([2, 1, 1]);
    expect([d((s) => s.pilotage.quiImporte.importees.convs), d((s) => s.pilotage.quiImporte.payees.convs)]).toEqual([2, 1]);
    /* Case par case aussi (la dernière, aujourd’hui) : le payé des vrais clients et l’IA du produit, la marge produit en sort */
    const derniereCase = (s: typeof avant) => s.pilotage.cases.at(-1)!;
    expect([d((s) => derniereCase(s).centimes), d((s) => derniereCase(s).acheteurs), d((s) => derniereCase(s).dollarsProduit), d((s) => derniereCase(s).dollars)]).toEqual([
      1680, 1, 2, 7,
    ]);
    /* Un verdict du client et son coût : le coût par verdict du produit le compte, en haut et en bas */
    expect(apres.couts.parVerdict).not.toBeNull();
    if (avant.couts.parVerdict === null) expect(apres.couts.parVerdict).toBeCloseTo(1.5, 6);
  });

  it("la somme des populations fait le total, sur la période et celle d’avant ; l’IA du produit d’une case ne dépasse jamais la case", async () => {
    await noter({}, { dollars: 0.25 });
    for (const jours of [1, 7, 30] as const) {
      const s = await statsAdmin(jours);
      const somme = s.couts.populations.reduce((t, x) => t + x.dollars, 0);
      expect(somme).toBeCloseTo(s.couts.total, 6);
      const de = (p: Population) => s.couts.populations.find((x) => x.population === p)!.dollars;
      expect(s.couts.produit.valeur + s.couts.tests.valeur + de("offert") + de("inconnu")).toBeCloseTo(s.couts.total, 6);
      expect(s.couts.produit.valeur).toBeCloseTo(de("client") + de("prospect"), 6);
      for (const c of s.pilotage.cases) {
        expect(c.dollarsProduit).toBeLessThanOrEqual(c.dollars + 1e-9);
      }
    }
  });

  it("l’achat d’essai d’un alias de l’équipe, son compte effacé ensuite, reste hors du chiffre d’affaires des vrais clients", async () => {
    const avant = await statsAdmin(7);
    const equipe = await compteA(`equipe+efface-${unique()}@blush.test`);
    const achat = await achatPaye(equipe.id, { centimes: 1490 });
    /* Avant l’effacement (le compte a encore son achat) : ni dans les ventes, ni dans les acheteurs */
    const pendant = await statsAdmin(7);
    expect([pendant.pilotage.net.valeur - avant.pilotage.net.valeur, pendant.pilotage.acheteurs.valeur - avant.pilotage.acheteurs.valeur]).toEqual([0, 0]);
    await supprimerCompte(equipe);
    achatsOrphelins.push(achat);
    const apres = await statsAdmin(7);
    expect(await populationDeLAchat(achat)).toBe("equipe");
    expect(apres.pilotage.net.valeur - avant.pilotage.net.valeur).toBe(0);
    expect(apres.pilotage.acheteurs.valeur - avant.pilotage.acheteurs.valeur).toBe(0);
    expect(apres.pilotage.achatsRetires.centimes - avant.pilotage.achatsRetires.centimes).toBe(1490);
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

  it("aucune requête du tableau de bord ni du rattrapage ne passe le seuil de la compilation JIT, même sur des tables pleines (l’incident du 15 octobre)", async () => {
    /*
     * Des tables pleines, loin de toute période (il y a 100 jours) : 3 000 convs d’un compte, leurs verdicts, la moitié en
     * rapports, deux appels chacune, autant d’achats ; et 1 200 lignes à ranger. La règle rejugée ligne par ligne passait
     * le seuil sur 2 400 lignes ; le coût estimé de chaque requête doit rester loin dessous, quelle que soit la période, et
     * aussi quand les tables sont pleines dans la période (plus bas)
     */
    const SEUIL_DU_JIT = 100_000;
    const u = await compteDeTest("population-jit");
    const loin = sql`now() - interval '100 days'`;
    const convs = (
      await db().execute<{ id: string }>(
        sql`insert into stories (user_id, message_count, meta, created_at) select ${u.id}, 1, '\\x00'::bytea, ${loin} from generate_series(1, 3000) returning id`,
      )
    ).rows.map((r) => r.id);
    const ids = sql`(select id from stories where user_id = ${u.id})`;
    await db().execute(sql`insert into verdicts (story_id, data, created_at) select id, '\\x00'::bytea, ${loin} from stories where id in ${ids}`);
    await db().execute(sql`insert into reports (story_id, data, updated_at) select id, '\\x00'::bytea, ${loin} from stories where id in ${ids} and random() < 0.5`);
    await db().execute(
      sql`insert into ai_usage (story_id, task, model, cost_micros, population, created_at) select id, t, 'test', 1000, 'client', ${loin} from stories, unnest(array['verdict', 'rapport_plan']) t where id in ${ids}`,
    );
    await db().execute(
      sql`insert into achats (user_id, offre, centimes, bulles, fournisseur, statut, paye_le, cree_le) select ${u.id}, 'rapport', 990, 3, 'factice', 'paye', ${loin}, ${loin} from generate_series(1, 3000)`,
    );
    await db().execute(sql`insert into ai_usage (task, model, cost_micros, created_at) select ${ETIQUETTE}, 'test', 1000, ${loin} from generate_series(1, 1200)`);
    await db().execute(sql`analyze stories, verdicts, reports, ai_usage, achats`);

    const base = db();
    const execute = base.execute.bind(base);
    const prises: SQL[] = [];
    const espion = vi.spyOn(base, "execute").mockImplementation(((q: SQL) => {
      prises.push(q);
      return execute(q);
    }) as typeof base.execute);
    try {
      for (const jours of [1, 7, 30] as const) await statsAdmin(jours);
      await rangerLesCouts();
    } finally {
      espion.mockRestore();
    }
    const couts: { cout: number; debut: string; periode: boolean }[] = [];
    const estimer = async (q: SQL, ex: (q: SQL) => Promise<{ rows: unknown[] }>, periode: boolean) => {
      const [plan] = (await ex(sql`explain (format json) ${q}`)).rows as { "QUERY PLAN": [{ Plan: { "Total Cost": number } }] }[];
      couts.push({ cout: Math.round(plan!["QUERY PLAN"][0].Plan["Total Cost"]), debut: new PgDialect().sqlToQuery(q).sql.replace(/\s+/g, " ").slice(0, 100), periode });
    };
    for (const q of prises) await estimer(q, execute, false);
    /*
     * Puis les mêmes requêtes avec des tables pleines dans la période (il y a un jour : des convs jamais lues, des
     * lectures, des achats et leurs bulles, et autant d’achats qui débloquent ces convs, chacune avec la tâche de son
     * verdict), dans une transaction annulée : les autres fichiers, qui comptent leurs écarts
     * en même temps, n’en voient rien. Les statistiques des colonnes (pg_statistic) reviennent avec elle ; les tailles des
     * tables (pg_class), réécrites sur place, restent, sans rien changer aux résultats. Des comptes aussi (10 000), pour
     * l’ensemble des comptes des tests : un passage sur users, l’email canonique une fois par compte
     */
    await db()
      .transaction(async (tx) => {
        const pres = sql`now() - interval '1 day'`;
        await tx.execute(sql`insert into users (email) select 'jit-' || g || '-' || ${u.id}::text || '@blush.test' from generate_series(1, 10000) g`);
        await tx.execute(sql`insert into stories (user_id, message_count, meta, created_at) select ${u.id}, 1, '\\x00'::bytea, ${pres} from generate_series(1, 3000)`);
        const recentes = sql`(select id from stories where user_id = ${u.id} and created_at > now() - interval '2 days')`;
        await tx.execute(
          sql`insert into ai_usage (story_id, task, model, cost_micros, population, created_at) select id, 'verdict', 'test', 1000, 'client', ${pres} from stories where id in ${recentes} and random() < 0.5`,
        );
        await tx.execute(
          sql`insert into achats (user_id, offre, centimes, bulles, fournisseur, statut, paye_le, cree_le, population) select ${u.id}, 'rapport', 990, 3, 'factice', 'paye', ${pres}, ${pres}, 'client' from generate_series(1, 3000)`,
        );
        /* Et autant qui débloquent ces convs, arrivées au paywall (la tâche du verdict) : « Par longueur » les lit une à une */
        await tx.execute(
          sql`insert into achats (user_id, story_id, offre, centimes, bulles, fournisseur, statut, paye_le, cree_le, population) select ${u.id}, id, 'premium', 1990, 25, 'factice', 'paye', ${pres}, ${pres}, 'client' from stories where id in ${recentes}`,
        );
        await tx.execute(sql`insert into tasks (story_id, kind, status, created_at) select id, 'verdict', 'paiement', ${pres} from stories where id in ${recentes}`);
        /*
         * Et les imports des convs d’il y a 100 jours, la table pleine et ses statistiques prises : « Par longueur » les
         * cherche achat par achat. Sans eux, le plan dépendait de ce que l’autovacuum avait déjà vu d’imports (une base
         * neuve, celle de la CI, n’en a aucune statistique)
         */
        await tx.execute(
          sql`insert into imports (story_id, envoi, type, appli, cree_le) select id, 'jit-' || id::text, 'video', 'whatsapp', ${loin} from stories where id in ${ids} and created_at < now() - interval '2 days'`,
        );
        /*
         * Et ceux des convs d’hier, dans la période, avec le plan de leur vidéo : « L’IA avant l’achat » et la lecture
         * partielle cherchaient l’achat de chacun (un `exists` lié, rejoué import par import) et passaient le seuil dès
         * 3 000 imports récents ; datés d’il y a 100 jours, ils n’entraient dans aucune période et ne le montraient pas
         */
        await tx.execute(
          sql`insert into imports (story_id, envoi, type, appli, cree_le) select id, 'jit-' || id::text, 'video', 'whatsapp', ${pres} from stories where id in ${recentes}`,
        );
        await tx.execute(
          sql`insert into plans_video (envoi, video, bras, cree_le) select envoi, 'jit-video-' || envoi, case when random() < 0.5 then 'entiere' else 'partielle' end, ${pres} from imports where story_id in ${recentes}`,
        );
        await tx.execute(
          sql`insert into mouvements_bulles (user_id, delta, raison, ref, cree_le) select ${u.id}, 3, 'achat', id::text, ${pres} from achats where user_id = ${u.id} and paye_le > now() - interval '2 days'`,
        );
        await tx.execute(sql`analyze users, stories, ai_usage, achats, tasks, mouvements_bulles, imports, plans_video`);
        for (const q of prises) await estimer(q, (x) => tx.execute(x), true);
        tx.rollback();
      })
      .catch((e: unknown) => {
        if (!(e instanceof TransactionRollbackError)) throw e;
      });
    try {
      expect(prises.length).toBeGreaterThan(40);
      expect(couts.filter((c) => c.periode)).toHaveLength(prises.length);
      expect(couts.filter((c) => c.cout >= SEUIL_DU_JIT)).toEqual([]);
    } finally {
      await db().delete(schema.achats).where(eq(schema.achats.userId, u.id));
      /* Les lectures de ces convs d’abord : effacées avec elles, elles resteraient sans conv, 6 000 de plus à chaque lancement */
      await db().delete(schema.aiUsage).where(inArray(schema.aiUsage.storyId, convs));
      await db().delete(schema.stories).where(inArray(schema.stories.id, convs));
      await db().delete(schema.aiUsage).where(eq(schema.aiUsage.task, ETIQUETTE));
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
  /** La ligne des appels de ce fichier (ETIQUETTE) : ce qu’ils ont coûté sur 24 h, et la part du produit ; 0 si elle manque. */
  const deLEtiquette = (texte: string) => {
    const l = texte.match(new RegExp(`  ${ETIQUETTE} : ([\\d.]+) \\$ \\(\\d+ appels?\\), dont ([\\d.]+) \\$ pour le produit`));
    return { total: Number(l?.[1] ?? 0), produit: Number(l?.[2] ?? 0) };
  };

  it("sépare l’IA du produit et celle des tests, comme /admin, et dit la part du produit de chaque étiquette", async () => {
    const avant = deLEtiquette(await resume());
    const client = await compteDeTest("population-veille");
    await achatPaye(client.id);
    await noter({ compte: { id: client.id } }, { dollars: 1.25 });
    await noter({ compte: { id: (await compteA(`equipe+veille-${unique()}@blush.test`)).id } }, { dollars: 2 });
    const texte = await resume();
    const apres = deLEtiquette(texte);
    /* Les appels de ce fichier seulement : d’autres fichiers notent les leurs en même temps, sur les mêmes 24 h */
    expect([Math.round((apres.total - avant.total) * 100) / 100, Math.round((apres.produit - avant.produit) * 100) / 100]).toEqual([3.25, 1.25]);
    expect(texte).toMatch(/\n {2}IA du produit \(les clients et les prospects\) : [\d.]+ \$\n {2}IA des tests \(l’équipe et le tournage\) : [\d.]+ \$\n/);
    expect(texte).toMatch(/BLUSH · la veille : \d+ imports?, [\d.]+ \$ d’IA \([\d.]+ \$ pour le produit\)/);
  });
});
