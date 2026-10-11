import { describe, expect, it } from "vitest";
import { cleDuCompte, emailCanonique } from "@/server/email-canonique";

/* L’email canonique (src/server/email-canonique.ts) : la boîte où arrive un email, pour ranger les limites (les codes, ce que coûte un compte). */
describe("l’email canonique", () => {
  it("les alias d’une même boîte Gmail n’en font qu’un : casse, +suffixe, points, googlemail.com", () => {
    for (const alias of ["noe@gmail.com", " Noe@Gmail.com ", "noe+blush@gmail.com", "n.o.e@gmail.com", "N.o.e+1+2@googlemail.com"]) expect(emailCanonique(alias), alias).toBe("noe@gmail.com");
  });

  it("ailleurs, le +suffixe part mais les points restent : sur un autre domaine, ce sont deux boîtes", () => {
    expect(emailCanonique("Lea.Martin+test@exemple.fr")).toBe("lea.martin@exemple.fr");
    expect(emailCanonique("lea.martin@exemple.fr")).not.toBe(emailCanonique("leamartin@exemple.fr"));
    /* Un sous-domaine n’est pas Gmail */
    expect(emailCanonique("n.o.e@mail.gmail.com.exemple.fr")).toBe("n.o.e@mail.gmail.com.exemple.fr");
  });

  it("un nom qui n’est fait que d’un « + » ou de points ne devient pas vide ; ce qui n’est pas un email reste tel quel, en minuscules", () => {
    expect(emailCanonique("+abc@exemple.fr")).toBe("+abc@exemple.fr");
    expect(emailCanonique("...@gmail.com")).toBe("...@gmail.com");
    expect(emailCanonique("Pas-Un-Email")).toBe("pas-un-email");
    expect(emailCanonique("@exemple.fr")).toBe("@exemple.fr");
    expect(emailCanonique("noe@")).toBe("noe@");
  });

  it("les limites d’un compte se rangent sur sa boîte : ses alias, ou le même email après « Tout effacer », partagent leurs compteurs", () => {
    expect(cleDuCompte("Noe+bis@gmail.com")).toBe("compte:noe@gmail.com");
    expect(cleDuCompte("n.o.e@googlemail.com")).toBe(cleDuCompte("noe@gmail.com"));
    expect(cleDuCompte("lea@exemple.fr")).not.toBe(cleDuCompte("noe@exemple.fr"));
  });
});
