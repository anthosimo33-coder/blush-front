import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
/* Lire des captures lit la session (le compte qui paie la lecture, src/server/budget.ts) : ici, sans compte */
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, has: () => false }), headers: async () => new Headers() }));
import { versTexteCaptures } from "@prompts/lib/captures";
import { lireCaptures } from "@/server/captures";
import { db, schema } from "@/server/db";
import { storyAffichee } from "@/server/conv-affichee";
import { ErreurTache } from "@/server/erreurs";
import { definirQui, histoireDe, importerCaptures, metaDe } from "@/server/histoires";
import { ErreurImport } from "@/server/import";
import { refusFactice, REFUS_FACTICE } from "@/server/ia/factice";
import { FACTICE } from "@/server/ia/factice-valeurs";
import { captures, msg } from "./aide/fabriques";
import { avecFactice } from "./aide/fixtures";

describe("des captures à l’histoire", () => {
  it("transcrit, crée le brouillon, et prend le prénom de l’utilisateur", async () => {
    const t = await lireCaptures(
      [
        { media: "image/png", base64: "AA==" },
        { media: "image/png", base64: "AA==" },
      ],
      "instagram",
    );
    expect(t.messages).toBe(FACTICE.messagesCaptures);
    /* Le modèle factice date ses messages de l’avant-veille et de la veille */
    expect(t.texte).toMatch(/^# captures · instagram · 2 captures\n== \d{4}-\d{2}-\d{2} 13:12 ==\nElias: message 1/);
    expect(t.texte).toContain("Moi: suite 3\nElias: suite 4 image omitted");
    const { id, meta } = await importerCaptures({ appli: "instagram", t });
    expect(storyAffichee(id, meta).sources[0]).toMatchObject({ mode: "captures", screenshotCount: 2, label: "Instagram · 2 captures" });
    const apres = await definirQui(id, { moi: 0, pronom: "elle", devinette: "parle", objectif: "comprendre", prenom: "Sarah" });
    expect(histoireDe(apres).utilisateur).toEqual({ prenom: "Sarah", pronom: "elle", nomExport: "Moi" });
    const ligne = (await db().select().from(schema.stories).where(eq(schema.stories.id, id)))[0]!;
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
    expect(versTexteCaptures(c, { aujourdhui: "2026-09-13" }).texte).toBe(
      "# captures · autre · 1 captures\n== 2026-09-08 ==\nLéo le vrai: salut\n== 2026-09-08 ==\nMoi: audio omis",
    );
  });
});

describe("des captures que le modèle ne lit pas", () => {
  const IMAGES = [{ media: "image/png" as const, base64: "AA==" }];

  it("un refus du modèle : « refus » (sa catégorie dans le code interne), jamais pris pour un fichier illisible", async () => {
    await expect(
      avecFactice(
        () => refusFactice("cyber"),
        () => lireCaptures(IMAGES, "instagram"),
      ),
    ).rejects.toMatchObject({ code: "refus:cyber" } satisfies Partial<ErreurTache>);
    await expect(
      avecFactice(
        () => REFUS_FACTICE,
        () => lireCaptures(IMAGES, "instagram"),
      ),
    ).rejects.toBeInstanceOf(ErreurTache);
  });

  it("une sortie illisible : « fichier »", async () => {
    await expect(
      avecFactice(
        () => ({ rien: "de lisible" }),
        () => lireCaptures(IMAGES, "instagram"),
      ),
    ).rejects.toMatchObject({ code: "fichier" } satisfies Partial<ErreurImport>);
  });
});
