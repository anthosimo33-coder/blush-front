import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

/* after() de Next ne vit que dans une requête : ici, on garde ce qui devait partir après la réponse, pour le lancer soi-même */
const apres = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => apres.push(f) }));

import type { Utilisateur } from "@/server/auth";
import { chiffrerOctets } from "@/server/chiffrement";
import * as coffre from "@/server/coffre";
import { db, schema } from "@/server/db";
import { contactDe, ouvrirLeRapport } from "@/server/donnees";
import { avecEcheance } from "@/server/echeance";
import { historique } from "@/server/historique";
import { histoireOuverte, histoiresDuCompte } from "@/server/histoires";
import { versionImage } from "@/server/partages";
import { executerChaine, tempsPourCommencer } from "@/server/pipeline";
import { etatDesTaches, planifier } from "@/server/taches";
import { audioDuCompte } from "@/server/vocal";
import { compteDeTest, convPrete, debloquerLaConv } from "./aide/fixtures";

/* Côté serveur, ce qui garde les écrans rapides : ce que lisent les écrans, la chaîne, l’audio du vocal, l’image story */

/** L’audio servi, ou null : pas de conv à ce compte, ou son rapport fermé (« acces »). */
const servi = async (...a: Parameters<typeof audioDuCompte>) => {
  const r = await audioDuCompte(...a);
  return r === "acces" ? null : r;
};

const lancerApres = async () => {
  while (apres.length) await apres.shift()!();
};

let u: Utilisateur;
let autre: Utilisateur;

beforeAll(async () => {
  [u, autre] = [await compteDeTest("fluidite"), await compteDeTest("fluidite-autre")];
});

/** Une conv importée, rattachée au compte gratuit du fichier (ou à `compte`), « Qui es-tu ? » rempli ; sa lecture planifiée (pas lancée). */
async function importee(f: string, compte = u): Promise<string> {
  const { id } = await convPrete(compte, f);
  await planifier(id, "verdict");
  return id;
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
    const compte = await compteDeTest("fluidite-acces");
    const id = await importee("06-elle-hesite.txt", compte);
    await executerChaine(id);
    expect(await contactDe(id)).toMatchObject({ level: expect.any(String), nextStep: expect.stringMatching(/^Ton prochain pas\u00a0: /) });
    /* Le rapport se débloque (comme un achat livré) */
    await debloquerLaConv(id);
    const r = await ouvrirLeRapport((await histoireOuverte(compte, { affichee: id }))!, compte);
    expect(r?.generating).toBe(true);
    /* Le contact de l’accueil est celui de la tête du rapport */
    expect(await contactDe(id)).toEqual({ verdict: r!.report.verdict, level: r!.report.level, trend: r!.report.trend, nextStep: r!.report.nextStep });
    await lancerApres();
    const { rapport_chapitres, memoire } = await etatDesTaches(id, ["rapport_chapitres", "memoire"]);
    expect([rapport_chapitres?.status, memoire?.status]).toEqual(["fini", "fini"]);
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
    const compte = await compteDeTest("fluidite-chaine");
    const id = await importee("01-a-deux-doigts.txt", compte);
    /* Moins que le temps d’un verdict avant l’échéance : il attend le prochain passage */
    await avecEcheance(tempsPourCommencer("verdict") - 5_000, () => executerChaine(id));
    expect((await etatDesTaches(id, ["verdict"])).verdict?.status).toBe("attente");
    /* Le temps qu’il faut : verdict, puis le plan et les chapitres s’enchaînent sans attendre un sondage */
    await debloquerLaConv(id);
    await executerChaine(id);
    const { verdict, rapport_chapitres } = await etatDesTaches(id, ["verdict", "rapport_chapitres"]);
    expect([verdict?.status, rapport_chapitres?.status]).toEqual(["fini", "fini"]);
  });

  it("donne à chaque étape le temps de finir avant que Vercel coupe la fonction", () => {
    expect(tempsPourCommencer("rapport_chapitres")).toBeGreaterThan(tempsPourCommencer("rapport_plan"));
    expect(tempsPourCommencer("rapport_chapitres")).toBeLessThan(285_000);
  });
});

describe("l’audio du vocal", () => {
  it("n’est lu que par son compte, en une requête, et la seconde ne relit pas l’audio", async () => {
    /* Un compte à lui, ses convs débloquées : sa lecture va jusqu’au vocal */
    const plus = await compteDeTest("fluidite-vocal", "debloque");
    const id = await importee("02-reciproque.txt", plus);
    await executerChaine(id);
    const premier = await servi(plus, id);
    expect(premier?.audio?.subarray(0, 2).toString("hex")).toBe("fffb");
    expect(await audioDuCompte(autre, id)).toBeNull();
    expect(await audioDuCompte(plus, "../../etc")).toBeNull();
    /* L’audio change en base, à la même version : l’instance sert celui qu’elle garde (chiffré), sans le relire */
    await db()
      .update(schema.vocals)
      .set({ audio: chiffrerOctets(Buffer.from("autre")) })
      .where(eq(schema.vocals.storyId, id));
    expect((await servi(plus, id))?.audio?.equals(premier!.audio!)).toBe(true);
    /* Une nouvelle version (le vocal refait) : le nouvel audio */
    await db()
      .update(schema.vocals)
      .set({ createdAt: new Date(Date.now() + 1000) })
      .where(eq(schema.vocals.storyId, id));
    expect((await servi(plus, id))?.audio?.toString()).toBe("autre");
  });

  it("dit « pas prêt » quand la conv n’a pas encore de vocal", async () => {
    const id = await importee("03-elle-s-eloigne.txt");
    await debloquerLaConv(id);
    expect(await audioDuCompte(u, id)).toEqual({ audio: null });
  });

  it("n’est servi que si le rapport de sa conv est ouvert (débloqué, l’équipe) ou en mode sobre, comme sa lecture", async () => {
    /* Un rapport payé puis remboursé : re-verrouillé, son vocal reste en base, mais ne s’écoute plus */
    const c = await compteDeTest("fluidite-vocal-repris", "debloque");
    const id = await importee("02-reciproque.txt", c);
    await executerChaine(id);
    expect((await audioDuCompte(c, id)) as { audio: Buffer }).toHaveProperty("audio.length");
    await debloquerLaConv(id, false);
    expect(await audioDuCompte(c, id)).toBe("acces");
    /* Le mode sobre l’ouvre sans paiement (ouvertureDu, comme GET /api/rapport) */
    const [v] = await db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, id));
    const verdict = coffre.lire("verdicts.data", v!.data);
    await db()
      .update(schema.verdicts)
      .set({ data: coffre.ecrire("verdicts.data", { ...verdict, sortie: { ...verdict.sortie, mode_sobre: true } }) })
      .where(eq(schema.verdicts.storyId, id));
    expect((await audioDuCompte(c, id)) as { audio: Buffer }).toHaveProperty("audio.length");
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
