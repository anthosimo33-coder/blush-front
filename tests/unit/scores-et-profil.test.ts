import { describe, expect, it } from "vitest";
import type { Chiffres, Message } from "@prompts/lib/conv";
import { profil } from "@prompts/lib/style";
import { scores } from "@/server/ecrans/rapport";

/*
 * Ce que le code calcule seul, sans le modèle ni la base : les scores du chapitre 1 (qui ouvre, qui reprend, qui
 * relance, qui répond vite) et le profil d’écriture de l’utilisateur. Deux prénoms inventés.
 */
const QUI = { utilisateur: { prenom: "Tom", pronom: "il" as const, nomExport: "Tom" }, autre: { prenom: "Léa", pronom: "elle" as const, nomExport: "Léa" } };

const chiffres = ({ ouvre = [0, 0], delai = [null, null] }: { ouvre?: [number, number]; delai?: [number | null, number | null] }): Chiffres => ({
  qui: { toi: "Tom", autre: "Léa" },
  total: { toi: 0, autre: 0 },
  medias: { toi: {}, autre: {} },
  debut: null,
  fin: null,
  joursActifs: 0,
  ouvre: { toi: ouvre[0], autre: ouvre[1] },
  reprend: { toi: 0, autre: 0 },
  relance: { toi: 0, autre: 0 },
  delai: { toi: delai[0], autre: delai[1] },
  soir: { toi: "", autre: "" },
  longueurs: [],
  motsMoyens: { toi: "—", autre: "—" },
  recurrents: [],
  approx: 0,
});
/* La ligne « qui ouvre la journée » : la première des scores */
const ouvre = (toi: number, autre: number) => scores(chiffres({ ouvre: [toi, autre] }))[0];

describe("les scores du chapitre 1", () => {
  it.each([
    [56, 44, "toi"],
    [55, 45, "pareil"],
    [45, 55, "pareil"],
    [44, 56, "elle"],
  ] as const)("%i contre %i : %s (seuils : 56 et 44)", (toi, autre, gagnant) => {
    expect(ouvre(toi, autre)).toMatchObject({ winner: gagnant, toiPercent: toi });
  });

  it("le gagnant a sa légende, en fois sur 10 ; à égalité, les deux comptes", () => {
    expect(ouvre(7, 3)).toMatchObject({ captionLeft: "toi, 7 fois sur 10" });
    expect(ouvre(7, 3)!.captionRight).toBeUndefined();
    expect(ouvre(3, 7)).toMatchObject({ captionRight: "léa, 7 fois sur 10" });
    /* L’insécable avant « : » : le compte ne part pas seul à la ligne */
    expect(ouvre(5, 5)).toMatchObject({ captionLeft: "toi\u00a0: 5", captionRight: "léa\u00a0: 5" });
  });

  it("rien à comparer (des captures sans heures) : à égalité, au milieu", () => {
    expect(ouvre(0, 0)).toMatchObject({ winner: "pareil", toiPercent: 50 });
  });

  it("qui répond vite : le plus rapide gagne, à moins d’une minute d’écart c’est pareil", () => {
    const vite = (toi: number | null, autre: number | null) => scores(chiffres({ delai: [toi, autre] }))[3];
    expect(vite(5 * 60e3, 2 * 3600e3)).toMatchObject({ winner: "toi", toiPercent: 96, captionLeft: "5 min", captionRight: "2 h" });
    expect(vite(2 * 3600e3, 5 * 60e3)).toMatchObject({ winner: "elle", toiPercent: 4 });
    expect(vite(5 * 60e3, 5.5 * 60e3)).toMatchObject({ winner: "pareil", toiPercent: 50 });
    expect(vite(null, 5 * 60e3)).toMatchObject({ winner: "pareil", toiPercent: 50, captionLeft: "—" });
  });
});

describe("le profil d’écriture", () => {
  let k = 0;
  const m = (role: Message["role"], texte: string, media?: Message["media"]): Message => ({
    id: `m${++k}`,
    t: k * 60e3,
    nom: role === "toi" ? "Tom" : "Léa",
    role,
    texte,
    approx: false,
    ligne: k,
    ...(media ? { media } : {}),
  });
  const messages = [
    m("toi", "Salut ça va ?"),
    m("toi", "mdr t’es sûre"),
    m("autre", "oui et toi"),
    m("toi", "On se voit demain."),
    m("autre", "ok"),
    m("toi", "mdr ok bb 😊"),
    m("toi", "bb tu me manques 😊"),
    m("toi", "", "photo"),
  ];

  it("se mesure sur ses messages écrits, ses rafales comptent aussi ses médias", () => {
    const p = profil(QUI, messages);
    expect(p).toMatchObject({
      n: 5,
      /* 3, 4, 4, 4 et 5 mots */
      mediane: 4,
      /* Des rafales de 2, 1 et 3 bulles */
      rafale: 2,
      majuscule: 40,
      point: 20,
      emojis: [["😊", 2]],
      abreviations: [["mdr", 2]],
      surnoms: [["bb", 2]],
    });
    expect(p.bloc).toContain("Tom");
    expect(p.bloc).toContain("Léa");
  });

  it("une abréviation ou un surnom vu une seule fois ne compte pas", () => {
    expect(profil(QUI, messages.slice(0, 6))).toMatchObject({ abreviations: [["mdr", 2]], surnoms: [] });
  });

  it("une abréviation allongée compte sous sa forme courte (« mdrrr » est « mdr »)", () => {
    const allongees = ["mdrrr", "mdrrrr", "MDRRR t’es bête", "ptdrrr", "ptdrrrrr", "jsp", "jsp", "jsp", "cccc", "cc", "frrr", "frr"].map((t) => m("toi", t));
    expect(profil(QUI, allongees).abreviations).toEqual([
      ["mdr", 3],
      ["jsp", 3],
      ["ptdr", 2],
      ["cc", 2],
      ["frr", 2],
    ]);
  });

  it("le repère d’un média après sa légende n’est pas un mot écrit (« trop bien 😍 [réponse à une story] » : 3 mots)", () => {
    /* La lecture d’une réponse à une story d’Instagram (lib/instagram.ts, lib/conv.ts), et d’une photo légendée */
    const legendes = [...Array.from({ length: 6 }, () => m("toi", "trop bien 😍 [réponse à une story]")), m("toi", "regarde [photo]"), m("toi", "ok"), m("toi", "ok")];
    expect(profil(QUI, legendes)).toMatchObject({ n: 9, mediane: 3, emojis: [["😍", 6]] });
  });
});
