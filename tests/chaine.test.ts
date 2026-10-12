import { and, desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

/* after() de Next ne vit que dans une requête : ici, ce qui devait partir après la réponse est gardé (reparerLaChaine) */
const apres = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => apres.push(f) }));

import type { Utilisateur } from "@/server/auth";
import { repondre } from "@/server/chat";
import { historique } from "@/server/historique";
import { chiffrer, dechiffrer, dechiffrerOctets } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { memoireDe } from "@/server/donnees";
import { importer, metaDe, type LigneComplete } from "@/server/histoires";
import { depuisFichier, ErreurImport } from "@/server/import";
import { storyAffichee } from "@/server/conv-affichee";
import { FACTICE } from "@/server/ia/factice-valeurs";
import { executerChaine, reparerLaChaine } from "@/server/pipeline";
import type { DonneesVocal } from "@/server/stockage/types";
import { planifier } from "@/server/taches";
import { audioDuCompte, noterEcoute, statsVocal, vocalAJour, vocalLu } from "@/server/vocal";
import { rapportEnBase, tachesDe } from "./aide/essai";
import { convDeTest } from "./aide/fichiers";
import { accordDeTest, compteDeTest, convImportee, histoireLue, ligneEnBase, moiDans, type Importee } from "./aide/fixtures";

/** Le vocal tel que l’affiche le front, s’il est fait (ce que le rapport en montre, par vocalLu). */
const vocalPret = async (storyId: string) => (await vocalLu(storyId))?.pret ?? null;

describe("import", () => {
  it("refuse une conv de groupe et une conv trop courte", async () => {
    await expect(importer(await depuisFichier(convDeTest("90-groupe.txt")), accordDeTest())).rejects.toMatchObject({ code: "groupe" } satisfies Partial<ErreurImport>);
    await expect(importer(await depuisFichier(convDeTest("91-trop-courte.txt")), accordDeTest())).rejects.toMatchObject({ code: "courte" });
  });
});

/*
 * Une conv lue de bout en bout par un compte BLUSH+ (le verdict, le rapport, le vocal, la mémoire), une fois pour tout
 * le describe : chaque test en regarde une étape, et passe seul (it.only) comme dans n’importe quel ordre. Ce que la
 * lecture laisse et que les tests changent ensuite (la conv brute, les tâches) est relevé dans le beforeAll.
 */
describe("de l’import à la mémoire", () => {
  let u: Utilisateur;
  let imp: Importee;
  /** La ligne de l’histoire juste après l’import, conv brute comprise (la lecture l’efface ensuite). */
  let importee: LigneComplete;
  /** Les tâches de la première lecture, dans l’ordre de leur création (tachesDe) : le chat et le vocal en ajoutent ensuite. */
  let taches: (typeof schema.tasks.$inferSelect)[];
  const relire = () => ligneEnBase(imp.id);
  const memoire = async () => (await memoireDe(imp.id))!;

  beforeAll(async () => {
    u = await compteDeTest("chaine", "blushplus");
    imp = await convImportee("01-a-deux-doigts.txt");
    importee = await ligneEnBase(imp.id);
    await histoireLue(u, imp, { qui: { moi: "Hugo" } });
    taches = await tachesDe(imp.id);
  });

  it("l’import : deux participants, plus de 50 messages, et la conv chiffrée en base", () => {
    expect(imp.meta.participants).toHaveLength(2);
    expect(storyAffichee(imp.id, imp.meta).totalMessages).toBeGreaterThan(50);
    expect(importee.conv!.toString("utf8")).not.toContain(imp.meta.participants[0]!.nom);
  });

  it("enchaîne verdict, plan, chapitres, vocal et mémoire", () => {
    expect(taches.map((t) => [t.kind, t.status])).toEqual([
      ["verdict", "fini"],
      ["rapport_plan", "fini"],
      ["rapport_chapitres", "fini"],
      ["vocal", "fini"],
      ["memoire", "fini"],
    ]);
  });

  it("le rapport : ses chapitres (ceux du modèle factice), le verdict d’abord avec ses scores, et des preuves devenues des messages datés", async () => {
    const rapport = (await rapportEnBase(imp.id))!;
    expect(rapport.chapitres).toHaveLength(FACTICE.chapitres);
    expect(rapport.chapitres[0]!.title).toBe("Le verdict");
    expect(rapport.chapitres[0]!.blocks.some((b) => b.kind === "scores")).toBe(true);
    const recit = rapport.chapitres[1]!.blocks.find((b) => b.kind === "story");
    expect(recit && "messages" in recit && recit.messages?.[0]?.caption).toMatch(/· \d{2}\/\d{2}/);
  });

  it("le vocal, fait pendant les chapitres : le script minuté et l’audio chiffrés, la voix de l’A/B test en clair", async () => {
    const vocal = await vocalPret(imp.id);
    expect(vocal?.voix).toBe("A");
    expect(vocal?.lignes.length).toBeGreaterThan(2);
    expect(vocal?.lignes.some((l) => l.punch)).toBe(true);
    expect(vocal?.lignes.some((l) => l.recu?.caption)).toBe(true);
    expect(vocal?.lignes.every((l, k, ls) => l.debut <= l.fin && (k === 0 || ls[k - 1]!.debut <= l.debut))).toBe(true);
    const audio = (await audioDuCompte(u.id, imp.id))?.audio;
    expect(audio?.subarray(0, 2).toString("hex")).toBe("fffb");
    const brut = (await db().select().from(schema.vocals).where(eq(schema.vocals.storyId, imp.id)))[0]!;
    expect(brut.data.toString("utf8")).not.toContain("Lis la suite");
  });

  it("l’A/B test du vocal : l’écoute est notée sans contenu, et les chiffres sortent par voix", async () => {
    const brut = (await db().select().from(schema.vocals).where(eq(schema.vocals.storyId, imp.id)))[0]!;
    await noterEcoute(imp.id, "debut", 0);
    await noterEcoute(imp.id, "fin", brut.dureeMs);
    const stats = (await statsVocal()).find((s) => s.voix === "A");
    expect(stats?.ecoutes).toBeGreaterThanOrEqual(1);
    expect(stats?.finis).toBeGreaterThanOrEqual(1);
  });

  it("la mémoire, puis la conv effacée ; « Qui es-tu ? » reste", async () => {
    const m = await memoire();
    expect(m.etat.questions).toHaveLength(4);
    expect(m.lignes.length).toBeGreaterThan(0);
    const fin = await relire();
    expect(fin.conv).toBeNull();
    expect(fin.convPurgedAt).not.toBeNull();
    expect(metaDe(fin).moi).toBe(moiDans(imp.meta, "Hugo"));
  });

  it("une nouvelle version du script : le vocal se refait (la conv effacée, sur le rapport et la mémoire), à une nouvelle adresse", async () => {
    const avant = await vocalPret(imp.id);
    const brut = (await db().select().from(schema.vocals).where(eq(schema.vocals.storyId, imp.id)))[0]!;
    const ancien = dechiffrer<DonneesVocal>(brut.data);
    await db()
      .update(schema.vocals)
      .set({ data: chiffrer({ ...ancien, version: 1 }) })
      .where(eq(schema.vocals.storyId, imp.id));
    expect(await vocalAJour(imp.id)).toBe(false);
    await planifier(imp.id, "vocal");
    await executerChaine(imp.id);
    expect(await vocalAJour(imp.id)).toBe(true);
    expect((await vocalPret(imp.id))?.audio).not.toBe(avant?.audio);
  });

  it("le chat, sur la mémoire : des bulles avec leurs preuves, l’échange gardé, la mémoire mise à jour s’il y a du neuf", async () => {
    const echanges = (await historique(imp.id)).echanges.length;
    const { reponse, majMemoire } = await repondre(await relire(), await memoire(), "on s’est vus hier, c’était trop bien");
    expect(reponse.kind).toBe("bubbles");
    expect(reponse.kind === "bubbles" && reponse.bubbles[0]!.messages?.length).toBe(1);
    expect(majMemoire).toBe(true);
    const apres = (await historique(imp.id)).echanges;
    expect(apres).toHaveLength(echanges + 1);
    /* La réponse porte son échange (pour la partager en image), le même que dans l’historique */
    expect(reponse.echange).toBe(apres.at(-1)!.id);
    await executerChaine(imp.id);
    const maj = (
      await db()
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.storyId, imp.id), eq(schema.tasks.kind, "memoire_maj")))
        .orderBy(desc(schema.tasks.createdAt))
        .limit(1)
    )[0]!;
    expect(maj.status).toBe("fini");
  });

  it("le chat en vocal : il envoie un vocal, elle répond en vocal (l’audio chiffré, à son adresse), sans changer de mode", async () => {
    const parVocal = await repondre(await relire(), await memoire(), "(vocal) elle m’a écrit tard hier", undefined, { parVocal: true });
    expect(parVocal.reponse.vocal?.audio).toMatch(/^\/api\/vocal\/chat\/\d+$/);
    expect(parVocal.reponse.vocal?.peaks).toHaveLength(28);
    expect(parVocal.reponse.modeVocal).toBe(false);
    const id = Number(parVocal.reponse.vocal!.audio.split("/").at(-1));
    const audioChat = (await db().select().from(schema.chatVocals).where(eq(schema.chatVocals.id, id)))[0]!;
    expect(audioChat.storyId).toBe(imp.id);
    expect(dechiffrerOctets(audioChat.audio).subarray(0, 2).toString("hex")).toBe("fffb");
    expect((await historique(imp.id)).echanges.find((e) => e.id === parVocal.reponse.echange)?.answer.vocal).toBeDefined();
  });

  it("le mode vocal : demandé, la suite reste en vocal, même quand il écrit ; il repasse à l’écrit, l’historique garde les vocaux", async () => {
    const vocaux = async () => (await historique(imp.id)).echanges.filter((p) => p.answer.vocal).length;
    const avant = await vocaux();
    /* Il demande qu’elle lui parle en vocal : elle confirme en vocal, et la suite reste en vocal, même quand il écrit */
    const active = await repondre(await relire(), await memoire(), "parle-moi en vocal stp");
    expect(active.reponse.modeVocal).toBe(true);
    expect(active.reponse.vocal).toBeDefined();
    expect((await relire()).chatVocal).toBe(true);
    const suite = await repondre(await relire(), await memoire(), "et là je lui dis quoi ?");
    expect(suite.reponse.vocal).toBeDefined();
    /* « Repasser à l’écrit », le bouton (sans nouvelle réponse) : l’historique dit le mode de la base, pas celui de la dernière réponse */
    expect((await historique(imp.id)).modeVocal).toBe(true);
    await db().update(schema.stories).set({ chatVocal: false }).where(eq(schema.stories.id, imp.id));
    const apresBouton = await historique(imp.id);
    expect(apresBouton.echanges.at(-1)?.answer.modeVocal).toBe(true);
    expect(apresBouton.modeVocal).toBe(false);
    await db().update(schema.stories).set({ chatVocal: true }).where(eq(schema.stories.id, imp.id));
    /* Il repasse à l’écrit : la réponse est écrite */
    const stop = await repondre(await relire(), await memoire(), "écris-moi stp");
    expect(stop.reponse.modeVocal).toBe(false);
    expect(stop.reponse.vocal).toBeUndefined();
    expect((await relire()).chatVocal).toBe(false);
    /* L’historique garde les vocaux (pour les réécouter) : les deux de ce test, en plus de ceux d’avant */
    expect(await vocaux()).toBe(avant + 2);
  });
});

describe("purge", () => {
  it("efface les brouillons de plus de 24 h", async () => {
    const { purger } = await import("@/server/purge");
    const { id } = await convImportee("02-reciproque.txt");
    await db()
      .update(schema.stories)
      .set({ createdAt: new Date(Date.now() - 2 * 86400e3) })
      .where(eq(schema.stories.id, id));
    const r = await purger();
    expect(r.brouillons).toBeGreaterThanOrEqual(1);
    expect(await db().select().from(schema.stories).where(eq(schema.stories.id, id))).toHaveLength(0);
  });
});

describe("hors de la chaîne (reparerLaChaine)", () => {
  /** Les plans du rapport planifiés pour cette histoire. */
  const plans = (id: string) =>
    db()
      .select({ status: schema.tasks.status })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "rapport_plan")));

  it("l’accès est celui du compte de l’histoire, lu en base : sans lui, le rapport ne part pas ; avec, il part", async () => {
    const u = await compteDeTest("reparer");
    const { id } = await histoireLue(u, "06-elle-hesite.txt");
    /* Un compte gratuit : rien ne part, quoi que croie l’appelant */
    expect(await reparerLaChaine(await ligneEnBase(id))).toBe(false);
    expect(await plans(id)).toEqual([]);
    /* L’accès arrive (le déblocage) : le plan du rapport part, puis la chaîne après la réponse */
    await db().update(schema.users).set({ plan: "blushplus" }).where(eq(schema.users.id, u.id));
    const lances = apres.length;
    expect(await reparerLaChaine(await ligneEnBase(id))).toBe(true);
    expect(await plans(id)).toEqual([{ status: "attente" }]);
    expect(apres).toHaveLength(lances + 1);
    apres.length = 0;
  });
});
