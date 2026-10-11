import { describe, expect, it } from "vitest";
import { champInvalide, emailValide } from "@/lib/email";

/* La forme d’un email dans le navigateur (src/lib/email.ts), et quand le champ le dit (champInvalide) */

describe("emailValide", () => {
  it.each(["sam@exemple.fr", "  sam.durand+blush@mail.exemple.com  ", "a@b.co"])("accepte « %s »", (email) => {
    expect(emailValide(email)).toBe(true);
  });

  it.each(["", "sam", "sam@", "sam@exemple", "sam@exemple.f", "sam durand@exemple.fr", "sam@@exemple.fr", "@exemple.fr"])("refuse « %s »", (email) => {
    expect(emailValide(email)).toBe(false);
  });
});

describe("champInvalide", () => {
  const base = { email: "sam", valide: false, probleme: null, touche: true };

  it("un email mal formé, une fois le champ quitté", () => {
    expect(champInvalide(base)).toBe(true);
    expect(champInvalide({ ...base, touche: false })).toBe(false);
  });

  it("un champ vide n’est jamais en erreur de forme", () => {
    expect(champInvalide({ ...base, email: "" })).toBe(false);
  });

  it("un envoi raté met le champ en erreur, même bien formé et jamais quitté", () => {
    expect(champInvalide({ email: "sam@exemple.fr", valide: true, probleme: "Ça n’a pas marché.", touche: false })).toBe(true);
  });
});
