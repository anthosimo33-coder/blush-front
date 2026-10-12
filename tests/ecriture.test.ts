import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Requete } from "@prompts/lib/contextes";
import type { Utilisateur } from "@/server/auth";
import { chiffrer } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { progression, rapportDe } from "@/server/donnees";
import { fournisseurFactice, REFUS_FACTICE } from "@/server/ia/factice";
import { avecFactice, compteDeTest, histoireLue, ligneEnBase } from "./aide/fixtures";

describe("le rapport pendant son écriture", () => {
  let u: Utilisateur;
  let id = "";
  beforeAll(async () => {
    u = await compteDeTest("ecriture", "debloque");
    id = (await histoireLue(u, "01-a-deux-doigts.txt", { qui: { moi: "Hugo" } })).id;
  });
  /** L’histoire remise au milieu de l’écriture : le plan fait, les deux moitiés en cours, ni rapport écrit ni chapitre prêt en avance. */
  async function auMilieuDeLEcriture() {
    await db().update(schema.reports).set({ data: null, partiel: null }).where(eq(schema.reports.storyId, id));
    await db()
      .update(schema.tasks)
      .set({ status: "en_cours", progress: 60, detail: { a: { progres: 0.7, ecrits: [1, 2], enCours: 3 }, b: { progres: 0.5, ecrits: [5], enCours: 6 } } })
      .where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "rapport_chapitres")));
  }

  it("donne les vrais titres du plan, l’état de chaque chapitre et l’avancée", async () => {
    await auMilieuDeLEcriture();
    const r = (await rapportDe(await ligneEnBase(id), u))!;
    expect(r.generating).toBe(true);
    expect(r.ecriture?.etape).toBe("chapitres");
    expect(r.ecriture?.progres).toBeCloseTo(0.35 + 0.65 * 0.6, 2);
    expect(r.ecriture?.chapitres.map((c) => [c.number, c.etat])).toEqual([
      [2, "ecrit"],
      [3, "en_cours"],
      [4, "attente"],
      [5, "ecrit"],
      [6, "en_cours"],
      [7, "attente"],
      [8, "attente"],
    ]);
    /* Les titres viennent du plan (le modèle factice les appelle « Ch. N »), dans le sommaire aussi */
    expect(r.ecriture?.chapitres[0]!.title).toBe("Ch. 2");
    expect(r.report.chapters[1]!.tocTitle).toBe("Ch. 2");
  });

  it("donne à lire les chapitres finis, dans l’ordre : un chapitre prêt en avance attend ceux d’avant", async () => {
    await auMilieuDeLEcriture();
    const pret = (n: number) => ({ number: n, title: `Prêt ${n}`, tocTitle: `Prêt ${n}`, free: false, blocks: [{ kind: "punchline", text: `fin ${n}` }] });
    await db()
      .update(schema.reports)
      .set({ partiel: chiffrer([pret(2), pret(3), pret(6)]) })
      .where(eq(schema.reports.storyId, id));
    const r = (await rapportDe(await ligneEnBase(id), u))!;
    expect(r.report.chapters.map((c) => [c.number, !c.locked])).toEqual([
      [1, true],
      [2, true],
      [3, true],
      [4, false],
      [5, false],
      [6, false],
      [7, false],
      [8, false],
    ]);
    expect(r.report.chapters[2]!.title).toBe("Prêt 3");
    /* Le 6 est prêt mais attend : la liste le marque « écrit » */
    expect(r.ecriture?.chapitres.find((c) => c.number === 6)?.etat).toBe("ecrit");
  });
});

describe("un refus du modèle", () => {
  it("n’est essayé qu’une fois, et la lecture dit pourquoi", async () => {
    const u = await compteDeTest("refus", "debloque");
    const refus = (req: Requete) => (req.tache === "04-verdict" ? REFUS_FACTICE : fournisseurFactice(req));
    const imp = await avecFactice(refus, () => histoireLue(u, "02-reciproque.txt", { qui: { devinette: "parle", objectif: "comprendre" } }));
    const t = (
      await db()
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.storyId, imp.id), eq(schema.tasks.kind, "verdict")))
    )[0]!;
    expect([t.status, t.attempts, t.error]).toEqual(["echec", 1, "refus"]);
    expect(await progression(await ligneEnBase(imp.id))).toMatchObject({ failed: true, failReason: "refus", done: false });
  });
});
