import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { avanceMoitie, avancePlan, chapitresCommences, executerChaine } from "@/server/analyse";
import { db, schema } from "@/server/db";
import { rapportDe } from "@/server/donnees";
import { definirQui, depuisFichier, importer, rattacherBrouillon } from "@/server/histoires";
import { definirFactice } from "@/server/ia/claude";
import { fournisseurFactice } from "@/server/ia/factice";
import { planifier } from "@/server/taches";

const avance = (ecrit: string, reflexion = 0) => ({ reflexion, texte: ecrit.length, ecrit });

describe("l’avancée du rapport, lue sur ce que le modèle écrit", () => {
  it("repère les chapitres commencés, et suit chaque moitié chapitre par chapitre", () => {
    const ecrit = `{"plan":null,"chapitres":[{"numero":1,"titre":"A","blocs":[]},{"numero":2,"titre":"B","blocs":[{"type":"recit","texte":"${"x".repeat(1000)}`;
    expect(chapitresCommences(ecrit)).toEqual([1, 2]);
    const m = avanceMoitie(avance(ecrit), 1);
    expect(m.ecrits).toEqual([1]);
    expect(m.enCours).toBe(2);
    expect(m.progres).toBeGreaterThan(0.45 + 0.55 / 4);
    expect(m.progres).toBeLessThan(0.45 + (0.55 * 2) / 4);
    /* Avant le premier chapitre : la réflexion, sous 45 % */
    expect(avanceMoitie(avance("", 50_000), 5).progres).toBeLessThan(0.45);
    expect(avanceMoitie(avance("", 50_000), 5).enCours).toBeNull();
    /* Le plan : sa réflexion jusqu’à 50, puis ses chapitres */
    expect(avancePlan(avance("", 2500))).toBeLessThan(50);
    expect(avancePlan(avance('{"chapitres":[{"numero":1},{"numero":2},{"numero":3},{"numero":4}'))).toBe(74);
  });
});

describe("le rapport pendant son écriture", () => {
  const email = `ecriture-${Date.now()}@blush.test`;
  let id = "";
  beforeAll(async () => {
    definirFactice(fournisseurFactice);
    const imp = await importer(await depuisFichier(new File([readFileSync("prompts/evals/convs/01-a-deux-doigts.txt")], "01.txt", { type: "text/plain" })));
    id = imp.id;
    const [u] = await db().insert(schema.users).values({ email, plan: "blushplus" }).returning();
    await rattacherBrouillon(u, imp.secret);
    await definirQui(id, { moi: imp.meta.participants.findIndex((p) => p.prenom === "Hugo") as 0 | 1, pronom: "il", devinette: "vus", objectif: "ensemble" });
    await planifier(id, "verdict");
    await executerChaine(id);
  });
  afterAll(async () => {
    await db().delete(schema.users).where(eq(schema.users.email, email));
    definirFactice(null);
  });

  it("donne les vrais titres du plan, l’état de chaque chapitre et l’avancée", async () => {
    /* On remet l’histoire au milieu de l’écriture : le plan fait, les deux moitiés en cours */
    await db().update(schema.reports).set({ data: null }).where(eq(schema.reports.storyId, id));
    await db()
      .update(schema.tasks)
      .set({ status: "en_cours", progress: 60, detail: { a: { progres: 0.7, ecrits: [1, 2], enCours: 3 }, b: { progres: 0.5, ecrits: [5], enCours: 6 } } })
      .where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "rapport_chapitres")));
    const [story] = await db().select().from(schema.stories).where(eq(schema.stories.id, id));
    const [u] = await db().select().from(schema.users).where(eq(schema.users.email, email));
    const r = (await rapportDe(story, { ...u, plan: "blushplus" } as never))!;
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
    expect(r.ecriture?.chapitres[0].title).toBe("Ch. 2");
    expect(r.report.chapters[1].tocTitle).toBe("Ch. 2");
  });
});

describe("un refus du modèle", () => {
  const email = `refus-${Date.now()}@blush.test`;
  afterAll(async () => {
    await db().delete(schema.users).where(eq(schema.users.email, email));
    definirFactice(null);
  });

  it("n’est essayé qu’une fois, et la lecture dit pourquoi", async () => {
    const { REFUS_FACTICE } = await import("@/server/ia/claude");
    const { progression } = await import("@/server/donnees");
    definirFactice((req) => (req.tache === "04-verdict" ? REFUS_FACTICE : fournisseurFactice(req)));
    const imp = await importer(await depuisFichier(new File([readFileSync("prompts/evals/convs/02-reciproque.txt")], "02.txt", { type: "text/plain" })));
    const [u] = await db().insert(schema.users).values({ email, plan: "blushplus" }).returning();
    await rattacherBrouillon(u, imp.secret);
    await definirQui(imp.id, { moi: 0, pronom: "il", devinette: "parle", objectif: "comprendre" });
    await planifier(imp.id, "verdict");
    await executerChaine(imp.id);
    const [t] = await db().select().from(schema.tasks).where(and(eq(schema.tasks.storyId, imp.id), eq(schema.tasks.kind, "verdict")));
    expect([t.status, t.attempts, t.error]).toEqual(["echec", 1, "refus"]);
    const [story] = await db().select().from(schema.stories).where(eq(schema.stories.id, imp.id));
    expect(await progression(story)).toMatchObject({ failed: true, failReason: "refus", done: false });
  });
});
