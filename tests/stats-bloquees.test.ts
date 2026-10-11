import { inArray, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db";
import { statsAdmin } from "@/server/stats";
import { PERIME_S, planifier } from "@/server/taches";
import { convImportee } from "./aide/fixtures";

/*
 * Le tableau de bord (/admin) compte « bloquée » une tâche en cours sans battement depuis PERIME_S : le seuil où la
 * chaîne l’abandonne et la reprend (src/server/taches.ts, prendre), pas un autre. Avec la base.
 */
describe("une tâche « bloquée » au tableau de bord", () => {
  let id: string;
  let taches: string[];

  beforeAll(async () => {
    id = (await convImportee("01-a-deux-doigts.txt")).id;
    /* Des mises à jour de la mémoire : elles s’empilent, une même histoire peut en avoir plusieurs */
    taches = [await planifier(id, "memoire_maj", { a: 1 }), await planifier(id, "memoire_maj", { a: 2 }), await planifier(id, "memoire_maj", { a: 3 })];
    await db().update(schema.tasks).set({ status: "en_cours" }).where(inArray(schema.tasks.id, taches));
  });

  it("sans battement depuis PERIME_S (90 s), pas avant", async () => {
    const sansBattementDepuis = async (secondes: number) => {
      await db().update(schema.tasks).set({ heartbeatAt: sql`now() - make_interval(secs => ${secondes})` }).where(inArray(schema.tasks.id, taches));
      return (await statsAdmin(1)).sante.bloquees;
    };
    const a60s = await sansBattementDepuis(PERIME_S - 30);
    const a100s = await sansBattementDepuis(PERIME_S + 10);
    /* Les fichiers de tests passent l’un après l’autre (vitest.config.mts) : aucun autre ne prend ni ne lâche de tâche entre-temps */
    expect(a100s - a60s).toBe(taches.length);
  });
});
