import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import { reserverEchange } from "@/server/chat";
import { db } from "@/server/db";

/*
 * Les identifiants d’un échange du chat (reserverEchange, src/server/chat.ts) : deux qui se suivent, pris sous un verrou
 * commun à tous les comptes. Le test de charge (docs/charge.md) l’a montré : pris dans une transaction (BEGIN, le
 * verrou, les identifiants, COMMIT), ce verrou durait quatre allers-retours jusqu’à la base, et tous les messages du
 * chat l’attendaient. Il se prend maintenant en un seul.
 */
describe("les identifiants d’un échange", () => {
  it("se suivent, ton message d’abord, sans jamais s’entremêler, même pris tous en même temps", async () => {
    const echanges = await Promise.all(Array.from({ length: 40 }, () => reserverEchange()));
    for (const e of echanges) expect(e.blush).toBe(e.toi + 1);
    expect(new Set(echanges.flatMap((e) => [e.toi, e.blush])).size).toBe(80);
  });

  it("se prennent en une seule requête jusqu’à la base, et le verrou ne reste pas pris après", async () => {
    const requetes = vi.spyOn(Client.prototype, "query");
    await reserverEchange();
    expect(requetes).toHaveBeenCalledTimes(1);
    requetes.mockRestore();
    /* Les verrous consultatifs sont propres à chaque base : ceux d’une autre suite de tests ne comptent pas */
    const { rows } = await db().$client.query<{ n: number }>(
      "select count(*)::int as n from pg_locks where locktype = 'advisory' and database = (select oid from pg_database where datname = current_database())",
    );
    expect(rows[0]?.n).toBe(0);
  });
});
