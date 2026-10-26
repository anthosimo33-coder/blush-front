import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Captures } from "@prompts/lib/schemas";
import { enTexte } from "@/server/captures";
import { db, schema } from "@/server/db";
import { storyAffichee } from "@/server/conv-affichee";
import { importerCaptures } from "@/server/histoires";
import { fusionnerLots, recouvrement } from "@/server/video";
import { decalage, empreinteDuLot, garderLesPlusRecents, garderLeLot, IMAGES_MAX, lotDejaLu, lotsDe, tailleDesLots } from "@/services/preparer-video";
import { empreinteDuLot as empreinteDuServeur } from "@/server/lots";
import { captures, msg } from "./aide/fabriques";
import { accordDeTest } from "./aide/fixtures";

/** Un lot lu d’un enregistrement iMessage : ses blocs, sur `images` captures. */
const lot = (blocs: Captures["blocs"], images: number, autre: string | null = "Inès"): Captures =>
  captures({ appli: "imessage", autre, captures: Array.from({ length: images }, (_, k) => ({ numero: k + 1, place: k + 1, hors_sujet: false })), blocs });

describe("les lots d’un enregistrement, rassemblés", () => {
  it("recolle deux lots sans doublon, et garde le message entier plutôt que le bout coupé", () => {
    const a = lot(
      [
        {
          repere: { date: "2026-10-01", heure: "21:00" },
          messages: [msg("autre", "salut toi"), msg("moi", "hey"), msg("autre", "tu fais quoi ce soir"), msg("moi", "rien de spécial et toi", { coupe: true })],
        },
      ],
      12,
    );
    const b = lot(
      [
        { repere: null, messages: [msg("autre", "tu fais quoi ce soir ?"), msg("moi", "rien de spécial et toi ? je regarde un film"), msg("autre", "viens on sort")] },
        { repere: { date: "2026-10-02", heure: "10:12" }, messages: [msg("moi", "bien dormi ?")] },
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
    expect(recouvrement([msg("moi", "ok")], [msg("moi", "ok"), msg("autre", "ça marche")])).toEqual({ garderA: 1, sauterB: 0, long: 0 });
    const f = fusionnerLots([lot([{ repere: null, messages: [msg("moi", "a1"), msg("autre", "a2")] }], 3), lot([{ repere: null, messages: [msg("moi", "b1")] }], 3)], "autre");
    expect(f.blocs.flatMap((x) => x.messages.map((y) => y.texte))).toEqual(["a1", "a2", "b1"]);
  });

  it("de longs lots qui se recouvrent : chaque bord recollé, comme quand la fusion relisait tout", () => {
    /* 6 lots de 120 messages ; chacun reprend les 10 derniers du précédent, le premier coupé en haut de l’écran */
    const texte = (k: number) => `message ${k} ${k % 7 ? "ok" : "on se voit samedi soir ?"}`;
    const lots = Array.from({ length: 6 }, (_, l) =>
      lot([{ repere: null, messages: Array.from({ length: 120 }, (_, i) => l * 110 + i).map((k, i) => msg(k % 2 ? "moi" : "autre", texte(k), { coupe: l > 0 && i === 0 })) }], 6),
    );
    const f = fusionnerLots(lots, "imessage");
    expect(f.blocs.flatMap((x) => x.messages.map((y) => y.texte))).toEqual(Array.from({ length: 5 * 110 + 120 }, (_, k) => texte(k)));
  });

  it("un envoi forgé (40 lots de messages presque pareils, de 600 caractères) : rassemblé en temps borné", () => {
    /* Chaque fenêtre essayée échoue à son dernier message : la fusion compare des milliers de fois les mêmes messages */
    const long = `${"on se voit quand tu veux, ".repeat(23)}`.slice(0, 600);
    const lots = Array.from({ length: 40 }, (_, l) =>
      lot([{ repere: null, messages: [...Array.from({ length: 74 }, () => msg("moi", long, { coupe: true })), msg("moi", `fin du lot ${l}`)] }], 6),
    );
    const t0 = performance.now();
    const f = fusionnerLots(lots, "imessage");
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(f.blocs.flatMap((b) => b.messages)).toHaveLength(40 * 75);
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

  it("des lots de six (une courte vidéo) : l’ordre et le recouvrement tiennent, et même un long enregistrement en lots de six reste sous la borne du serveur", () => {
    const lots = lotsDe(
      Array.from({ length: 26 }, (_, k) => k),
      6,
    );
    expect(lots.map((l) => [l[0], l.at(-1)])).toEqual([
      [0, 5],
      [5, 10],
      [10, 15],
      [15, 20],
      [20, 25],
    ]);
    /* Des lots de six : trente-deux pour IMAGES_MAX (160), sous les 40 que /api/captures/video accepte */
    expect(
      lotsDe(
        Array.from({ length: IMAGES_MAX }, (_, k) => k),
        6,
      ),
    ).toHaveLength(32);
  });

  it("la taille des lots (ce que l’import envoie, lus cinq à la fois) : six pour une courte vidéo, en un seul tour ; jusqu’à douze pour une longue", () => {
    expect([11, 26, 40, 160].map((n) => tailleDesLots(n, 5))).toEqual([6, 6, 9, 12]);
    /* 40 écrans : cinq lots de neuf, un seul tour ; 160 : quinze lots de douze, sous les 40 que /api/captures/video accepte */
    expect(
      lotsDe(
        Array.from({ length: 40 }, (_, k) => k),
        tailleDesLots(40, 5),
      ),
    ).toHaveLength(5);
    expect(
      lotsDe(
        Array.from({ length: IMAGES_MAX }, (_, k) => k),
        tailleDesLots(IMAGES_MAX, 5),
      ),
    ).toHaveLength(15);
  });

  it("un enregistrement trop long : la partie la plus récente de la conv, plutôt qu’un refus", () => {
    /* On remonte la conv : les premiers écrans sont les plus récents, on les garde et on s’arrête */
    const remonte = Array.from({ length: IMAGES_MAX + 1 }, (_, k) => k);
    expect(garderLesPlusRecents(remonte, true)).toBe(true);
    expect(remonte).toEqual(Array.from({ length: IMAGES_MAX }, (_, k) => k));
    /* On la descend : les derniers sont les plus récents, on oublie les premiers et on continue */
    const descend = Array.from({ length: IMAGES_MAX + 2 }, (_, k) => k);
    expect(garderLesPlusRecents(descend, false)).toBe(false);
    expect(descend).toEqual(Array.from({ length: IMAGES_MAX }, (_, k) => k + 2));
    /* Sous la borne : rien ne change */
    const court = [1, 2, 3];
    expect(garderLesPlusRecents(court, true)).toBe(false);
    expect(court).toEqual([1, 2, 3]);
  });

  it("l’empreinte d’un lot, dans le navigateur comme sur le serveur : la même pour les mêmes images, la même appli et le même jour ; une autre sinon", async () => {
    const image = (octets: number[]) => new Blob([new Uint8Array(octets)], { type: "image/jpeg" });
    const [a, b] = [image([1, 2, 3]), image([4, 5])];
    const navigateur = (images: Blob[], appli = "imessage", jour = "2026-10-26") => empreinteDuLot(images, appli, jour);
    const meme = await navigateur([a, b]);
    expect(meme).toMatch(/^[0-9a-f]{64}$/);
    expect(await navigateur([image([1, 2, 3]), image([4, 5])])).toBe(meme);
    const autres = await Promise.all([
      navigateur([b, a]),
      navigateur([a]),
      navigateur([a, b], "instagram"),
      navigateur([a, b], "imessage", "2026-10-27"),
      navigateur([image([1, 2]), image([3, 4, 5])]),
    ]);
    expect(new Set([meme, ...autres]).size).toBe(6);
    /* Le serveur, sur les images reçues (base64) : le même principe */
    const recue = (octets: number[]) => ({ media: "image/jpeg" as const, base64: Buffer.from(octets).toString("base64") });
    const serveur = empreinteDuServeur([recue([1, 2, 3]), recue([4, 5])], "imessage", "2026-10-26");
    expect(empreinteDuServeur([recue([1, 2, 3]), recue([4, 5])], "imessage", "2026-10-26")).toBe(serveur);
    expect(
      new Set([
        serveur,
        empreinteDuServeur([recue([4, 5]), recue([1, 2, 3])], "imessage", "2026-10-26"),
        empreinteDuServeur([recue([1, 2, 3]), recue([4, 5])], "imessage", "2026-10-27"),
      ]).size,
    ).toBe(3);
  });

  it("un lot lu reste dans l’onglet, frais une heure ; sans empreinte, rien n’est gardé", () => {
    const lot = { blocs: [] };
    garderLeLot("lot-a", lot);
    expect(lotDejaLu("lot-a")).toBe(lot);
    expect(lotDejaLu("lot-b")).toBeUndefined();
    garderLeLot(null, lot);
    expect(lotDejaLu(null)).toBeUndefined();
    const maintenant = Date.now();
    const horloge = vi.spyOn(Date, "now").mockReturnValue(maintenant + 61 * 60e3);
    try {
      expect(lotDejaLu("lot-a")).toBeUndefined();
    } finally {
      horloge.mockRestore();
    }
  });

  it("mesure de combien la conv a défilé, et voit quand elle a sauté", () => {
    const L = 24;
    const H = 240;
    /* Une « conv » : des lignes de texte (bandes sombres) à des hauteurs irrégulières, sur un fond clair */
    const page = Array.from({ length: H * 3 }, (_, y) => (Math.sin(y * 0.37) + Math.sin(y * 0.11) > 0.6 ? 40 : 235));
    const ecran = (depuis: number) => Float32Array.from({ length: L * H }, (_, i) => page[depuis + Math.floor(i / L)]! + (i % L > 12 ? 10 : 0));
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
    const messages = Array.from({ length: 30 }, (_, k) => msg(k % 2 ? "moi" : "autre", `message numéro ${k + 1} de la conv`));
    const lots = [lot([{ repere: { date: "2026-10-01", heure: "20:00" }, messages: messages.slice(0, 18) }], 12), lot([{ repere: null, messages: messages.slice(14) }], 6)];
    const t = enTexte(fusionnerLots(lots, "imessage"));
    expect(t.messages).toBe(30);
    const { id, meta } = await importerCaptures({ appli: "imessage", t, consentement: accordDeTest() });
    ids.push(id);
    expect(storyAffichee(id, meta).sources[0]!.label).toBe("iMessage · 17 captures");
  });
});
