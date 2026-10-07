import { describe, expect, it } from "vitest";
import { chiffrer, dechiffrer, empreinte, jeton, memeEmpreinte } from "@/server/chiffrement";

describe("chiffrement", () => {
  it("rend ce qu’on a chiffré, sans rien laisser en clair", () => {
    const valeur = { conv: "m0412 2026-03-02 lun. 23:41 Sophie : au fait on est quoi toi et moi mdr", n: 3 };
    const b = chiffrer(valeur);
    expect(b.toString("utf8")).not.toContain("Sophie");
    expect(dechiffrer(b)).toEqual(valeur);
  });

  it("refuse un contenu modifié", () => {
    const b = chiffrer({ a: 1 });
    b[b.length - 1] ^= 1;
    expect(() => dechiffrer(b)).toThrow();
  });

  it("deux chiffrements du même contenu diffèrent", () => {
    expect(chiffrer("x").equals(chiffrer("x"))).toBe(false);
  });

  it("compare les empreintes", () => {
    const j = jeton();
    expect(memeEmpreinte(j, empreinte(j))).toBe(true);
    expect(memeEmpreinte(j, empreinte(jeton()))).toBe(false);
  });
});
