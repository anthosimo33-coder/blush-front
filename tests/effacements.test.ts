import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

/*
 * Le registre des effacements (schema.effacements) : chaque « Tout effacer » et « Supprimer l’histoire » y laisse son
 * identifiant, jamais l’email, pour ré-effacer après une restauration de la base (BACKEND.md, « Les sauvegardes »).
 */
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));

import { supprimerCompte } from "@/server/comptes";
import { db, schema } from "@/server/db";
import { supprimerHistoire } from "@/server/histoires";
import { empreinteDeLaListe } from "@/server/invitations";
import { purger } from "@/server/purge";
import { compteDeTest, convPrete } from "./aide/fixtures";

const cibles: string[] = [];
afterAll(async () => {
  await db().delete(schema.effacements).where(inArray(schema.effacements.cible, cibles));
});
const registre = (cible: string) => db().select().from(schema.effacements).where(eq(schema.effacements.cible, cible));

describe("le registre des effacements", () => {
  it("« Supprimer l’histoire » y note la conv ; « Tout effacer », le compte et l’empreinte de son email, jamais l’email", async () => {
    const u = await compteDeTest("effacements");
    const { id: conv } = await convPrete(u, "02-reciproque.txt");
    cibles.push(conv, u.id, empreinteDeLaListe(u.email));
    await supprimerHistoire(conv);
    expect((await registre(conv)).map((e) => e.quoi)).toEqual(["conv"]);
    await supprimerCompte(u);
    expect((await registre(u.id)).map((e) => e.quoi)).toEqual(["compte"]);
    expect((await registre(empreinteDeLaListe(u.email))).map((e) => e.quoi)).toEqual(["liste"]);
    const tout = JSON.stringify(await db().select().from(schema.effacements).where(inArray(schema.effacements.cible, cibles)));
    expect(tout).not.toContain(u.email);
    /* Une conv déjà partie n’y entre pas deux fois */
    await supprimerHistoire(conv);
    expect(await registre(conv)).toHaveLength(1);
  });

  it("la purge de la nuit l’oublie après 90 jours", async () => {
    const cible = `vieux-${Date.now()}`;
    cibles.push(cible);
    await db()
      .insert(schema.effacements)
      .values({ quoi: "conv", cible, le: new Date(Date.now() - 91 * 86400e3) });
    await purger();
    expect(
      await db()
        .select()
        .from(schema.effacements)
        .where(and(eq(schema.effacements.cible, cible))),
    ).toHaveLength(0);
  });
});
