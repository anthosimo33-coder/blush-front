import { describe, expect, it } from "vitest";
import { accroche, nommer } from "@/app/lecture/Paywall";

describe("l’accroche du paywall", () => {
  it("une trouvaille qui commence par « Elle » ou « Il » nomme l’autre ; les autres restent telles quelles", () => {
    expect(nommer("Elle ouvre la conv 7\u00a0jours sur\u00a010", "Léa")).toBe("Léa ouvre la conv 7\u00a0jours sur\u00a010");
    expect(nommer("Il relance 2\u00a0fois plus que toi", "Hugo")).toBe("Hugo relance 2\u00a0fois plus que toi");
    expect(nommer("Tu relances 2\u00a0fois plus qu’elle", "Léa")).toBe("Tu relances 2\u00a0fois plus qu’elle");
    expect(nommer("Elleonore", "Léa")).toBe("Elleonore");
  });

  it("le titre : le premier déséquilibre, qui nomme l’autre ; dessous, la trouvaille suivante puis la promesse", () => {
    expect(accroche(["Votre mot à vous\u00a0: «\u00a0pistache\u00a0»\u00a0×\u00a0315", "Elle ouvre la conv 7\u00a0jours sur\u00a010"], "Léa")).toEqual({
      titre: "Léa ouvre la conv 7\u00a0jours sur\u00a010.",
      sous: "Votre mot à vous\u00a0: «\u00a0pistache\u00a0»\u00a0×\u00a0315. BLUSH te dit ce que ça veut dire.",
    });
    expect(accroche(["Tu relances 2\u00a0fois plus qu’elle"], "Léa")).toEqual({ titre: "Tu relances 2\u00a0fois plus qu’elle.", sous: "BLUSH te dit ce que ça veut dire." });
  });

  it("sans déséquilibre, le rapport qui l’attend ; la première trouvaille passe dessous", () => {
    expect(accroche(["Vous vous répondez en 6\u00a0min", "64\u00a0messages en 4\u00a0jours"], "Léa")).toEqual({
      titre: "Ton rapport sur toi et Léa n’attend que toi.",
      sous: "Vous vous répondez en 6\u00a0min. BLUSH te dit ce que ça veut dire.",
    });
    expect(accroche([], "Léa")).toEqual({ titre: "Ton rapport sur toi et Léa n’attend que toi.", sous: "BLUSH te dit ce que ça veut dire." });
  });
});
