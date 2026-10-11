import { count, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db";

/*
 * Le pilote de la base (node-postgres, src/server/db/index.ts) : les types que BLUSH garde reviennent tels qu’écrits.
 * Le binaire chiffré (bytea), le JSON (jsonb), les dates (timestamptz et date), les identifiants qui s’incrémentent
 * (bigserial) et les requêtes brutes du tableau de bord.
 */
const ids: string[] = [];
afterAll(async () => {
  for (const id of ids) await db().delete(schema.stories).where(eq(schema.stories.id, id));
});

describe("le pilote de la base", () => {
  it("rend le binaire, le JSON, les dates et les identifiants tels qu’écrits", async () => {
    /* Tous les octets, le nul et 0xff compris */
    const octets = Buffer.from(Array.from({ length: 256 }, (_, k) => k));
    const quand = new Date("2026-10-10T08:15:30.123Z");
    const [s] = await db().insert(schema.stories).values({ messageCount: 3, meta: octets, conv: Buffer.alloc(0), createdAt: quand }).returning();
    ids.push(s.id);
    expect(Buffer.isBuffer(s.meta)).toBe(true);
    expect(s.meta.equals(octets)).toBe(true);
    expect(s.conv!.length).toBe(0);
    expect(s.createdAt).toBeInstanceOf(Date);
    expect(s.createdAt.getTime()).toBe(quand.getTime());

    /* Le pilote rend tout JSON tel qu’écrit : un détail d’écriture (DetailEcriture), et ce que son type ne connaît pas */
    const detail = { a: { progres: 0.5, ecrits: [1, 2], enCours: 3 }, b: { progres: 0, ecrits: [], enCours: null }, note: "« déjà » 💀", vide: null };
    const [t] = await db().insert(schema.tasks).values({ storyId: s.id, kind: "memoire_maj", detail }).returning();
    expect((await db().select({ detail: schema.tasks.detail }).from(schema.tasks).where(eq(schema.tasks.id, t.id)))[0].detail).toEqual(detail);

    const [m1] = await db().insert(schema.chatMessages).values({ storyId: s.id, role: "toi", data: octets }).returning({ id: schema.chatMessages.id });
    const [m2] = await db().insert(schema.chatMessages).values({ storyId: s.id, role: "blush", data: octets }).returning({ id: schema.chatMessages.id });
    expect(typeof m1.id).toBe("number");
    expect(m2.id).toBeGreaterThan(m1.id);
    /* Une recherche sur un bytea (le paramètre part en binaire) */
    const [{ n }] = await db().select({ n: count() }).from(schema.chatMessages).where(sql`${schema.chatMessages.storyId} = ${s.id} and ${schema.chatMessages.data} = ${octets}`);
    expect(n).toBe(2);
  });

  it("garde le jour en texte, et les requêtes brutes rendent leurs lignes", async () => {
    const jour = (await db().execute(sql`select ${"2026-10-10"}::date as jour, count(*) as n from (values (1), (2)) v(x)`)).rows[0] as { jour: string; n: string };
    expect(jour).toEqual({ jour: "2026-10-10", n: "2" });
    const [c] = await db().select({ day: schema.counters.day }).from(schema.counters).limit(1);
    if (c) expect(c.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
