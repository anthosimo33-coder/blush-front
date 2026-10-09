import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DonneesVerdict } from "@/server/analyse";
import { executerChaine } from "@/server/analyse";
import { chiffrer, dechiffrer } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { definirQui, depuisFichier, importer, rattacherBrouillon, type Ligne } from "@/server/histoires";
import { definirFactice } from "@/server/ia/claude";
import { fournisseurFactice } from "@/server/ia/factice";
import { arreterPartage, ErreurPartage, lienDe, masqueDe, masquerPrenoms, partagerVerdict, verdictPartage } from "@/server/partages";
import { planifier } from "@/server/taches";

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
    const histoire = (meta: object) => ({ meta: chiffrer(meta) }) as Ligne;
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
    expect(masqueDe(histoire({ participants: captures, moi: 0 }))("Inès attend Karim, dis-moi.")).toBe("I. attend Karim, dis-moi.");
  });
});

describe("le lien de partage du verdict", () => {
  const email = `partage-${Date.now()}@blush.test`;
  let story: Ligne;
  const verdictDe = async () => dechiffrer<DonneesVerdict>((await db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, story.id)))[0].data);
  const changerVerdict = async (f: (v: DonneesVerdict) => void) => {
    const v = await verdictDe();
    f(v);
    await db().update(schema.verdicts).set({ data: chiffrer(v) }).where(eq(schema.verdicts.storyId, story.id));
  };

  beforeAll(async () => {
    definirFactice(fournisseurFactice);
    const imp = await importer(await depuisFichier(new File([readFileSync("prompts/evals/convs/01-a-deux-doigts.txt")], "01.txt", { type: "text/plain" })));
    const [u] = await db().insert(schema.users).values({ email }).returning();
    await rattacherBrouillon(u, imp.secret);
    await definirQui(imp.id, { moi: imp.meta.participants.findIndex((p) => p.prenom === "Hugo") as 0 | 1, pronom: "il", devinette: "vus", objectif: "ensemble" });
    await planifier(imp.id, "verdict");
    await executerChaine(imp.id);
    [story] = await db().select().from(schema.stories).where(eq(schema.stories.id, imp.id));
    await changerVerdict((v) => (v.sortie.sous_titre = "Sophie attend que tu parles, Hugo."));
  });
  afterAll(async () => {
    await db().delete(schema.users).where(eq(schema.users.email, email));
    definirFactice(null);
  });

  it("montre le verdict seul, le prénom de l’autre masqué (le tien en clair), et reste le même lien", async () => {
    const id = await partagerVerdict(story);
    expect(id).toMatch(/^[a-zA-Z0-9]{12}$/);
    expect(await partagerVerdict(story)).toBe(id);
    expect(await lienDe(story.id)).toBe(id);
    const v = await verdictPartage(id);
    expect(Object.keys(v!).sort()).toEqual(["emoji", "subtitle", "title"]);
    expect(v!.subtitle).toBe("S. attend que tu parles, Hugo.");
    /* Rien en clair dans la base */
    const [ligne] = await db().select().from(schema.shares).where(eq(schema.shares.id, id));
    expect(ligne.data.toString("utf8")).not.toContain("attend");
  });

  it("repartagé, le même lien montre le verdict tel qu’on le masque aujourd’hui", async () => {
    const id = await partagerVerdict(story);
    /* Un lien d’avant : ton prénom y était masqué aussi */
    await db().update(schema.shares).set({ data: chiffrer({ emoji: "🤔", title: "x", subtitle: "S. attend que tu parles, H." }) }).where(eq(schema.shares.id, id));
    expect(await partagerVerdict(story)).toBe(id);
    expect((await verdictPartage(id))!.subtitle).toBe("S. attend que tu parles, Hugo.");
  });

  it("se désactive : le lien ne montre plus rien, et le suivant est un autre lien", async () => {
    const avant = await partagerVerdict(story);
    await arreterPartage(story.id);
    expect(await verdictPartage(avant)).toBeNull();
    expect(await lienDe(story.id)).toBeNull();
    const apres = await partagerVerdict(story);
    expect(apres).not.toBe(avant);
    await arreterPartage(story.id);
  });

  it("refuse une situation difficile (mode sobre), et un identifiant mal formé", async () => {
    await changerVerdict((v) => (v.sortie.mode_sobre = true));
    await expect(partagerVerdict(story)).rejects.toEqual(new ErreurPartage("sobre"));
    expect(await verdictPartage("../../etc")).toBeNull();
  });
});
