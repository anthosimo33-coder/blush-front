import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executerChaine, type DonneesMemoire, type DonneesRapport } from "@/server/analyse";
import { historique, repondre } from "@/server/chat";
import { chiffrer, dechiffrer, dechiffrerOctets } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { definirQui, depuisFichier, ErreurImport, importer as importerLu, metaDe, rattacherBrouillon, storyAffichee } from "@/server/histoires";
import { definirFactice } from "@/server/ia/claude";
import { planifier } from "@/server/taches";
import { fournisseurFactice } from "@/server/ia/factice";
import { audioDuCompte, noterEcoute, statsVocal, vocalAJour, vocalPret, type DonneesVocal } from "@/server/vocal";

const conv = (f: string) => new File([readFileSync(`prompts/evals/convs/${f}`)], f, { type: "text/plain" });
const importer = async (f: File) => importerLu(await depuisFichier(f));
const email = `test-${Date.now()}@blush.test`;

beforeAll(() => definirFactice(fournisseurFactice));
afterAll(async () => {
  await db().delete(schema.users).where(eq(schema.users.email, email));
  definirFactice(null);
});

describe("import", () => {
  it("refuse une conv de groupe et une conv trop courte", async () => {
    await expect(importer(conv("90-groupe.txt"))).rejects.toMatchObject({ code: "groupe" } satisfies Partial<ErreurImport>);
    await expect(importer(conv("91-trop-courte.txt"))).rejects.toMatchObject({ code: "courte" });
  });
});

describe("de l’import à la mémoire", () => {
  it("enchaîne verdict, plan, chapitres et mémoire, puis efface la conv", async () => {
    const { id, meta, secret } = await importer(conv("01-a-deux-doigts.txt"));
    expect(meta.participants).toHaveLength(2);
    expect(storyAffichee(id, meta).totalMessages).toBeGreaterThan(50);
    /* La conv est chiffrée en base */
    const [brute] = await db().select().from(schema.stories).where(eq(schema.stories.id, id));
    expect(brute.conv!.toString("utf8")).not.toContain(meta.participants[0].nom);

    const [u] = await db().insert(schema.users).values({ email, plan: "blushplus" }).returning();
    await rattacherBrouillon(u, secret);
    const moi = meta.participants.findIndex((p) => p.prenom === "Hugo") as 0 | 1;
    await definirQui(id, { moi, pronom: "il", devinette: "vus", objectif: "ensemble" });
    await planifier(id, "verdict");
    await executerChaine(id);

    /* Triées par création : sans tri, Postgres les rend dans l’ordre où elles ont été mises à jour */
    const taches = await db().select().from(schema.tasks).where(eq(schema.tasks.storyId, id)).orderBy(schema.tasks.createdAt);
    expect(taches.map((t) => [t.kind, t.status])).toEqual([
      ["verdict", "fini"],
      ["rapport_plan", "fini"],
      ["rapport_chapitres", "fini"],
      ["vocal", "fini"],
      ["memoire", "fini"],
    ]);
    const [r] = await db().select().from(schema.reports).where(eq(schema.reports.storyId, id));
    const rapport = dechiffrer<DonneesRapport>(r.data!);
    expect(rapport.chapitres).toHaveLength(8);
    expect(rapport.chapitres[0].title).toBe("Le verdict");
    expect(rapport.chapitres[0].blocks.some((b) => b.kind === "scores")).toBe(true);
    /* Les preuves deviennent des messages datés */
    const recit = rapport.chapitres[1].blocks.find((b) => b.kind === "story");
    expect(recit && "messages" in recit && recit.messages?.[0]?.caption).toMatch(/· \d{2}\/\d{2}/);

    /* Le vocal, fait pendant les chapitres : le script minuté et l’audio, chiffrés, la voix de l’A/B test en clair */
    const vocal = await vocalPret(id);
    expect(vocal?.voix).toBe("A");
    expect(vocal?.lignes.length).toBeGreaterThan(2);
    expect(vocal?.lignes.some((l) => l.punch)).toBe(true);
    expect(vocal?.lignes.some((l) => l.recu?.caption)).toBe(true);
    expect(vocal?.lignes.every((l, k, ls) => l.debut <= l.fin && (k === 0 || ls[k - 1].debut <= l.debut))).toBe(true);
    const audio = (await audioDuCompte(u.id, id))?.audio;
    expect(audio?.subarray(0, 2).toString("hex")).toBe("fffb");
    const [brut] = await db().select().from(schema.vocals).where(eq(schema.vocals.storyId, id));
    expect(brut.data.toString("utf8")).not.toContain("Lis la suite");
    /* L’A/B test : l’écoute est notée sans contenu, et les chiffres sortent par voix */
    await noterEcoute(id, "debut", 0);
    await noterEcoute(id, "fin", brut.dureeMs);
    const stats = (await statsVocal()).find((s) => s.voix === "A");
    expect(stats?.ecoutes).toBeGreaterThanOrEqual(1);
    expect(stats?.finis).toBeGreaterThanOrEqual(1);

    const [m] = await db().select().from(schema.memories).where(eq(schema.memories.storyId, id));
    const memoire = dechiffrer<DonneesMemoire>(m.data);
    expect(memoire.etat.questions).toHaveLength(4);
    expect(memoire.lignes.length).toBeGreaterThan(0);

    const [fin] = await db().select().from(schema.stories).where(eq(schema.stories.id, id));
    expect(fin.conv).toBeNull();
    expect(fin.convPurgedAt).not.toBeNull();
    expect(metaDe(fin).moi).toBe(moi);

    /* Une nouvelle version du script : le vocal se refait (la conv effacée, sur le rapport et la mémoire), à une nouvelle adresse */
    const ancien = dechiffrer<DonneesVocal>(brut.data);
    await db().update(schema.vocals).set({ data: chiffrer({ ...ancien, version: 1 }) }).where(eq(schema.vocals.storyId, id));
    expect(await vocalAJour(id)).toBe(false);
    await planifier(id, "vocal");
    await executerChaine(id);
    expect(await vocalAJour(id)).toBe(true);
    expect((await vocalPret(id))?.audio).not.toBe(vocal?.audio);

    /* Le chat, sur la mémoire : des bulles avec leurs preuves, l’échange gardé, la mémoire mise à jour s’il y a du neuf */
    const { reponse, majMemoire } = await repondre(fin, memoire, "on s’est vus hier, c’était trop bien");
    expect(reponse.kind).toBe("bubbles");
    expect(reponse.kind === "bubbles" && reponse.bubbles[0].messages?.length).toBe(1);
    expect(majMemoire).toBe(true);
    expect((await historique(id)).echanges).toHaveLength(1);
    /* La réponse porte son échange (pour la partager en image), le même que dans l’historique */
    expect(reponse.echange).toBe((await historique(id)).echanges[0].id);
    await executerChaine(id);
    const [maj] = await db().select().from(schema.tasks).where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "memoire_maj")));
    expect(maj.status).toBe("fini");

    /* Le chat en vocal : il envoie un vocal, elle répond en vocal (l’audio chiffré, à son adresse), sans changer de mode */
    const relire = async () => (await db().select().from(schema.stories).where(eq(schema.stories.id, id)))[0];
    const parVocal = await repondre(await relire(), memoire, "(vocal) elle m’a écrit tard hier", undefined, { parVocal: true });
    expect(parVocal.reponse.vocal?.audio).toMatch(/^\/api\/vocal\/chat\/\d+$/);
    expect(parVocal.reponse.vocal?.peaks).toHaveLength(28);
    expect(parVocal.reponse.modeVocal).toBe(false);
    const [audioChat] = await db().select().from(schema.chatVocals).where(eq(schema.chatVocals.storyId, id));
    expect(dechiffrerOctets(audioChat.audio).subarray(0, 2).toString("hex")).toBe("fffb");
    /* Il demande qu’elle lui parle en vocal : elle confirme en vocal, et la suite reste en vocal, même quand il écrit */
    const active = await repondre(await relire(), memoire, "parle-moi en vocal stp");
    expect(active.reponse.modeVocal).toBe(true);
    expect(active.reponse.vocal).toBeDefined();
    expect((await relire()).chatVocal).toBe(true);
    const suite = await repondre(await relire(), memoire, "et là je lui dis quoi ?");
    expect(suite.reponse.vocal).toBeDefined();
    /* « Repasser à l’écrit », le bouton (sans nouvelle réponse) : l’historique dit le mode de la base, pas celui de la dernière réponse */
    expect((await historique(id)).modeVocal).toBe(true);
    await db().update(schema.stories).set({ chatVocal: false }).where(eq(schema.stories.id, id));
    const apresBouton = await historique(id);
    expect(apresBouton.echanges.at(-1)?.answer.modeVocal).toBe(true);
    expect(apresBouton.modeVocal).toBe(false);
    await db().update(schema.stories).set({ chatVocal: true }).where(eq(schema.stories.id, id));
    /* Il repasse à l’écrit : la réponse est écrite */
    const stop = await repondre(await relire(), memoire, "écris-moi stp");
    expect(stop.reponse.modeVocal).toBe(false);
    expect(stop.reponse.vocal).toBeUndefined();
    expect((await relire()).chatVocal).toBe(false);
    /* L’historique garde les vocaux (pour les réécouter) */
    expect((await historique(id)).echanges.filter((p) => p.answer.vocal).length).toBe(3);
  });
});

describe("purge", () => {
  it("efface les brouillons de plus de 24 h", async () => {
    const { purger } = await import("@/server/purge");
    const { id } = await importer(conv("02-reciproque.txt"));
    await db().update(schema.stories).set({ createdAt: new Date(Date.now() - 2 * 86400e3) }).where(eq(schema.stories.id, id));
    const r = await purger();
    expect(r.brouillons).toBeGreaterThanOrEqual(1);
    expect(await db().select().from(schema.stories).where(eq(schema.stories.id, id))).toHaveLength(0);
  });
});
