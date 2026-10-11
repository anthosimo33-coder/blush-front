import { describe, expect, it } from "vitest";
import { moiEtAutre, titreDuo } from "@/lib/participants";
import { IlOuElle, pronomOppose } from "@/lib/pronom";
import { personnesDe, type Meta } from "@/server/histoires";
import { storyAffichee } from "@/server/conv-affichee";
import type { Person, Story } from "@/types";

/* Deux prénoms inventés, dans l’ordre de l’export : Tom (p0), puis Léa (p1) */
const TOM: Person = { id: "p0", name: "Tom", initial: "T" };
const LEA: Person = { id: "p1", name: "Léa", initial: "L" };
const conv = (me?: Person["id"]): Pick<Story, "participants" | "me"> => ({ participants: [TOM, LEA], ...(me ? { me } : {}) });

describe("toi et l’autre, à l’écran (moiEtAutre)", () => {
  it.each([
    ["toi = p0", conv("p0"), undefined, TOM, LEA],
    ["toi = p1", conv("p1"), undefined, LEA, TOM],
    ["toi inconnu : l’autre est le second", conv(), undefined, TOM, LEA],
    ["toi inconnu, le parcours dit p1", conv(), "p1", LEA, TOM],
    ["le serveur passe avant le parcours", conv("p0"), "p1", TOM, LEA],
  ])("%s", (_, story, repli, moi, autre) => {
    expect(moiEtAutre(story, repli)).toEqual({ moi, autre });
  });

  it("le titre du duo garde l’ordre de l’export, quel que soit qui est toi", () => {
    expect(titreDuo(conv("p1"))).toBe("Tom & Léa");
  });
});

describe("le pronom de l’autre", () => {
  it("est l’opposé du tien, et « elle » sans le tien", () => {
    expect(pronomOppose("il")).toBe("elle");
    expect(pronomOppose("elle")).toBe("il");
    expect(pronomOppose(undefined)).toBe("elle");
    expect(IlOuElle(pronomOppose("elle"))).toBe("Il");
  });
});

describe("toi et l’autre, au serveur (personnesDe), la même règle", () => {
  const meta = (moi?: 0 | 1, pronom?: "il" | "elle"): Meta => ({
    appli: "whatsapp",
    format: "whatsapp-ios",
    fichier: "conv.txt",
    participants: [
      { nom: "Tom Martin", prenom: "Tom", messages: 60 },
      { nom: "Léa", prenom: "Léa", messages: 50 },
    ],
    resume: { debut: "2026-09-01", fin: "2026-10-01", total: 110, vocaux: 0 },
    ...(moi == null ? {} : { moi }),
    ...(pronom ? { pronom } : {}),
  });

  it.each([
    [1 as const, "Léa", "Tom"],
    [0 as const, "Tom", "Léa"],
    [undefined, "Tom", "Léa"],
  ])("moi = %s", (moi, prenomMoi, prenomAutre) => {
    const { moi: m, autre } = personnesDe(meta(moi));
    expect([m.prenom, autre.prenom]).toEqual([prenomMoi, prenomAutre]);
    /* L’écran, sur la même conv, désigne le même autre */
    expect(moiEtAutre(storyAffichee("id", meta(moi))).autre.name).toBe(prenomAutre);
  });

  it("l’histoire affichée donne à l’autre le pronom opposé, une fois « Qui es-tu ? » rempli", () => {
    expect(storyAffichee("id", meta(1, "elle")).participants.map((p) => p.pronoun)).toEqual(["il", "elle"]);
    expect(storyAffichee("id", meta()).participants.map((p) => p.pronoun)).toEqual([undefined, undefined]);
  });
});
