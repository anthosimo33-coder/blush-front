import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { versTexteCaptures } from "@prompts/lib/captures";
import type { Captures } from "@prompts/lib/schemas";
import { lireCaptures } from "@/server/captures";
import { db, schema } from "@/server/db";
import { definirQui, histoireDe, importerCaptures, metaDe, storyAffichee } from "@/server/histoires";

describe("des captures à l’histoire", () => {
  it("transcrit, crée le brouillon, et prend le prénom de l’utilisateur", async () => {
    const t = await lireCaptures([{ media: "image/png", base64: "AA==" }, { media: "image/png", base64: "AA==" }], "instagram");
    expect(t.messages).toBe(24);
    expect(t.texte).toMatch(/^# captures · instagram · 2 captures\n== 2026-09-06 13:12 ==\nElias: message 1/);
    expect(t.texte).toContain("Moi: suite 3\nElias: suite 4 image omitted");
    const { id, meta } = await importerCaptures({ appli: "instagram", t });
    expect(storyAffichee(id, meta).sources[0]).toMatchObject({ mode: "captures", screenshotCount: 2, label: "Instagram · 2 captures" });
    const apres = await definirQui(id, { moi: 0, pronom: "elle", devinette: "parle", objectif: "comprendre", prenom: "Sarah" });
    expect(histoireDe(apres).utilisateur).toEqual({ prenom: "Sarah", pronom: "elle", nomExport: "Moi" });
    const [ligne] = await db().select().from(schema.stories).where(eq(schema.stories.id, id));
    expect(metaDe(ligne).format).toBe("captures");
    await db().delete(schema.stories).where(eq(schema.stories.id, id));
  });

  it("sans repère au début, le premier bloc prend le jour du premier repère", () => {
    const c: Captures = {
      appli: null,
      autre: "Léo: le vrai",
      captures: [{ numero: 1, place: 1, hors_sujet: false }],
      blocs: [
        { repere: null, messages: [{ de: "autre", texte: "salut", media: null, coupe: false, reaction: null }] },
        { repere: { date: "2026-09-08", heure: null }, messages: [{ de: "moi", texte: "", media: "vocal", coupe: false, reaction: null }] },
      ],
      doutes: [],
    };
    expect(versTexteCaptures(c, { aujourdhui: "2026-09-13" }).texte).toBe("# captures · autre · 1 captures\n== 2026-09-08 ==\nLéo le vrai: salut\n== 2026-09-08 ==\nMoi: audio omis");
  });
});
