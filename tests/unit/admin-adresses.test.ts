import { describe, expect, it } from "vitest";
import { adresseDe } from "@/app/admin/adresses";

/* Les adresses d’/admin (src/app/admin/adresses.ts) : le résumé à la racine, les rubriques par `?vue=`, la période gardée. */

describe("l’adresse d’une rubrique", () => {
  it("le résumé reste à la racine ; une rubrique s’écrit « ?vue= »", () => {
    expect(adresseDe("/admin", "resume")).toBe("/admin");
    expect(adresseDe("/admin", "tunnel")).toBe("/admin?vue=tunnel");
    expect(adresseDe("/apercu/admin", "couts")).toBe("/apercu/admin?vue=couts");
  });

  it("la période suit, et l’ancre vient en dernier", () => {
    expect(adresseDe("/admin", "resume", "p=30")).toBe("/admin?p=30");
    expect(adresseDe("/admin", "acquisition", "du=2026-10-01&au=2026-10-07", "sources")).toBe("/admin?vue=acquisition&du=2026-10-01&au=2026-10-07#sources");
    expect(adresseDe("/admin", "couts", "", "couts")).toBe("/admin?vue=couts#couts");
  });

  it("le direct et le tournage ont leur page, sans période ; le tournage n’a pas d’aperçu", () => {
    expect(adresseDe("/admin", "direct", "p=30")).toBe("/admin/direct");
    expect(adresseDe("/apercu/admin", "direct")).toBe("/apercu/admin/direct");
    expect(adresseDe("/apercu/admin", "tournage", "p=1")).toBe("/admin/tournage");
  });
});
