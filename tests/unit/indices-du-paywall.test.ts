import { describe, expect, it } from "vitest";
import type { Message } from "@prompts/lib/conv";
import { PAYWALL } from "@/contenu/paiement";
import { apercuDuPaywall } from "@/server/ecrans/haut-du-paywall";
import { indices, moments } from "@/server/ecrans/indices";

/*
 * Ta question, les indices et les moments cachés du paywall (une proposition du 22 octobre 2026) : comptés par le code
 * sur des convs fabriquées, deux prénoms inventés (Inès et Lucas), et leurs textes.
 */

const H = 3600e3;
const J = 24 * H;
const DEBUT = Date.parse("2026-03-01T10:00:00Z");

let n = 0;
/** Un message fabriqué : de toi ou de lui, `t` en millisecondes depuis le 1er mars à 10 h. */
const msg = (role: "toi" | "autre", texte: string, t: number, autres: Partial<Message> = {}): Message => ({
  id: `m${String(++n).padStart(4, "0")}`,
  t: DEBUT + t,
  nom: role === "toi" ? "Inès" : "Lucas",
  role,
  texte,
  approx: false,
  ligne: n,
  ...autres,
});

describe("les indices : des mots comptés de chaque côté", () => {
  it("un écart net (3 messages au moins, 2 fois plus d’un côté, ou l’autre jamais), deux au plus, dans l’ordre des mots", () => {
    const conv = [
      msg("toi", "tu me manques", 0),
      msg("toi", "Tu me manques trop", H),
      msg("toi", "tu m’manques", 2 * H),
      msg("autre", "on se voit samedi ?", 3 * H),
      msg("autre", "on se voit quand alors", 4 * H),
      msg("autre", "t’es dispo quand ?", 5 * H),
      msg("toi", "bonne nuit", 6 * H),
      msg("autre", "bonne nuit", 7 * H),
      msg("toi", "désolée", 8 * H),
      msg("autre", "dsl", 9 * H),
      msg("toi", "pardon", 10 * H),
      msg("autre", "❤️", 11 * H),
    ];
    expect(indices(conv)).toEqual([
      { id: "manques", toi: 3, elle: 0 },
      { id: "voir", toi: 0, elle: 3 },
    ]);
  });

  it("un mot entier seulement, et rien sans écart net", () => {
    const conv = [
      msg("toi", "dslx", 0),
      msg("toi", "jtmmm", H),
      msg("autre", "désolé", 2 * H),
      msg("toi", "désolé", 3 * H),
      msg("autre", "pardon", 4 * H),
      msg("toi", "pardon", 5 * H),
    ];
    expect(indices(conv)).toEqual([]);
  });

  it("leur texte : son prénom, puis toi, « jamais » pour zéro", () => {
    expect(PAYWALL.question.indice({ id: "manques", toi: 6, elle: 0 }, "Lucas")).toBe("«\u00a0tu me manques\u00a0»\u00a0: Lucas jamais, toi 6\u00a0fois");
    expect(PAYWALL.question.indice({ id: "voir", toi: 2, elle: 9 }, "Léa")).toBe("Proposer de se voir\u00a0: Léa 9\u00a0fois, toi 2\u00a0fois");
  });
});

describe("les moments cachés : de vrais messages de leur conv", () => {
  it("le tien qu’il a mis le plus de temps à te répondre (2 h à 7 jours, aux heures sûres), et son plus long (25 mots au moins)", () => {
    const long = Array.from({ length: 30 }, (_, i) => `mot${i}`).join(" ");
    const conv = [
      msg("toi", "tu fais quoi ce soir", 0),
      msg("autre", "rien de spécial et toi", 3 * H),
      msg("toi", "on se fait un ciné demain ?", 4 * H),
      msg("autre", "ah ouais pourquoi pas", 4 * H + 14 * H),
      msg("toi", "ça dit quoi depuis tout ce temps", 20 * J),
      msg("autre", "désolé j’étais pas là", 30 * J),
      msg("toi", "réponds stp je sais", 31 * J, { approx: "heure" }),
      msg("autre", "oui", 33 * J),
      msg("autre", long, 34 * J),
    ];
    const [attente, plusLong, ...rien] = moments(conv, null);
    expect(attente).toEqual({ id: "attente", de: "toi", texte: "on se fait un ciné demain ?", jour: "2026-03-01", valeur: 14 * H });
    expect(plusLong).toMatchObject({ id: "long", de: "elle", valeur: 30, jour: "2026-04-04" });
    expect(rien).toEqual([]);
  });

  it("avec une chute : son premier message écrit du jour où ça a changé, en premier ; un texte trop long coupé à un mot", () => {
    const tres = `${"blabla ".repeat(40)}fin`;
    const conv = [msg("autre", "ok", 11 * J), msg("autre", tres, 11 * J + H), msg("toi", "cool", 11 * J + 2 * H)];
    const [bascule] = moments(conv, { depuis: "2026-03-12", avant: 30, apres: 10, semaines: [], coupure: 0, delai: null });
    expect(bascule).toMatchObject({ id: "bascule", de: "elle", jour: "2026-03-12" });
    expect(bascule!.texte.length).toBeLessThanOrEqual(161);
    expect(bascule!.texte.endsWith("blabla…")).toBe(true);
  });

  it("le même message n’est montré qu’une fois", () => {
    const long = Array.from({ length: 30 }, (_, i) => `mot${i}`).join(" ");
    const conv = [msg("toi", "hello", 0), msg("autre", long, 11 * J)];
    expect(moments(conv, { depuis: "2026-03-12", avant: 30, apres: 10, semaines: [], coupure: 0, delai: null }).map((m) => m.id)).toEqual(["bascule"]);
  });
});

describe("ta question, sur le paywall", () => {
  it("l’aperçu la rend avec la devinette, les indices et les moments ; sans elle, le haut seul", () => {
    const conv = [msg("toi", "tu me manques", 0), msg("toi", "tu me manques", H), msg("toi", "tu me manques", 2 * H)];
    const chiffres = {
      qui: { toi: "Inès", autre: "Lucas" },
      total: { toi: 3, autre: 0 },
      medias: { toi: {}, autre: {} },
      debut: "2026-03-01",
      fin: "2026-03-01",
      joursActifs: 1,
      ouvre: { toi: 1, autre: 0 },
      reprend: { toi: 0, autre: 0 },
      relance: { toi: 0, autre: 0 },
      delai: { toi: null, autre: null },
      soir: { toi: "0 %", autre: "0 %" },
      longueurs: [],
      motsMoyens: { toi: 3, autre: 0 },
      recurrents: [],
      approx: 0,
    };
    const avec = apercuDuPaywall(chiffres, conv, { devinette: "flou", objectif: "reciproque" });
    expect(avec.question).toEqual({ devinette: "flou", objectif: "reciproque" });
    expect(avec.indices).toEqual([{ id: "manques", toi: 3, elle: 0 }]);
    expect(avec.moments).toEqual([]);
    expect(apercuDuPaywall(chiffres, conv)).not.toHaveProperty("question");
  });

  it("sa question d’après son objectif, et le 1er chapitre dit comme elle (sinon : est-il intéressé ?)", () => {
    expect(PAYWALL.question.texte("ensemble", "Lucas", true)).toBe("Est-ce que Lucas veut la même chose que toi\u00a0?");
    expect(PAYWALL.chapitre(1, "Lucas", true, "reciproque")).toBe("Est-ce que c’est réciproque\u00a0?");
    expect(PAYWALL.chapitre(1, "Léa", false)).toBe("Est-ce qu’elle est intéressée\u00a0?");
    expect(PAYWALL.chapitre(5, "Léa", false)).toBe("Léa, décryptée");
    expect(PAYWALL.chapitre(8, "Léa", false)).toBe("Quoi lui répondre maintenant");
    expect(PAYWALL.question.devinette("flou")).toBe("Toi, tu dis «\u00a0c’est flou\u00a0». Ses messages disent");
  });
});
