import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* after() de Next ne vit que dans une requête : ici, on garde ce qui devait partir après la réponse, pour le lancer soi-même */
const apres = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => apres.push(f) }));

import { executerChaine, tempsPourCommencer } from "@/server/analyse";
import type { Utilisateur } from "@/server/auth";
import { chiffrerOctets } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { contactDe, rapportDe } from "@/server/donnees";
import { avecEcheance } from "@/server/echeance";
import { historique } from "@/server/historique";
import { definirQui, depuisFichier, histoireOuverte, histoiresDuCompte, importer, rattacherBrouillon } from "@/server/histoires";
import { definirFactice } from "@/server/ia/claude";
import { fournisseurFactice } from "@/server/ia/factice";
import { versionImage } from "@/server/partages";
import { etatDesTaches, planifier } from "@/server/taches";
import { audioDuCompte } from "@/server/vocal";

/* Côté serveur, ce qui garde les écrans rapides : ce que lisent les écrans, la chaîne, l’audio du vocal, l’image story */

const conv = (f: string) => new File([readFileSync(`prompts/evals/convs/${f}`)], f, { type: "text/plain" });
const emails = [`fluidite-${Date.now()}@blush.test`, `fluidite-autre-${Date.now()}@blush.test`];
const lancerApres = async () => {
  while (apres.length) await apres.shift()!();
};

let u: Utilisateur;
let autre: Utilisateur;

beforeAll(async () => {
  definirFactice(fournisseurFactice);
  [u, autre] = await db()
    .insert(schema.users)
    .values(emails.map((email) => ({ email })))
    .returning();
});
/* Leurs convs, et tout ce qui en vient, partent avec les comptes (en cascade) */
afterAll(async () => {
  await db().delete(schema.users).where(inArray(schema.users.email, emails));
  definirFactice(null);
});

/** Une conv importée, rattachée au compte, « Qui es-tu ? » rempli ; sa lecture planifiée (pas lancée). */
async function importee(f: string): Promise<string> {
  const imp = await importer(await depuisFichier(conv(f)));
  await rattacherBrouillon(u, imp.secret);
  await definirQui(imp.id, { moi: 0, pronom: "il", devinette: "vus", objectif: "ensemble" });
  await planifier(imp.id, "verdict");
  return imp.id;
}

describe("ce que lisent les écrans", () => {
  it("n’apporte jamais la conv brute, mais sait si elle est encore là", async () => {
    const id = await importee("02-reciproque.txt");
    const ouverte = (await histoireOuverte(u, { affichee: id }))!;
    expect(ouverte.id).toBe(id);
    expect("conv" in ouverte).toBe(false);
    expect(ouverte.aConv).toBe(true);
    expect((await histoiresDuCompte(u.id)).every((l) => !("conv" in l))).toBe(true);
    await db().update(schema.stories).set({ conv: null }).where(eq(schema.stories.id, id));
    expect((await histoireOuverte(u, { affichee: id }))!.aConv).toBe(false);
  });

  it("lance le rapport quand l’accès est là, depuis la ligne d’un écran (sans la conv)", async () => {
    const id = await importee("06-elle-hesite.txt");
    await executerChaine(id);
    expect(await contactDe(id)).toMatchObject({ level: expect.any(String), nextStep: expect.stringMatching(/^Ton prochain pas\u00a0: /) });
    const plus = { ...u, plan: "blushplus" as const };
    await db().update(schema.users).set({ plan: "blushplus" }).where(eq(schema.users.id, u.id));
    const r = await rapportDe((await histoireOuverte(plus, { affichee: id }))!, plus);
    expect(r?.generating).toBe(true);
    /* Le contact de l’accueil est celui de la tête du rapport */
    expect(await contactDe(id)).toEqual({ verdict: r!.report.verdict, level: r!.report.level, trend: r!.report.trend, nextStep: r!.report.nextStep });
    await lancerApres();
    const { rapport_chapitres, memoire } = await etatDesTaches(id, ["rapport_chapitres", "memoire"]);
    expect([rapport_chapitres?.status, memoire?.status]).toEqual(["fini", "fini"]);
    await db().update(schema.users).set({ plan: "gratuit" }).where(eq(schema.users.id, u.id));
  });

  it("le contact de l’accueil : rien tant que la lecture n’est pas finie", async () => {
    const id = await importee("03-elle-s-eloigne.txt");
    expect(await contactDe(id)).toBeNull();
  });

  it("l’historique reprend le mode vocal donné, sans le relire", async () => {
    const id = await importee("04-ghosting.txt");
    await db().update(schema.stories).set({ chatVocal: true }).where(eq(schema.stories.id, id));
    expect((await historique(id)).modeVocal).toBe(true);
    expect((await historique(id, { modeVocal: false })).modeVocal).toBe(false);
  });
});

describe("la chaîne", () => {
  it("ne commence pas une étape qu’elle n’aurait pas le temps de finir", async () => {
    const id = await importee("01-a-deux-doigts.txt");
    /* Moins que le temps d’un verdict avant l’échéance : il attend le prochain passage */
    await avecEcheance(tempsPourCommencer("verdict") - 5_000, () => executerChaine(id));
    expect((await etatDesTaches(id, ["verdict"])).verdict?.status).toBe("attente");
    /* Le temps qu’il faut : verdict, puis le plan et les chapitres s’enchaînent sans attendre un sondage */
    await db().update(schema.users).set({ plan: "blushplus" }).where(eq(schema.users.id, u.id));
    await executerChaine(id);
    const { verdict, rapport_chapitres } = await etatDesTaches(id, ["verdict", "rapport_chapitres"]);
    expect([verdict?.status, rapport_chapitres?.status]).toEqual(["fini", "fini"]);
    await db().update(schema.users).set({ plan: "gratuit" }).where(eq(schema.users.id, u.id));
  });

  it("donne à chaque étape le temps de finir avant que Vercel coupe la fonction", () => {
    expect(tempsPourCommencer("rapport_chapitres")).toBeGreaterThan(tempsPourCommencer("rapport_plan"));
    expect(tempsPourCommencer("rapport_chapitres")).toBeLessThan(285_000);
  });
});

describe("l’audio du vocal", () => {
  it("n’est lu que par son compte, en une requête, et la seconde ne relit pas l’audio", async () => {
    const id = await importee("02-reciproque.txt");
    await db().update(schema.users).set({ plan: "blushplus" }).where(eq(schema.users.id, u.id));
    await executerChaine(id);
    await db().update(schema.users).set({ plan: "gratuit" }).where(eq(schema.users.id, u.id));
    const premier = await audioDuCompte(u.id, id);
    expect(premier?.audio?.subarray(0, 2).toString("hex")).toBe("fffb");
    expect(await audioDuCompte(autre.id, id)).toBeNull();
    expect(await audioDuCompte(u.id, "../../etc")).toBeNull();
    /* L’audio change en base, à la même version : l’instance sert celui qu’elle garde (chiffré), sans le relire */
    await db().update(schema.vocals).set({ audio: chiffrerOctets(Buffer.from("autre")) }).where(eq(schema.vocals.storyId, id));
    expect((await audioDuCompte(u.id, id))?.audio?.equals(premier!.audio!)).toBe(true);
    /* Une nouvelle version (le vocal refait) : le nouvel audio */
    await db().update(schema.vocals).set({ createdAt: new Date(Date.now() + 1000) }).where(eq(schema.vocals.storyId, id));
    expect((await audioDuCompte(u.id, id))?.audio?.toString()).toBe("autre");
  });

  it("dit « pas prêt » quand la conv n’a pas encore de vocal", async () => {
    const id = await importee("03-elle-s-eloigne.txt");
    expect(await audioDuCompte(u.id, id)).toEqual({ audio: null });
  });
});

describe("l’image story d’un lien partagé", () => {
  it("a une version stable, qui change avec ce que montre le lien", () => {
    const v = { emoji: "🔥", title: "Vous êtes un couple, sans le nom.", subtitle: "Il manque juste le mot." };
    expect(versionImage("abcdefghijkm", v)).toBe(versionImage("abcdefghijkm", { ...v }));
    expect(versionImage("abcdefghijkm", v)).not.toBe(versionImage("abcdefghijkm", { ...v, title: "Autre chose." }));
    expect(versionImage("abcdefghijkm", v)).not.toBe(versionImage("nopqrstuvwxy", v));
    expect(versionImage("abcdefghijkm", v)).toMatch(/^[\w-]{16}$/);
  });
});
