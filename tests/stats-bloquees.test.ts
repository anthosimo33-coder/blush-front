import { eq, inArray, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as coffre from "@/server/coffre";
import { db, schema } from "@/server/db";
import { LOT_BLOQUE_S } from "@/server/memoire-en-lot";
import { statsAdmin } from "@/server/stats";
import { PERIME_S } from "@/server/taches";
import { echange } from "./aide/fabriques";
import { convImportee } from "./aide/fixtures";

/*
 * Le tableau de bord (/admin) compte « bloquée » une tâche en cours sans battement depuis PERIME_S : le seuil où la
 * chaîne l’abandonne et la reprend (src/server/taches.ts, prendre), pas un autre. Et une mise à jour de la mémoire
 * encore en lot passé LOT_BLOQUE_S (src/server/memoire-en-lot.ts : le passage des 5 minutes l’aurait remise en direct).
 * Avec la base.
 */
describe("une tâche « bloquée » au tableau de bord", () => {
  let id: string;
  let taches: string[];

  beforeAll(async () => {
    id = (await convImportee("01-a-deux-doigts.txt")).id;
    /* Des mises à jour de la mémoire : hors de l’index des étapes de la chaîne, une même histoire peut en avoir plusieurs */
    const posees = await db()
      .insert(schema.tasks)
      .values([1, 2, 3].map((n) => ({ storyId: id, kind: "memoire_maj" as const, status: "en_cours" as const, input: coffre.ecrire("tasks.input", [echange(n)]) })))
      .returning({ id: schema.tasks.id });
    taches = posees.map((t) => t.id);
  });

  it("sans battement depuis PERIME_S (90 s), pas avant", async () => {
    const sansBattementDepuis = async (secondes: number) => {
      await db()
        .update(schema.tasks)
        .set({ heartbeatAt: sql`now() - make_interval(secs => ${secondes})` })
        .where(inArray(schema.tasks.id, taches));
      return (await statsAdmin(1)).sante.bloquees;
    };
    const a60s = await sansBattementDepuis(PERIME_S - 30);
    const a100s = await sansBattementDepuis(PERIME_S + 10);
    /* Les fichiers de tests passent l’un après l’autre (vitest.config.mts) : aucun autre ne prend ni ne lâche de tâche entre-temps */
    expect(a100s - a60s).toBe(taches.length);
  });

  it("une mise à jour encore en lot passé LOT_BLOQUE_S, pas avant", async () => {
    const [enLot] = taches;
    await db().update(schema.tasks).set({ status: "lot" }).where(eq(schema.tasks.id, enLot!));
    try {
      const enLotDepuis = async (secondes: number) => {
        await db()
          .update(schema.tasks)
          .set({ updatedAt: sql`now() - make_interval(secs => ${secondes})` })
          .where(eq(schema.tasks.id, enLot!));
        return (await statsAdmin(1)).sante.bloquees;
      };
      const avant = await enLotDepuis(LOT_BLOQUE_S - 60);
      expect((await enLotDepuis(LOT_BLOQUE_S + 60)) - avant).toBe(1);
    } finally {
      /* L’autre test compte ces trois tâches en cours, dans n’importe quel ordre */
      await db().update(schema.tasks).set({ status: "en_cours" }).where(eq(schema.tasks.id, enLot!));
    }
  });
});
