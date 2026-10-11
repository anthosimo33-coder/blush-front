import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

/* after() de Next ne vit que dans une requête : ici, ce qui devait partir après la réponse est gardé, et lancé à la main */
const apres = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => apres.push(f) }));
/* L’état des tâches, compté : le rapport, relu toutes les 2 s pendant son écriture, ne le lit qu’une fois par appel */
vi.mock("@/server/taches", async (original) => {
  const m = await original<typeof import("@/server/taches")>();
  return { ...m, etatDesTaches: vi.fn(m.etatDesTaches) };
});

import { db, schema } from "@/server/db";
import { rapportDe } from "@/server/donnees";
import { histoireOuverte } from "@/server/histoires";
import { etatDesTaches } from "@/server/taches";
import { compteDeTest, histoireLue } from "./aide/fixtures";

const lues = vi.mocked(etatDesTaches);

describe("le rapport pendant son écriture", () => {
  it("lit l’état des tâches une fois par appel, et montre l’écriture dès qu’elle est lancée", async () => {
    const u = await compteDeTest("rapport-taches");
    const imp = await histoireLue(u, "06-elle-hesite.txt");

    /* Sans l’accès : ni l’écriture ni le vocal ne sont regardés */
    lues.mockClear();
    expect((await rapportDe((await histoireOuverte(u, { affichee: imp.id }))!, u))?.generating).toBe(false);
    expect(lues).not.toHaveBeenCalled();

    /* L’accès arrive : le rapport part, et l’état est relu une fois pour montrer l’écriture tout de suite */
    const plus = { ...u, plan: "blushplus" as const };
    await db().update(schema.users).set({ plan: "blushplus" }).where(eq(schema.users.id, u.id));
    const ligne = (await histoireOuverte(plus, { affichee: imp.id }))!;
    lues.mockClear();
    const lance = await rapportDe(ligne, plus);
    expect(lance?.generating).toBe(true);
    expect(lance?.ecriture?.etape).toBe("plan");
    expect(lues).toHaveBeenCalledTimes(2);

    /* Les relectures suivantes : une seule lecture de l’état */
    lues.mockClear();
    expect((await rapportDe(ligne, plus))?.ecriture?.etape).toBe("plan");
    expect(lues).toHaveBeenCalledTimes(1);

    apres.length = 0;
  });
});
