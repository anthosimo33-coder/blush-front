/*
 * Les mots qui reviennent (prompts/lib/conv.ts : VIDES, RIRE) et « Votre mot à vous » (src/server/ecrans/trouvailles.ts :
 * BANALS) pour une conv écrite en anglais, en espagnol ou en portugais : ni leurs mots outils, ni leurs rires tapés au
 * hasard, ni leurs mots courts allongés ; leur politesse reste pour le modèle, mais n’est pas « leur mot ». Une conv
 * française n’y perd aucun de ses vrais mots. Les conversations sont inventées.
 */
import { describe, expect, it } from "vitest";
import { chiffrer, lire } from "@prompts/lib/conv";
import { trouvailles } from "@/server/ecrans/trouvailles";

const NB = String.fromCharCode(0xa0);
const pad = (n: number) => String(n).padStart(2, "0");
const fois = <T>(n: number, f: (k: number) => T) => Array.from({ length: n }, (_, k) => f(k));
/** Un export iOS de ces textes, Léa et Tom tour à tour, un message toutes les deux heures depuis le 1er mars 2026. */
const exportDe = (textes: string[]) =>
  textes
    .map((t, k) => {
      const d = new Date(Date.UTC(2026, 2, 1, 9) + k * 2 * 3600e3);
      return `[${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/2026 ${pad(d.getUTCHours())}:00:00] ${["Léa", "Tom"][k % 2]}: ${t}`;
    })
    .join("\n");
const h = {
  utilisateur: { prenom: "Tom", pronom: "il" as const, nomExport: "Tom" },
  autre: { prenom: "Léa", pronom: "elle" as const, nomExport: "Léa" },
  format: "whatsapp-ios" as const,
};
const lus = (textes: string[]) => {
  const { messages } = lire(exportDe(textes), h, { autresEnTexte: true });
  const c = chiffrer(h, messages);
  return { c, mots: c.recurrents.map(([w]) => w), t: trouvailles(c, h, messages) };
};
const motAVous = (mot: string, n: number) => `Votre mot à vous${NB}: «${NB}${mot}${NB}»${NB}×${NB}${n}`;

describe("les mots de tous les jours en anglais, en espagnol et en portugais", () => {
  it("leurs mots outils, leurs rires tapés au hasard et leurs mots courts allongés ne reviennent pas", () => {
    const { mots, t } = lus([
      ...fois(8, () => "wait what"),
      /* Deux fois chacun : un mot écrit une seule fois ne revient jamais, vide ou non */
      ...["omggg", "omgg", "nope", "same tbh", "whatever", "ughhh"].flatMap((x) => [x, x]),
      ...fois(12, (k) => ["claro", "obvio", "dale", "¿cómo estás?", "después te digo", "ahorita"][k % 6]!),
      ...fois(12, (k) => ["tipo assim", "nossa", "a gente vai", "eles", "simmm", "nãooo"][k % 6]!),
      ...fois(
        16,
        (k) =>
          [
            "ajajajaja",
            "jajsjsjs",
            "JAJSJAJS",
            "kjkjkj",
            "kkkjkj",
            "huehuehue",
            "huahuahua",
            "aushaushaus",
            "bahahaha",
            "kakakaka",
            "hshshs",
            "jkjk",
            "jaksjaks",
            "ashuashu",
            "hauhau",
            "kekeke",
          ][k]!,
      ).flatMap((x) => [x, x]),
      ...fois(6, () => "bora na praia"),
    ]);
    expect(mots).toContain("praia");
    for (const w of [
      "omggg",
      "omgg",
      "nope",
      "same",
      "whatever",
      "ughhh",
      "claro",
      "obvio",
      "dale",
      "cómo",
      "estás",
      "después",
      "digo",
      "ahorita",
      "tipo",
      "assim",
      "nossa",
      "gente",
      "eles",
      "simmm",
      "nãooo",
    ])
      expect(mots).not.toContain(w);
    for (const w of [
      "ajajajaja",
      "jajsjsjs",
      "kjkjkj",
      "kkkjkj",
      "huehuehue",
      "huahuahua",
      "aushaushaus",
      "bahahaha",
      "kakakaka",
      "hshshs",
      "jkjk",
      "jaksjaks",
      "ashuashu",
      "hauhau",
      "kekeke",
    ])
      expect(mots).not.toContain(w);
    /* « wait » reste pour le modèle, mais n’est pas leur mot */
    expect(mots).toContain("wait");
    expect(t.find((x) => x.startsWith("Votre mot à vous"))).not.toContain("wait");
  });

  it("leur politesse et leurs jours restent pour le modèle, mais ne sont pas leur mot ; « sexta-feira » reste entier", () => {
    const { c, t } = lus([
      ...fois(8, () => "gracias"),
      ...fois(7, () => "obrigada"),
      ...fois(7, () => "buenas noches"),
      ...fois(6, () => "sexta-feira"),
      ...fois(5, () => "el concierto"),
    ]);
    expect(c.recurrents).toEqual(
      expect.arrayContaining([
        ["gracias", 8],
        ["sexta-feira", 6],
        ["concierto", 5],
      ]),
    );
    expect(c.recurrents.map(([w]) => w)).not.toContain("feira");
    expect(t).toContain(motAVous("concierto", 5));
  });

  it("l’apostrophe des claviers espagnols (« didn´t ») est une apostrophe", () => {
    const { mots } = lus([...fois(8, () => "didn´t"), ...fois(8, () => "didn‘t"), ...fois(5, () => "un libanais")]);
    expect(mots).toEqual(["libanais"]);
  });

  it("aucun vrai mot français ne devient vide ni banal", () => {
    const francais = ["pain", "main", "sale", "fine", "sobre", "solo", "pois", "fixe", "onde", "logo", "kaki", "kaka", "tarde", "show", "miss", "algo", "légal", "bora", "bahut"];
    /* Ni vide : tous restent dans les mots qui reviennent */
    for (const lot of [francais.slice(0, 10), francais.slice(10)]) {
      const { c } = lus(lot.flatMap((w) => fois(6, () => `le ${w}`)));
      expect(new Set(c.recurrents.map(([w]) => w))).toEqual(new Set(lot));
    }
    /* Ni banal : chacun, seul, devient leur mot */
    for (const w of francais) expect(lus(fois(6, () => `le ${w}`)).t).toContain(motAVous(w, 6));
  });

  it("« dice » et « tens » sont des mots pleins en anglais : ils restent pour le modèle, mais l’espagnol et le portugais ne les donnent pas pour leur mot", () => {
    const { mots, t } = lus([...fois(6, () => "bring the dice"), ...fois(5, () => "tens of people")]);
    expect(mots).toEqual(expect.arrayContaining(["dice", "tens", "bring", "people"]));
    expect(t.find((x) => x.startsWith("Votre mot à vous"))).toBe(motAVous("bring", 6));
  });
});
