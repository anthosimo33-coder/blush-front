import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { BULLES_DE_LA_BETA as BULLES_DE_L_APPLI } from "@/contenu/offres";
import { db, schema } from "@/server/db";
import { BULLES_DE_LA_BETA, RATTRAPAGE_BETA, RATTRAPAGE_PLAINTES } from "../scripts/base.mjs";
import { compteDeTest, convRattachee } from "./aide/fixtures";

/*
 * Les rattrapages de données qui suivent les migrations (scripts/base.mjs, BACKEND.md « Les migrations ») : les testeurs
 * de la bêta (users.plan « rapport » ou l’ancien accès au chat) gardent leurs rapports et reçoivent leurs bulles, une
 * fois, même rejoué ; les comptes qui se sont plaints avant le webhook ne reçoivent plus ni offres ni conseils. Avec la
 * base des tests : chaque requête passe sur toute la table, ces tests ne regardent que leurs comptes.
 */
const rattraper = async () => (await db().execute<{ testeurs: number; convs: number }>(sql.raw(RATTRAPAGE_BETA))).rows[0]!;
const rattraperLesPlaintes = async () => (await db().execute<{ comptes: number }>(sql.raw(RATTRAPAGE_PLAINTES))).rows[0]!;

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

describe("le rattrapage des plaintes d’avant le webhook", () => {
  it("un compte qui s’est plaint : offres et conseils coupés à sa première plainte, ce qui l’était garde sa date ; un rebond, rien ; rejoué, rien de plus", async () => {
    const [plaignant, deja, rebond] = [await compteDeTest("plainte"), await compteDeTest("plainte-deja"), await compteDeTest("plainte-rebond")];
    const [premiere, seconde, avant] = [new Date("2026-11-05T19:57:40Z"), new Date("2026-11-06T08:00:00Z"), new Date("2026-10-01T10:00:00Z")];
    await db().update(schema.users).set({ conseilsCoupesLe: avant }).where(eq(schema.users.id, deja.id));
    const id = () => `msg_${randomUUID()}`;
    const evenements: (typeof schema.evenementsMails.$inferInsert)[] = [
      { id: id(), le: seconde, type: "complained", sorte: "sequence-s1_chapitres", compteId: plaignant.id },
      { id: id(), le: premiere, type: "complained", sorte: "sequence-s1_haut", compteId: plaignant.id },
      { id: id(), le: premiere, type: "complained", sorte: "rapport", compteId: deja.id },
      { id: id(), le: premiere, type: "bounced", sorte: "code", compteId: rebond.id },
      { id: id(), le: premiere, type: "complained", sorte: "relance", compteId: null },
    ];
    await db().insert(schema.evenementsMails).values(evenements);
    try {
      expect((await rattraperLesPlaintes()).comptes).toBeGreaterThanOrEqual(2);
      const lire = async () =>
        new Map(
          (
            await db()
              .select({ id: schema.users.id, offres: schema.users.relancesCoupeesLe, conseils: schema.users.conseilsCoupesLe })
              .from(schema.users)
              .where(inArray(schema.users.id, [plaignant.id, deja.id, rebond.id]))
          ).map(({ id, ...coupes }) => [id, coupes]),
        );
      const apres = await lire();
      expect(apres).toEqual(
        new Map([
          [plaignant.id, { offres: premiere, conseils: premiere }],
          [deja.id, { offres: premiere, conseils: avant }],
          [rebond.id, { offres: null, conseils: null }],
        ]),
      );
      /* Rejoué (un autre build, une base migrée deux fois) : rien ne change */
      expect(await rattraperLesPlaintes()).toEqual({ comptes: 0 });
      expect(await lire()).toEqual(apres);
    } finally {
      await db()
        .delete(schema.evenementsMails)
        .where(
          inArray(
            schema.evenementsMails.id,
            evenements.map((e) => e.id),
          ),
        );
    }
  });
});
