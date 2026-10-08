import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { Captures } from "@prompts/lib/schemas";
import { enTexte } from "@/server/captures";
import { db, schema } from "@/server/db";
import { importerCaptures, storyAffichee } from "@/server/histoires";
import { fusionnerLots, recouvrement } from "@/server/video";
import { decalage, lotsDe } from "@/services/preparer-video";

type Msg = Captures["blocs"][number]["messages"][number];
const m = (de: "moi" | "autre", texte: string, coupe = false): Msg => ({ de, texte, media: null, coupe, reaction: null });
const lot = (blocs: Captures["blocs"], images: number, autre: string | null = "Inès"): Captures => ({
  appli: "imessage",
  autre,
  captures: Array.from({ length: images }, (_, k) => ({ numero: k + 1, place: k + 1, hors_sujet: false })),
  blocs,
  profil: [],
  doutes: [],
});

describe("les lots d’un enregistrement, rassemblés", () => {
  it("recolle deux lots sans doublon, et garde le message entier plutôt que le bout coupé", () => {
    const a = lot(
      [
        { repere: { date: "2026-10-01", heure: "21:00" }, messages: [m("autre", "salut toi"), m("moi", "hey"), m("autre", "tu fais quoi ce soir"), m("moi", "rien de spécial et toi", true)] },
      ],
      12,
    );
    const b = lot(
      [
        { repere: null, messages: [m("autre", "tu fais quoi ce soir ?"), m("moi", "rien de spécial et toi ? je regarde un film"), m("autre", "viens on sort")] },
        { repere: { date: "2026-10-02", heure: "10:12" }, messages: [m("moi", "bien dormi ?")] },
      ],
      12,
      null,
    );
    const f = fusionnerLots([a, b], "imessage");
    expect(f.blocs.flatMap((x) => x.messages.map((y) => y.texte))).toEqual([
      "salut toi",
      "hey",
      "tu fais quoi ce soir",
      "rien de spécial et toi ? je regarde un film",
      "viens on sort",
      "bien dormi ?",
    ]);
    expect(f.blocs.map((x) => x.repere?.date ?? null)).toEqual(["2026-10-01", "2026-10-02"]);
    /* L’image partagée par les deux lots ne compte qu’une fois */
    expect(f.captures).toHaveLength(23);
    expect(f.autre).toBe("Inès");
    expect(enTexte(f).messages).toBe(6);
  });

  it("met bout à bout deux lots sans message commun, et ne recolle pas sur un seul message court", () => {
    expect(recouvrement([m("moi", "ok")], [m("moi", "ok"), m("autre", "ça marche")])).toEqual({ garderA: 1, sauterB: 0, long: 0 });
    const f = fusionnerLots([lot([{ repere: null, messages: [m("moi", "a1"), m("autre", "a2")] }], 3), lot([{ repere: null, messages: [m("moi", "b1")] }], 3)], "autre");
    expect(f.blocs.flatMap((x) => x.messages.map((y) => y.texte))).toEqual(["a1", "a2", "b1"]);
  });
});

describe("l’enregistrement, découpé et mesuré dans le navigateur", () => {
  it("découpe en lots qui reprennent chacun la dernière image du précédent", () => {
    const images = Array.from({ length: 25 }, (_, k) => k);
    const lots = lotsDe(images);
    expect(lots.map((l) => [l[0], l.at(-1)])).toEqual([
      [0, 11],
      [11, 22],
      [22, 24],
    ]);
    expect(lotsDe(Array.from({ length: 12 }, (_, k) => k))).toHaveLength(1);
  });

  it("mesure de combien la conv a défilé, et voit quand elle a sauté", () => {
    const L = 24;
    const H = 240;
    /* Une « conv » : des lignes de texte (bandes sombres) à des hauteurs irrégulières, sur un fond clair */
    const page = Array.from({ length: H * 3 }, (_, y) => (Math.sin(y * 0.37) + Math.sin(y * 0.11) > 0.6 ? 40 : 235));
    const ecran = (depuis: number) => Float32Array.from({ length: L * H }, (_, i) => page[depuis + Math.floor(i / L)] + (i % L > 12 ? 10 : 0));
    /* Le contenu remonte de 30 lignes (on descend vers les messages récents) */
    expect(decalage(ecran(100), ecran(130))).toEqual({ d: -30, saut: false });
    /* Il descend de 45 lignes (on remonte vers les vieux messages) */
    expect(decalage(ecran(200), ecran(155))).toEqual({ d: 45, saut: false });
    /* Un écran sans rapport : un saut */
    const autre = Float32Array.from({ length: L * H }, (_, i) => ((i * 7919) % 255 > 127 ? 255 : 0));
    expect(decalage(ecran(100), autre).saut).toBe(true);
  });
});

describe("une conv iMessage lue sur un enregistrement", () => {
  const ids: string[] = [];
  afterAll(async () => {
    for (const id of ids) await db().delete(schema.stories).where(eq(schema.stories.id, id));
  });

  it("devient une histoire brouillon, comme des captures", async () => {
    const messages = Array.from({ length: 30 }, (_, k) => m(k % 2 ? "moi" : "autre", `message numéro ${k + 1} de la conv`));
    const lots = [lot([{ repere: { date: "2026-10-01", heure: "20:00" }, messages: messages.slice(0, 18) }], 12), lot([{ repere: null, messages: messages.slice(14) }], 6)];
    const t = enTexte(fusionnerLots(lots, "imessage"));
    expect(t.messages).toBe(30);
    const { id, meta } = await importerCaptures({ appli: "imessage", t });
    ids.push(id);
    expect(storyAffichee(id, meta).sources[0].label).toBe("iMessage · 17 captures");
  });
});
