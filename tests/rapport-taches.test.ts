import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* after() de Next ne vit que dans une requête : ici, ce qui devait partir après la réponse est gardé, et lancé à la main */
const apres = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => apres.push(f) }));
/* L’état des tâches, compté : le rapport, relu toutes les 2 s pendant son écriture, ne le lit qu’une fois par appel */
vi.mock("@/server/taches", async (original) => {
  const m = await original<typeof import("@/server/taches")>();
  return { ...m, etatDesTaches: vi.fn(m.etatDesTaches) };
});

import { executerChaine } from "@/server/analyse";
import type { Utilisateur } from "@/server/auth";
import { db, schema } from "@/server/db";
import { rapportDe } from "@/server/donnees";
import { definirQui, depuisFichier, histoireOuverte, importer, rattacherBrouillon } from "@/server/histoires";
import { definirFactice } from "@/server/ia/claude";
import { fournisseurFactice } from "@/server/ia/factice";
import { etatDesTaches, planifier } from "@/server/taches";

const email = `rapport-taches-${Date.now()}@blush.test`;
const lues = vi.mocked(etatDesTaches);
let u: Utilisateur;

beforeAll(async () => {
  definirFactice(fournisseurFactice);
  [u] = await db().insert(schema.users).values({ email }).returning();
});
afterAll(async () => {
  await db().delete(schema.users).where(inArray(schema.users.email, [email]));
  definirFactice(null);
});

describe("le rapport pendant son écriture", () => {
  it("lit l’état des tâches une fois par appel, et montre l’écriture dès qu’elle est lancée", async () => {
    const imp = await importer(await depuisFichier(new File([readFileSync("prompts/evals/convs/06-elle-hesite.txt")], "06-elle-hesite.txt", { type: "text/plain" })));
    await rattacherBrouillon(u, imp.secret);
    await definirQui(imp.id, { moi: 0, pronom: "il", devinette: "vus", objectif: "ensemble" });
    await planifier(imp.id, "verdict");
    await executerChaine(imp.id);

    /* Sans l’accès : ni l’écriture ni le vocal ne sont regardés */
    lues.mockClear();
    expect((await rapportDe((await histoireOuverte(u, { affichee: imp.id }))!, u))?.generating).toBe(false);
    expect(lues).not.toHaveBeenCalled();

    /* L’accès arrive : le rapport part, et l’état est relu une fois pour montrer l’écriture tout de suite */
    const plus = { ...u, plan: "blushplus" };
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
