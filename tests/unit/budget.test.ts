import { describe, expect, it } from "vitest";
import { BUDGET_IA, budgetEpuise, plafondDe, seuilsAtteints } from "@/server/budget";
import { echecDe, ErreurTache, estBudget } from "@/server/erreurs";
import { codePublic } from "@/types/erreurs-api";

/* Le budget de l’IA (src/server/budget.ts) : ses règles, sans base. Ce qu’il lit en base : tests/budget.test.ts */

const $ = (dollars: number) => Math.round(dollars * 1e6);

describe("le budget de l’IA du jour", () => {
  it("vaut 500 $ pour tous, 10 $ par compte, et une part sans compte prise dans les 500 $", () => {
    expect(BUDGET_IA.jour).toBe(500);
    expect(BUDGET_IA.compte).toBe(10);
    expect(plafondDe("compte-1")).toBe($(BUDGET_IA.compte));
    expect(plafondDe(null)).toBe($(BUDGET_IA.anonyme));
    expect(BUDGET_IA.anonyme).toBeLessThan(BUDGET_IA.jour);
  });

  it("laisse partir un appel sous les deux budgets, l’arrête dès que l’un est atteint", () => {
    expect(budgetEpuise({ jour: $(BUDGET_IA.jour - 0.01), payeur: $(BUDGET_IA.compte - 0.01) }, "compte-1")).toBeNull();
    expect(budgetEpuise({ jour: $(10), payeur: $(BUDGET_IA.compte) }, "compte-1")).toBe("compte");
    expect(budgetEpuise({ jour: $(BUDGET_IA.jour), payeur: 0 }, "compte-1")).toBe("jour");
    /* Le budget de tous passe avant celui du compte : c’est lui que le journal dit */
    expect(budgetEpuise({ jour: $(BUDGET_IA.jour + 1), payeur: $(BUDGET_IA.compte + 1) }, "compte-1")).toBe("jour");
    expect(budgetEpuise({ jour: $(10), payeur: $(BUDGET_IA.anonyme) }, null)).toBe("anonyme");
    expect(budgetEpuise({ jour: $(10), payeur: $(BUDGET_IA.anonyme) - 1 }, null)).toBeNull();
  });

  it("prévient l’équipe à 50 % et 80 % du jour, puis quand il est atteint", () => {
    expect(seuilsAtteints($(BUDGET_IA.jour * 0.5 - 0.01))).toEqual([]);
    expect(seuilsAtteints($(BUDGET_IA.jour * 0.5))).toEqual([0.5]);
    expect(seuilsAtteints($(BUDGET_IA.jour * 0.8))).toEqual([0.5, 0.8]);
    expect(seuilsAtteints($(BUDGET_IA.jour))).toEqual([0.5, 0.8, 1]);
  });

  it("se dit « souffle » au navigateur, et à l’écran d’une étape arrêtée", () => {
    expect(codePublic("budget")).toBe("souffle");
    expect(estBudget(new ErreurTache("budget"))).toBe(true);
    expect([estBudget("budget"), estBudget("delai"), estBudget(null)]).toEqual([true, false, false]);
    expect([echecDe("budget"), echecDe("refus:cyber"), echecDe("delai"), echecDe(null)]).toEqual(["souffle", "refus", "panne", "panne"]);
  });
});
