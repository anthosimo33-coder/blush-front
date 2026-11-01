import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Captures } from "@prompts/lib/schemas";
import { ECRANS_PAR_LOT, LECTEURS_DE_LOTS, LOTS_MAX } from "@/lib/limites";
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

/*
 * Une vidéo et le modèle qui la lit, simulés : l’écran e montre les messages PAS × e à PAS × e + VUS − 1 (deux écrans
 * voisins en partagent la moitié, comme une vidéo qui garde un écran tous les 55 % de défilement), un repère de date tous
 * les dix messages. Le modèle lit un lot comme le vrai lit des écrans qui se recouvrent : chaque message une fois, dans
 * l’ordre, en blocs qui commencent à leur repère.
 */
const PAS = 3;
const VUS = 6;
const repereDu = (k: number) => (k % 10 ? null : { date: new Date(Date.UTC(2026, 6, 1 + k / 10)).toISOString().slice(0, 10), heure: "21:00" });
/** La lecture des écrans d’un lot (ou de toute la vidéo d’un coup), par le modèle simulé. */
function lireLeLot(ecrans: number[]): Captures {
  const blocs: Captures["blocs"] = [];
  for (let k = PAS * ecrans[0]!; k < PAS * ecrans.at(-1)! + VUS; k++) {
    const repere = repereDu(k);
    if (repere || !blocs.length) blocs.push({ repere, messages: [] });
    blocs.at(-1)!.messages.push(msg(k % 2 ? "moi" : "autre", `message ${k} : on se voit samedi soir ?`));
  }
  return lot(blocs, ecrans.length);
}

/** La taille des lots jusqu’au 27 octobre : de six à douze écrans, assez pour tout lire en un tour de cinq lecteurs. */
const tailleDAvant = (ecrans: number) => Math.min(12, Math.max(6, Math.ceil((ecrans - 1) / LECTEURS_DE_LOTS) + 1));
/** La découpe jusqu’au 27 octobre, en partant du début (le reste dans le plus récent), sans borne de poids : pour comparer. */
function lotsDAvant<T>(images: T[], taille: number): T[][] {
  const lots: T[][] = [];
  for (let i = 0; i < images.length;) {
    const j = Math.min(images.length, i + taille);
    lots.push(images.slice(i, j));
    if (j === images.length) break;
    i = j - 1;
  }
  return lots;
}

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
  it("découpe en partant de la fin : le lot le plus récent plein, chacun reprenant la dernière image du précédent, le reste dans le plus ancien", () => {
    /* Les premier et dernier écrans de chaque lot, du plus ancien au plus récent */
    const bornes = (n: number) => lotsDe(Array.from({ length: n }, (_, k) => k)).map((l) => [l[0], l.at(-1)]);
    expect(bornes(0)).toEqual([]);
    /* Moins de douze : un seul lot, de tous les écrans */
    expect([1, 5, 11].map(bornes)).toEqual([[[0, 0]], [[0, 4]], [[0, 10]]]);
    expect(bornes(12)).toEqual([[0, 11]]);
    expect(bornes(13)).toEqual([
      [0, 1],
      [1, 12],
    ]);
    expect(bornes(24)).toEqual([
      [0, 1],
      [1, 12],
      [12, 23],
    ]);
    expect(bornes(26)).toEqual([
      [0, 3],
      [3, 14],
      [14, 25],
    ]);
    expect(bornes(40)).toEqual([
      [0, 6],
      [6, 17],
      [17, 28],
      [28, 39],
    ]);
    /* 160 (IMAGES_MAX) : quinze lots, sous les 40 que /api/captures/video accepte ; le plus ancien en a six, le plus récent douze */
    const long = bornes(IMAGES_MAX);
    expect(long).toHaveLength(15);
    expect(long.length).toBeLessThanOrEqual(LOTS_MAX);
    expect([long[0], long[1], long.at(-1)]).toEqual([
      [0, 5],
      [5, 16],
      [148, 159],
    ]);
  });

  it("pour toute longueur : le plus récent toujours plein, autant de lots et d’images envoyées qu’en partant du début, jamais plus qu’avant le 27 octobre, et le même seuil d’une longue vidéo", () => {
    for (let n = 1; n <= IMAGES_MAX; n++) {
      const images = Array.from({ length: n }, (_, k) => k);
      const lots = lotsDe(images, tailleDesLots(n));
      /* Tous pleins (douze, ou tous les écrans sous douze), sauf le plus ancien : le reste, une image partagée et au moins une à lui */
      expect(lots.at(-1), `${n} écrans`).toHaveLength(Math.min(n, ECRANS_PAR_LOT));
      expect(lots.slice(1).every((l) => l.length === ECRANS_PAR_LOT)).toBe(true);
      if (lots.length > 1) expect(lots[0]!.length).toBeGreaterThanOrEqual(2);
      /* Chaque lot reprend la dernière image du précédent ; sans elle, ils redonnent la vidéo, dans l’ordre */
      expect(lots.slice(1).every((l, k) => l[0] === lots[k]!.at(-1))).toBe(true);
      expect(lots.flatMap((l, k) => (k ? l.slice(1) : l))).toEqual(images);
      /* Le prix : les lots (une fois le prompt chacun) et les images envoyées (les partagées deux fois) */
      const envoyees = (d: number[][]) => d.reduce((t, l) => t + l.length, 0);
      const duDebut = lotsDAvant(images, ECRANS_PAR_LOT);
      expect([lots.length, envoyees(lots)]).toEqual([duDebut.length, envoyees(duDebut)]);
      const avant = lotsDAvant(images, tailleDAvant(n));
      expect(lots.length).toBeLessThanOrEqual(avant.length);
      expect(envoyees(lots)).toBeLessThanOrEqual(envoyees(avant));
      /* Une longue vidéo (plus d’un tour de lecteurs) : plus de 56 écrans, avant comme après */
      expect(lots.length > LECTEURS_DE_LOTS).toBe(avant.length > LECTEURS_DE_LOTS);
      expect(lots.length > LECTEURS_DE_LOTS).toBe(n > 56);
    }
    expect([1, 11, 12, 13, 26, 40, 160].map(tailleDesLots)).toEqual([1, 11, 12, 12, 12, 12, 12]);
  });

  it("des écrans lourds : le plus récent aussi plein que le poids le permet, les lots toujours recollés, et pas de boucle sur une image trop lourde", () => {
    /* Vingt écrans, les quatre plus récents lourds (des photos) : le lot le plus récent s’arrête au poids, pas avant */
    const poids = [...Array.from({ length: 16 }, () => 1), 3, 3, 3, 3];
    const lots = lotsDe(
      poids.map((_, k) => k),
      12,
      (k) => poids[k]!,
      14,
    );
    /* Le plus récent : ses quatre lourds et deux légers (14, la borne), le suivant ses douze, le plus ancien le reste */
    expect(lots.map((l) => [l[0], l.at(-1)])).toEqual([
      [0, 3],
      [3, 14],
      [14, 19],
    ]);
    expect(lots.every((l) => l.reduce((t, k) => t + poids[k]!, 0) <= 14)).toBe(true);
    expect(lots.slice(1).every((l, k) => l[0] === lots[k]!.at(-1))).toBe(true);
    /* Chaque image plus lourde que la borne : un lot à elle seule, sans image partagée, et la découpe finit */
    expect(lotsDe([10, 10, 10], 12, (x) => x, 5)).toEqual([[10], [10], [10]]);
  });

  it("une vidéo lue en entier se recolle en la même conv, découpée en partant de la fin, en partant du début ou d’un seul bloc", () => {
    for (const n of [5, 12, 13, 24, 26, 40, 57, 80, IMAGES_MAX]) {
      const ecrans = Array.from({ length: n }, (_, k) => k);
      const recollee = (lots: number[][]) => fusionnerLots(lots.map(lireLeLot), "imessage");
      const apres = recollee(lotsDe(ecrans, tailleDesLots(n)));
      const entiere = lireLeLot(ecrans);
      expect(apres.blocs, `${n} écrans`).toEqual(entiere.blocs);
      expect(apres.captures).toEqual(entiere.captures);
      expect(recollee(lotsDAvant(ecrans, tailleDAvant(n)))).toEqual(apres);
      /* Tous les messages que montrent les écrans, une fois chacun */
      expect(enTexte(apres).messages).toBe(PAS * (n - 1) + VUS);
    }
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

  it("un lot lu reste dans l’onglet, frais une heure, avec la clé de l’envoi qui l’a lu ; sans empreinte, rien n’est gardé", () => {
    const lot = { blocs: [] };
    garderLeLot("lot-a", { lot, cle: "cle-de-l-envoi" });
    expect(lotDejaLu("lot-a")).toEqual({ lot, cle: "cle-de-l-envoi" });
    expect(lotDejaLu("lot-a")?.lot).toBe(lot);
    expect(lotDejaLu("lot-b")).toBeUndefined();
    garderLeLot(null, { lot, cle: "cle-de-l-envoi" });
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
