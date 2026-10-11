import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { DonneesVerdict } from "@/server/analyse";
import { chiffrer, dechiffrer } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import type { Ligne, Meta } from "@/server/histoires";
import { arreterPartage, ErreurPartage, lienDe, masqueDe, masquerPrenoms, partager, verdictPartage } from "@/server/partages";
import { compteDeTest, histoireLue, ligneEnBase } from "./aide/fixtures";

describe("les prénoms dans ce qui se partage", () => {
  it("deviennent des initiales, sans toucher aux mots qui les contiennent", () => {
    expect(masquerPrenoms("Sophie attend que tu parles, Hugo.", ["Hugo", "Sophie"])).toBe("S. attend que tu parles, H.");
    expect(masquerPrenoms("sophie t’attend. Huguette aussi.", ["Hugo", "Sophie"])).toBe("S. t’attend. Huguette aussi.");
    /* Le nom complet de l’export d’abord, puis le prénom seul */
    expect(masquerPrenoms("Inès Martin, ou Inès.", ["Inès", "Inès Martin"])).toBe("I., ou I.");
  });

  it("gardent en clair ceux à garder, même composés d’un nom masqué ; un nom des deux côtés reste masqué", () => {
    expect(masquerPrenoms("Sophie attend que tu parles, Hugo.", ["Sophie"], ["Hugo"])).toBe("S. attend que tu parles, Hugo.");
    expect(masquerPrenoms("Marie t’attend, Jean-Marie.", ["Marie"], ["Jean-Marie"])).toBe("M. t’attend, Jean-Marie.");
    expect(masquerPrenoms("Alex attend Alex.", ["Alex"], ["Alex"])).toBe("A. attend A.");
  });

  it("le masque d’une histoire : l’autre en initiale, ton prénom en clair ; sans « Qui es-tu ? », tout le monde masqué", () => {
    /* Une vraie ligne d’histoire, sans base : un export WhatsApp de 19 messages, sauf ce que `m` change */
    const histoire = (m: Pick<Meta, "participants"> & Partial<Meta>): Ligne => {
      const meta: Meta = { appli: "whatsapp", format: "whatsapp-ios", fichier: "conv.txt", resume: { debut: "2026-09-01", fin: "2026-09-30", total: 19, vocaux: 0 }, ...m };
      const t = new Date();
      return { id: randomUUID(), userId: null, draftToken: null, status: "prete", messageCount: 19, nextMessage: null, meta: chiffrer(meta), context: null, convPurgedAt: null, chatVocal: false, createdAt: t, updatedAt: t };
    };
    const deux = [
      { nom: "Hugo Lemaire", prenom: "Hugo", messages: 10 },
      { nom: "Sophie B", prenom: "Sophie", messages: 9 },
    ];
    expect(masqueDe(histoire({ participants: deux, moi: 0 }))("Sophie B attend Hugo Lemaire.")).toBe("S. attend Hugo Lemaire.");
    expect(masqueDe(histoire({ participants: deux }))("Sophie attend Hugo.")).toBe("S. attend H.");
    /* Des captures : tu es « Moi », ton prénom vient de « Qui es-tu ? » */
    const captures = [
      { nom: "Moi", prenom: "Karim", messages: 10 },
      { nom: "Inès", prenom: "Inès", messages: 9 },
    ];
    expect(masqueDe(histoire({ appli: "instagram", format: "captures", captures: 2, participants: captures, moi: 0 }))("Inès attend Karim, dis-moi.")).toBe("I. attend Karim, dis-moi.");
  });
});

describe("le lien de partage du verdict", () => {
  let story: Ligne;
  const verdictDe = async () => dechiffrer<DonneesVerdict>((await db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, story.id)))[0].data);
  const changerVerdict = async (f: (v: DonneesVerdict) => void) => {
    const v = await verdictDe();
    f(v);
    await db().update(schema.verdicts).set({ data: chiffrer(v) }).where(eq(schema.verdicts.storyId, story.id));
  };

  beforeAll(async () => {
    const imp = await histoireLue(await compteDeTest("partage"), "01-a-deux-doigts.txt", { qui: { moi: "Hugo" } });
    story = await ligneEnBase(imp.id);
    await changerVerdict((v) => (v.sortie.sous_titre = "Sophie attend que tu parles, Hugo."));
  });

  it("montre le verdict seul, le prénom de l’autre masqué (le tien en clair), et reste le même lien", async () => {
    const id = (await partager(story)).id;
    expect(id).toMatch(/^[a-zA-Z0-9]{12}$/);
    expect((await partager(story)).id).toBe(id);
    expect(await lienDe(story.id)).toBe(id);
    const v = await verdictPartage(id);
    expect(Object.keys(v!).sort()).toEqual(["emoji", "subtitle", "title"]);
    expect(v!.subtitle).toBe("S. attend que tu parles, Hugo.");
    /* La feuille de partage reçoit ce que montre le lien, sans le relire */
    expect(await partager(story)).toEqual({ id, verdict: v });
    /* Rien en clair dans la base */
    const [ligne] = await db().select().from(schema.shares).where(eq(schema.shares.id, id));
    expect(ligne.data.toString("utf8")).not.toContain("attend");
  });

  it("repartagé, le même lien montre le verdict tel qu’on le masque aujourd’hui", async () => {
    const id = (await partager(story)).id;
    /* Un lien d’avant : ton prénom y était masqué aussi */
    await db().update(schema.shares).set({ data: chiffrer({ emoji: "🤔", title: "x", subtitle: "S. attend que tu parles, H." }) }).where(eq(schema.shares.id, id));
    expect((await partager(story)).id).toBe(id);
    expect((await verdictPartage(id))!.subtitle).toBe("S. attend que tu parles, Hugo.");
  });

  it("se désactive : le lien ne montre plus rien, et le suivant est un autre lien", async () => {
    const avant = (await partager(story)).id;
    await arreterPartage(story.id);
    expect(await verdictPartage(avant)).toBeNull();
    expect(await lienDe(story.id)).toBeNull();
    const apres = (await partager(story)).id;
    expect(apres).not.toBe(avant);
    await arreterPartage(story.id);
  });

  it("refuse une situation difficile (mode sobre), et un identifiant mal formé", async () => {
    await changerVerdict((v) => (v.sortie.mode_sobre = true));
    /* Le verdict redevient partageable même si le test échoue : les autres tests le partagent */
    try {
      await expect(partager(story)).rejects.toEqual(new ErreurPartage("sobre"));
    } finally {
      await changerVerdict((v) => (v.sortie.mode_sobre = false));
    }
    expect(await verdictPartage("../../etc")).toBeNull();
  });
});
