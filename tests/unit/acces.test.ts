import { describe, expect, it } from "vitest";
import { peut, rang, type Besoin } from "@/lib/acces";
import type { Plan } from "@/types";

/*
 * Ce que chaque plan ouvre : le paiement qui s’ouvre à l’écran (AppScreen) et le refus du serveur (402) lisent la même
 * table. Une offre qui change de plan change ici, et les deux suivent.
 */
const PLANS: Plan[] = ["gratuit", "rapport", "blushplus"];
const OUVRE: Record<Plan, Record<Besoin, boolean>> = {
  gratuit: { rapport: false, question: false, chat: false, fiche: false },
  rapport: { rapport: true, question: true, chat: false, fiche: false },
  blushplus: { rapport: true, question: true, chat: true, fiche: true },
};

describe("les droits par plan", () => {
  it.each(PLANS.flatMap((plan) => (Object.keys(OUVRE[plan]) as Besoin[]).map((besoin) => [plan, besoin, OUVRE[plan][besoin]] as const)))("%s, %s : %s", (plan, besoin, attendu) => {
    expect(peut(plan, besoin)).toBe(attendu);
  });

  it("les plans se suivent : chacun ouvre au moins ce qu’ouvre celui d’avant", () => {
    expect(PLANS.map(rang)).toEqual([0, 1, 2]);
    for (let k = 1; k < PLANS.length; k++)
      for (const besoin of Object.keys(OUVRE.gratuit) as Besoin[]) if (peut(PLANS[k - 1], besoin)) expect(peut(PLANS[k], besoin)).toBe(true);
  });
});
