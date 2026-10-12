import { describe, expect, it } from "vitest";
import { peut } from "@/lib/acces";

/*
 * Ce que le compte ouvre à l’écran (AppScreen), depuis le paiement à l’unité : sa fiche, à un client seulement. Le
 * serveur tient la même règle (estClient, src/server/droits.ts, testé avec la base dans tests/droits.test.ts) ; le
 * rapport, lui, s’ouvre conv par conv, et le chat à tout compte connecté.
 */
describe("les droits du compte à l’écran", () => {
  it.each([
    [true, true],
    [false, false],
  ])("client : %s, sa fiche : %s", (client, attendu) => {
    expect(peut({ client }, "fiche")).toBe(attendu);
  });
});
