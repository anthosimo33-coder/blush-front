import { readFileSync } from "node:fs";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db";
import { depuisFichier, importer } from "@/server/histoires";
import { statsAdmin } from "@/server/stats";
import { PERIME_S, planifier } from "@/server/taches";

/*
 * Le tableau de bord (/admin) compte « bloquée » une tâche en cours sans battement depuis PERIME_S : le seuil où la
 * chaîne l’abandonne et la reprend (src/server/taches.ts, prendre), pas un autre. Avec la base.
 */
describe("une tâche « bloquée » au tableau de bord", () => {
  let id: string;
  let taches: string[];

  beforeAll(async () => {
    id = (await importer(await depuisFichier(new File([readFileSync("prompts/evals/convs/01-a-deux-doigts.txt")], "01.txt", { type: "text/plain" })))).id;
    /* Des mises à jour de la mémoire : elles s’empilent, une même histoire peut en avoir plusieurs */
    taches = [await planifier(id, "memoire_maj", { a: 1 }), await planifier(id, "memoire_maj", { a: 2 }), await planifier(id, "memoire_maj", { a: 3 })];
    await db().update(schema.tasks).set({ status: "en_cours" }).where(inArray(schema.tasks.id, taches));
  });
  afterAll(async () => {
    await db().delete(schema.stories).where(eq(schema.stories.id, id));
  });

  it("sans battement depuis PERIME_S (90 s), pas avant", async () => {
    const sansBattementDepuis = async (secondes: number) => {
      await db().update(schema.tasks).set({ heartbeatAt: sql`now() - make_interval(secs => ${secondes})` }).where(inArray(schema.tasks.id, taches));
      return (await statsAdmin(1)).sante.bloquees;
    };
    const a60s = await sansBattementDepuis(PERIME_S - 30);
    const a100s = await sansBattementDepuis(PERIME_S + 10);
    /* Les autres fichiers de tests, sur la même base, abandonnent et reprennent des tâches au même moment : à une près */
    expect(Math.abs(a100s - a60s - taches.length)).toBeLessThanOrEqual(1);
  });
});
