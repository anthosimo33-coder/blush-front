import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
/* Lire des captures lit la session (le compte qui paie la lecture, src/server/budget.ts) : ici, sans compte */
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, has: () => false }), headers: async () => new Headers() }));
import { versTexteCaptures } from "@prompts/lib/captures";
import { lireCaptures } from "@/server/captures";
import { db, schema } from "@/server/db";
import { definirQui, histoireDe, importerCaptures, metaDe, storyAffichee } from "@/server/histoires";
import { captures, msg } from "./aide/fabriques";

describe("des captures à l’histoire", () => {
  it("transcrit, crée le brouillon, et prend le prénom de l’utilisateur", async () => {
    const t = await lireCaptures([{ media: "image/png", base64: "AA==" }, { media: "image/png", base64: "AA==" }], "instagram");
    expect(t.messages).toBe(24);
    /* Le modèle factice date ses messages de l’avant-veille et de la veille */
    expect(t.texte).toMatch(/^# captures · instagram · 2 captures\n== \d{4}-\d{2}-\d{2} 13:12 ==\nElias: message 1/);
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
    const c = captures({
      appli: null,
      autre: "Léo: le vrai",
      blocs: [
        { repere: null, messages: [msg("autre", "salut")] },
        { repere: { date: "2026-09-08", heure: null }, messages: [msg("moi", "", { media: "vocal" })] },
      ],
    });
    expect(versTexteCaptures(c, { aujourdhui: "2026-09-13" }).texte).toBe("# captures · autre · 1 captures\n== 2026-09-08 ==\nLéo le vrai: salut\n== 2026-09-08 ==\nMoi: audio omis");
  });
});
