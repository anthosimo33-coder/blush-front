import { describe, expect, it } from "vitest";
import { BUDGET_IA, budgetEpuise, plafondDe, seuilsAtteints } from "@/server/budget";
import { echecDe, ErreurTache, estBudget } from "@/server/erreurs";
import { codePublic } from "@/types/erreurs-api";

/* Le budget de l’IA (src/server/budget.ts) : ses règles, sans base. Ce qu’il lit en base : tests/budget.test.ts */

const $ = (dollars: number) => Math.round(dollars * 1e6);

describe("le budget de l’IA du jour", () => {
  it("vaut 30 $ pour tous, 3 $ par compte, et une part sans compte prise dans les 30 $", () => {
    expect(BUDGET_IA.jour).toBe(30);
    expect(plafondDe("compte-1")).toBe($(3));
    expect(plafondDe(null)).toBe($(BUDGET_IA.anonyme));
    expect(BUDGET_IA.anonyme).toBeLessThan(BUDGET_IA.jour);
  });

  it("laisse partir un appel sous les deux budgets, l’arrête dès que l’un est atteint", () => {
    expect(budgetEpuise({ jour: $(29.99), payeur: $(2.99) }, "compte-1")).toBeNull();
    expect(budgetEpuise({ jour: $(10), payeur: $(3) }, "compte-1")).toBe("compte");
    expect(budgetEpuise({ jour: $(30), payeur: 0 }, "compte-1")).toBe("jour");
    /* Le budget de tous passe avant celui du compte : c’est lui que le journal dit */
    expect(budgetEpuise({ jour: $(31), payeur: $(4) }, "compte-1")).toBe("jour");
    expect(budgetEpuise({ jour: $(10), payeur: $(BUDGET_IA.anonyme) }, null)).toBe("anonyme");
    expect(budgetEpuise({ jour: $(10), payeur: $(BUDGET_IA.anonyme) - 1 }, null)).toBeNull();
  });

  it("prévient l’équipe à 50 % et 80 % du jour, puis quand il est atteint", () => {
    expect(seuilsAtteints($(14.99))).toEqual([]);
    expect(seuilsAtteints($(15))).toEqual([0.5]);
    expect(seuilsAtteints($(24))).toEqual([0.5, 0.8]);
    expect(seuilsAtteints($(30))).toEqual([0.5, 0.8, 1]);
  });

  it("se dit « souffle » au navigateur, et à l’écran d’une étape arrêtée", () => {
    expect(codePublic("budget")).toBe("souffle");
    expect(estBudget(new ErreurTache("budget"))).toBe(true);
    expect([estBudget("budget"), estBudget("delai"), estBudget(null)]).toEqual([true, false, false]);
    expect([echecDe("budget"), echecDe("refus:cyber"), echecDe("delai"), echecDe(null)]).toEqual(["souffle", "refus", "panne", "panne"]);
  });
});
