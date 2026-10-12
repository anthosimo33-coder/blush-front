import { eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { BULLES_DE_LA_BETA as BULLES_DE_L_APPLI } from "@/contenu/offres";
import { db, schema } from "@/server/db";
import { BULLES_DE_LA_BETA, RATTRAPAGE_BETA } from "../scripts/base.mjs";
import { compteDeTest, convRattachee } from "./aide/fixtures";

/*
 * Les rattrapages de données qui suivent les migrations (scripts/base.mjs, BACKEND.md « Les migrations ») : les testeurs
 * de la bêta (users.plan « rapport » ou l’ancien accès au chat) gardent leurs rapports et reçoivent leurs bulles, une
 * fois, même rejoué. Avec la base des tests : la requête passe sur toute la table, ce test ne regarde que ses comptes.
 */
const rattraper = async () => (await db().execute<{ testeurs: number; convs: number }>(sql.raw(RATTRAPAGE_BETA))).rows[0]!;

describe("le rattrapage des testeurs de la bêta", () => {
  it("donne les mêmes bulles que l’appli", () => {
    expect(BULLES_DE_LA_BETA).toBe(BULLES_DE_L_APPLI);
  });

  it("une fois : leurs convs débloquées et 100 bulles ; rejoué, rien de plus ; une conv d’après reste à payer", async () => {
    const [rapport, chat, gratuit] = [await compteDeTest("beta-rapport"), await compteDeTest("beta-chat"), await compteDeTest("beta-gratuit")];
    const comptes = [rapport.id, chat.id, gratuit.id];
    const ids = [
      (await convRattachee(rapport, "02-reciproque.txt")).id,
      (await convRattachee(chat, "04-ghosting.txt")).id,
      (await convRattachee(gratuit, "06-elle-hesite.txt")).id,
    ];
    /* Les plans d’avant le paiement à l’unité, écrits comme la bêta les avait laissés */
    await db().update(schema.users).set({ plan: "rapport" }).where(eq(schema.users.id, rapport.id));
    await db().update(schema.users).set({ plan: "blushplus" }).where(eq(schema.users.id, chat.id));

    expect((await rattraper()).testeurs).toBeGreaterThanOrEqual(2);
    const lire = async () => ({
      soldes: new Map(
        (await db().select({ id: schema.users.id, bulles: schema.users.bulles }).from(schema.users).where(inArray(schema.users.id, comptes))).map((l) => [l.id, l.bulles]),
      ),
      debloquees: new Map(
        (await db().select({ id: schema.stories.id, debloqueLe: schema.stories.debloqueLe }).from(schema.stories).where(inArray(schema.stories.id, ids))).map((l) => [
          l.id,
          l.debloqueLe !== null,
        ]),
      ),
      journal: await db()
        .select({ userId: schema.mouvementsBulles.userId, delta: schema.mouvementsBulles.delta, raison: schema.mouvementsBulles.raison, ref: schema.mouvementsBulles.ref })
        .from(schema.mouvementsBulles)
        .where(inArray(schema.mouvementsBulles.userId, comptes)),
    });
    const apres = await lire();
    expect(apres.soldes).toEqual(
      new Map([
        [rapport.id, 100],
        [chat.id, 100],
        [gratuit.id, 0],
      ]),
    );
    expect(apres.debloquees).toEqual(
      new Map([
        [ids[0], true],
        [ids[1], true],
        [ids[2], false],
      ]),
    );
    expect(apres.journal).toHaveLength(2);
    expect(apres.journal.every((m) => m.delta === 100 && m.raison === "beta" && m.ref === m.userId)).toBe(true);

    /* Rejoué (un autre build, une base migrée deux fois) : rien ne change, et une conv importée depuis reste à payer */
    const nouvelle = (await convRattachee(rapport, "03-elle-s-eloigne.txt")).id;
    expect(await rattraper()).toEqual({ testeurs: 0, convs: 0 });
    expect(await lire()).toEqual(apres);
    const [n] = await db().select({ debloqueLe: schema.stories.debloqueLe }).from(schema.stories).where(eq(schema.stories.id, nouvelle));
    expect(n?.debloqueLe).toBeNull();
  });
});
