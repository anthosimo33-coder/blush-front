import { describe, expect, it } from "vitest";
import { chiffrer, chiffrerCompresse, chiffrerOctets, dechiffrer, dechiffrerOctets, empreinte, jeton, memeEmpreinte } from "@/server/chiffrement";

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

  it("refuse un contenu modifié, compressé ou en octets bruts", () => {
    const compresse = chiffrerCompresse("Léa: coucou\n".repeat(100));
    compresse[compresse.length - 1] ^= 1;
    expect(() => dechiffrer(compresse)).toThrow();
    const octets = chiffrerOctets(Buffer.from("fffb9064", "hex"));
    octets[20] ^= 1;
    expect(() => dechiffrerOctets(octets)).toThrow();
  });

  it("chiffrer, c’est chiffrerOctets sur le JSON : le même format, chacun relit l’autre", () => {
    const valeur = { texte: "on se voit jeudi ?", n: [1, 2] };
    expect(dechiffrerOctets(chiffrer(valeur)).toString("utf8")).toBe(JSON.stringify(valeur));
    expect(dechiffrer(chiffrerOctets(Buffer.from(JSON.stringify(valeur), "utf8")))).toEqual(valeur);
    /* [version 1][iv 12][tag 16][texte chiffré] : autant d’octets que le texte, plus 29 */
    expect(chiffrerOctets(Buffer.from("abc")).length).toBe(3 + 29);
    expect(chiffrer("abc").length).toBe(JSON.stringify("abc").length + 29);
    /* Des octets bruts (un audio) ne sont jamais compressés : relus comme tels, ils sont refusés */
    expect(() => dechiffrerOctets(chiffrerCompresse("x"))).toThrow("Version de chiffrement inconnue : 2");
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
