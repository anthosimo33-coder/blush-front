import { describe, expect, it, vi } from "vitest";
/* Lire des captures lit la session (le compte qui paie la lecture, src/server/budget.ts) : ici, sans compte */
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, has: () => false }), headers: async () => new Headers() }));
import { versTexteCaptures } from "@prompts/lib/captures";
import { storyAffichee } from "@/server/conv-affichee";
import { ajouterDesCaptures, importer, metaDe } from "@/server/histoires";
import { captures, msg } from "./aide/fabriques";
import { accordDeTest, ligneEnBase } from "./aide/fixtures";
import { creees } from "./aide/nettoyage";

/*
 * Les médias d’un export Android « sans médias » (src/server/histoires.ts, resumeDe) : l’écran les montre à la place de
 * « 0 vocal », pour l’export seul comme pour la conv réunie avec des captures. Une conv inventée : Tom et Léa.
 */

/** Un export Android « sans médias » inventé : `n` messages un par minute le 5 septembre 2026, un sur quatre « <Médias omis> ». */
const exportAndroid = (n: number) => ({
  appli: "whatsapp" as const,
  nom: "Discussion WhatsApp avec Léa.txt",
  texte: Array.from({ length: n }, (_, k) => `05/09/2026 10:${String(k % 60).padStart(2, "0")} - ${k % 2 ? "Léa" : "Tom"}: ${k % 4 === 1 ? "<Médias omis>" : `message ${k}`}`).join(
    "\n",
  ),
});

describe("les médias d’un export Android « sans médias »", () => {
  it("l’export seul, puis la conv réunie avec des captures du début, montrent ses médias", async () => {
    const imp = await importer(exportAndroid(60), accordDeTest());
    creees.histoires.push(imp.id);
    expect(storyAffichee(imp.id, imp.meta)).toMatchObject({ voiceCount: 0, mediaCount: 15 });
    const t = versTexteCaptures(
      /* Des captures qui montrent une photo : elles nomment leur média, pas l’export Android */
      captures({
        autre: "Léa",
        blocs: [
          {
            repere: { date: "2026-09-01", heure: "21:00" },
            messages: Array.from({ length: 24 }, (_, k) => msg(k % 2 ? "autre" : "moi", `capture ${k}`, { media: k === 3 ? "photo" : null })),
          },
        ],
      }),
      { aujourdhui: "2026-09-06" },
    );
    await ajouterDesCaptures(imp.secret, { appli: "instagram", t });
    const reunie = storyAffichee(imp.id, metaDe(await ligneEnBase(imp.id)));
    expect(reunie).toMatchObject({ voiceCount: 0, mediaCount: 15 });
  });
});
