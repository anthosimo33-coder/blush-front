import { describe, expect, it } from "vitest";
import type { Message } from "@prompts/lib/conv";
import { PAYWALL } from "@/contenu/paiement";
import { apercuDuPaywall } from "@/server/ecrans/haut-du-paywall";

/*
 * Les chapitres du paywall dits en questions (une proposition du 22 octobre 2026), le 1er d’après ce que tu veux savoir
 * sur « Qui es-tu ? », que l’aperçu du paywall porte. Une conv fabriquée, deux prénoms inventés (Inès et Lucas).
 */

const H = 3600e3;
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

describe("les chapitres en questions, sur le paywall", () => {
  it("l’aperçu porte ce que tu veux savoir ; sans « Qui es-tu ? », le haut seul", () => {
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
    expect(apercuDuPaywall(chiffres, conv, { objectif: "reciproque" }).objectif).toBe("reciproque");
    expect(apercuDuPaywall(chiffres, conv)).not.toHaveProperty("objectif");
  });

  it("le 1er chapitre dit ce que tu veux savoir (sinon : est-il intéressé ?), le 5e son prénom", () => {
    expect(PAYWALL.chapitre(1, "Lucas", true, "ensemble")).toBe("Est-ce qu’il veut la même chose\u00a0?");
    expect(PAYWALL.chapitre(1, "Lucas", true, "reciproque")).toBe("Est-ce que c’est réciproque\u00a0?");
    expect(PAYWALL.chapitre(1, "Léa", false)).toBe("Est-ce qu’elle est intéressée\u00a0?");
    expect(PAYWALL.chapitre(5, "Léa", false)).toBe("Léa, décryptée");
    expect(PAYWALL.chapitre(8, "Léa", false)).toBe("Quoi lui répondre maintenant");
  });
});
