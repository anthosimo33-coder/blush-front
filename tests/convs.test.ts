import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executerChaine } from "@/server/analyse";
import type { Utilisateur } from "@/server/auth";
import { chiffrer } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { convsDe } from "@/server/donnees";
import { brouillonALaConnexion, definirQui, depuisFichier, histoireOuverte, histoiresDuCompte, importer as importerLu, metaDe, quiRempli, rattacherBrouillon, type Ligne } from "@/server/histoires";
import { definirFactice } from "@/server/ia/claude";
import { fournisseurFactice } from "@/server/ia/factice";
import { purger } from "@/server/purge";
import { planifier } from "@/server/taches";
import { jourRelatif } from "@/server/temps";

const conv = (f: string) => new File([readFileSync(`prompts/evals/convs/${f}`)], f, { type: "text/plain" });
const importer = async (f: string) => importerLu(await depuisFichier(conv(f)));
const ligne = async (id: string) => (await db().select().from(schema.stories).where(eq(schema.stories.id, id)))[0] as Ligne;
const jours = (n: number) => new Date(Date.now() - n * 86400e3);

const emails = [`convs-${Date.now()}@blush.test`, `convs-autre-${Date.now()}@blush.test`];

/** Une conv importée, rattachée au compte, puis lue (le verdict seul : le compte est gratuit). */
async function lue(u: Utilisateur, f: string): Promise<string> {
  const imp = await importer(f);
  await rattacherBrouillon(u, imp.secret);
  await definirQui(imp.id, { moi: 0, pronom: "il", devinette: "vus", objectif: "ensemble" });
  await planifier(imp.id, "verdict");
  await executerChaine(imp.id);
  return imp.id;
}

describe("plusieurs convs par compte", () => {
  let u: Utilisateur;
  let premiere: string;
  let seconde: string;
  /** Rattachée au compte (connexion), mais jamais lue : on s’est arrêté avant « Qui es-tu ? ». */
  let jamaisLue: string;
  /** Celle d’un autre compte. */
  let ailleurs: string;

  beforeAll(async () => {
    definirFactice(fournisseurFactice);
    const [a, b] = await db()
      .insert(schema.users)
      .values(emails.map((email) => ({ email })))
      .returning();
    u = a;
    premiere = await lue(u, "01-a-deux-doigts.txt");
    seconde = await lue(u, "02-reciproque.txt");
    const imp = await importer("03-elle-s-eloigne.txt");
    jamaisLue = (await rattacherBrouillon(u, imp.secret))!;
    ailleurs = await lue(b, "04-ghosting.txt");
  });
  afterAll(async () => {
    await db().delete(schema.users).where(inArray(schema.users.email, emails));
    definirFactice(null);
  });

  it("ouvre celle choisie dans la liste si elle est au compte, sinon la plus récente déjà lue", async () => {
    expect(jamaisLue).toBeTruthy();
    expect((await histoireOuverte(u, {}))!.id).toBe(seconde);
    expect((await histoireOuverte(u, { choisie: premiere }))!.id).toBe(premiere);
    /* La conv d’un autre compte, ou un identifiant mal formé : ignorés */
    expect((await histoireOuverte(u, { choisie: ailleurs }))!.id).toBe(seconde);
    expect((await histoireOuverte(u, { choisie: "../../etc" }))!.id).toBe(seconde);
  });

  it("le parcours d’import suit d’abord la conv en train d’être importée, le reste garde celle qu’on suit", async () => {
    const imp = await importer("05-insiste-apres-un-non.txt");
    expect((await histoireOuverte(u, { brouillon: imp.secret, choisie: premiere }, { parcours: true }))!.id).toBe(imp.id);
    expect((await histoireOuverte(u, { brouillon: imp.secret, choisie: premiere }))!.id).toBe(premiere);
    /* Sans compte : le brouillon, partout */
    expect((await histoireOuverte(null, { brouillon: imp.secret }))!.id).toBe(imp.id);
    /* Rattaché (la lecture part), il devient une conv du compte comme les autres */
    expect(await rattacherBrouillon(u, imp.secret)).toBe(imp.id);
    expect(await histoireOuverte(u, { brouillon: imp.secret }, { parcours: true })).not.toBeNull();
    await db().delete(schema.stories).where(eq(schema.stories.id, imp.id));
  });

  it("« Tes convs » : les convs lues, la plus active d’abord, avec leur verdict", async () => {
    expect((await histoiresDuCompte(u.id)).map((l) => l.id)).toEqual([seconde, premiere]);
    /* BLUSH a parlé de la première après l’arrivée de la seconde : elle remonte */
    await db().insert(schema.chatMessages).values({ storyId: premiere, role: "blush", data: chiffrer({ texte: "…" }) });
    const convs = await convsDe(u, await ligne(premiere));
    expect(convs.map((c) => c.storyId)).toEqual([premiere, seconde]);
    expect(convs.map((c) => c.current)).toEqual([true, false]);
    for (const c of convs) {
      expect(c.verdict?.emoji).toMatch(/🤏|🔥|🤔|🧊/u);
      expect(c.person.name.length).toBeGreaterThan(0);
      expect(c.lastLabel).toBe("aujourd’hui");
    }
  });

  it("la purge efface une conv rattachée mais jamais lue, après 24 h, et garde celles qui ont été lues", async () => {
    await db()
      .update(schema.stories)
      .set({ createdAt: jours(2) })
      .where(inArray(schema.stories.id, [premiere, jamaisLue]));
    await purger();
    const restent = (await db().select({ id: schema.stories.id }).from(schema.stories).where(eq(schema.stories.userId, u.id))).map((l) => l.id);
    expect(restent.sort()).toEqual([premiere, seconde].sort());
  });
});

/* Le 8 octobre en prod : une conv importée puis laissée avant « Qui es-tu ? », une connexion, et une lecture qui échouait en boucle */
describe("se connecter avec une conv laissée avant « Qui es-tu ? »", () => {
  const comptes = [`connexion-suivi-${Date.now()}@blush.test`, `connexion-neuf-${Date.now()}@blush.test`];
  /** Suit déjà une conv lue. */
  let suivi: Utilisateur;
  /** N’en a encore lu aucune. */
  let neuf: Utilisateur;
  let suivie: string;

  beforeAll(async () => {
    definirFactice(fournisseurFactice);
    [suivi, neuf] = await db()
      .insert(schema.users)
      .values(comptes.map((email) => ({ email })))
      .returning();
    suivie = await lue(suivi, "01-a-deux-doigts.txt");
  });
  afterAll(async () => {
    await db().delete(schema.users).where(inArray(schema.users.email, comptes));
    definirFactice(null);
  });

  it("un compte qui suit déjà une conv la garde : le brouillon reste un brouillon, que l’import retrouve", async () => {
    const imp = await importer("03-elle-s-eloigne.txt");
    expect(await brouillonALaConnexion(suivi, imp.secret)).toBeNull();
    expect((await ligne(imp.id)).userId).toBeNull();
    /* L’accueil, le rapport, l’écran de lecture : la conv lue, déjà passée par « Qui es-tu ? » */
    const ouverte = (await histoireOuverte(suivi, { brouillon: imp.secret }))!;
    expect(ouverte.id).toBe(suivie);
    expect(quiRempli(metaDe(ouverte))).toBe(true);
    /* /qui, et la lecture lancée avec ses réponses : le brouillon, que la lecture rattachera */
    expect((await histoireOuverte(suivi, { brouillon: imp.secret }, { parcours: true }))!.id).toBe(imp.id);
    await db().delete(schema.stories).where(eq(schema.stories.id, imp.id));
  });

  it("un compte sans conv lue reçoit le brouillon, qui s’ouvre en attendant « Qui es-tu ? » (la lecture renvoie à /qui)", async () => {
    const imp = await importer("02-reciproque.txt");
    const rattachee = await brouillonALaConnexion(neuf, imp.secret);
    expect(rattachee).toBe(imp.id);
    expect((await ligne(imp.id)).userId).toBe(neuf.id);
    const ouverte = (await histoireOuverte(neuf, { choisie: rattachee! }))!;
    expect(ouverte.id).toBe(imp.id);
    expect(quiRempli(metaDe(ouverte))).toBe(false);
    /* Des captures : l’utilisateur est « Moi », mais le reste de « Qui es-tu ? » manque encore */
    expect(quiRempli({ ...metaDe(ouverte), moi: 0 })).toBe(false);
    await definirQui(imp.id, { moi: 1, pronom: "elle", devinette: "parle", objectif: "reciproque" });
    expect(quiRempli(metaDe(await ligne(imp.id)))).toBe(true);
  });

  it("sans brouillon, la connexion ne change rien", async () => {
    expect(await brouillonALaConnexion(neuf, undefined)).toBeNull();
  });
});

describe("le jour d’une conv, comme dans Messages", () => {
  /* Jeudi 8 octobre 2026, 14 h à Paris */
  const maintenant = new Date("2026-10-08T12:00:00Z");
  it("dit aujourd’hui, hier, le jour de la semaine, puis la date (heure de Paris)", () => {
    expect(jourRelatif(new Date("2026-10-08T08:00:00Z"), maintenant)).toBe("aujourd’hui");
    /* 0 h 30 à Paris : déjà aujourd’hui, même si c’est encore la veille en UTC */
    expect(jourRelatif(new Date("2026-10-07T22:30:00Z"), maintenant)).toBe("aujourd’hui");
    expect(jourRelatif(new Date("2026-10-07T12:00:00Z"), maintenant)).toBe("hier");
    expect(jourRelatif(new Date("2026-10-05T12:00:00Z"), maintenant)).toBe("lun.");
    expect(jourRelatif(new Date("2026-09-20T12:00:00Z"), maintenant)).toBe("20 sept.");
  });
});
