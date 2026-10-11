import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Utilisateur } from "@/server/auth";
import { controlerBudget, oublierLeBudget } from "@/server/budget";
import { empreinte } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { progression } from "@/server/donnees";
import { ErreurTache } from "@/server/erreurs";
import { appeler } from "@/server/ia/claude";
import { cloreLesAbandons, executerChaine } from "@/server/pipeline";
import { etatDesTaches, planifier } from "@/server/taches";
import { aujourdhuiParis } from "@/server/temps";
import { avecFactice, compteDeTest, convPrete, ligneEnBase } from "./aide/fixtures";

/*
 * Le budget de l’IA (src/server/budget.ts) en base : ce que chaque appel a coûté (ai_usage), sommé par jour de Paris, pour
 * tous, par compte (par ses convs) et sans compte. Les dépenses d’un test sont des lignes d’ai_usage à l’étiquette
 * ETIQUETTE, effacées après chaque test : une conv effacée laisse les siennes sans conv, elles iraient sinon peser sur la
 * part sans compte des tests suivants. Ce qu’un test a lu du budget est oublié avant le suivant.
 */
const ETIQUETTE = "test-budget";

/** Une dépense de `dollars` sur cette conv (ou sans conv), aujourd’hui ou il y a `joursAvant` jours. */
async function depense(storyId: string | null, dollars: number, joursAvant = 0): Promise<void> {
  await db()
    .insert(schema.aiUsage)
    .values({ storyId, task: ETIQUETTE, model: "test", costMicros: Math.round(dollars * 1e6), createdAt: new Date(Date.now() - joursAvant * 86400e3) });
}

/** Rejoue le contrôle d’un appel : la conv `storyId` (ou aucune) peut-elle appeler le modèle ? « budget » si non. */
const controle = (storyId?: string) =>
  controlerBudget(storyId).then(
    () => "ok",
    (e: unknown) => (e instanceof ErreurTache ? e.code : "autre"),
  );

beforeEach(oublierLeBudget);
afterEach(async () => {
  await db().delete(schema.aiUsage).where(eq(schema.aiUsage.task, ETIQUETTE));
  oublierLeBudget();
});

let numero = 0;
/** Un compte neuf et une conv à lui, prête à être lue. */
async function compteEtConv(): Promise<{ u: Utilisateur; id: string }> {
  const u = await compteDeTest(`budget-${++numero}`);
  const { id } = await convPrete(u, "02-reciproque.txt");
  return { u, id };
}

describe("la dépense d’un compte", () => {
  it("additionne ses convs du jour, pas celles d’hier ni celles des autres", async () => {
    const [a, b] = [await compteEtConv(), await compteEtConv()];
    const { id: autreConvDeA } = await convPrete(a.u, "06-elle-hesite.txt");
    await depense(a.id, 1.5);
    await depense(autreConvDeA, 1.4);
    await depense(a.id, 10, 2);
    await depense(b.id, 2.9);
    expect(await controle(a.id)).toBe("ok");
    expect(await controle(b.id)).toBe("ok");
    /* 3 $ pour A sur ses deux convs : arrêté, B non */
    await depense(autreConvDeA, 0.1);
    oublierLeBudget();
    expect(await controle(a.id)).toBe("budget");
    expect(await controle(autreConvDeA)).toBe("budget");
    expect(await controle(b.id)).toBe("ok");
  });

  it("sans conv, l’appel est sans compte : sa part à lui ne touche pas celle des comptes", async () => {
    const a = await compteEtConv();
    await depense(null, 5);
    expect(await controle()).toBe("budget");
    expect(await controle(a.id)).toBe("ok");
  });

  it("au-delà de 30 $ pour tous, plus personne n’appelle le modèle", async () => {
    const a = await compteEtConv();
    await depense(null, 30);
    expect(await controle(a.id)).toBe("budget");
  });
});

describe("avant l’appel", () => {
  it("le budget atteint, le modèle n’est pas appelé (en mode factice aussi)", async () => {
    const a = await compteEtConv();
    await depense(a.id, 3);
    const modele = vi.fn(() => ({ ok: true }));
    const appel = avecFactice(modele, () => appeler({ tache: "10-chat", blocs: [{ texte: "salut" }] }, z.object({ ok: z.boolean() }), { storyId: a.id }));
    await expect(appel).rejects.toMatchObject({ code: "budget" });
    expect(modele).not.toHaveBeenCalled();
  });
});

describe("une lecture arrêtée par le budget", () => {
  it("n’use pas son essai, se dit « souffle », et repart après minuit", async () => {
    const a = await compteEtConv();
    await depense(a.id, 3);
    await planifier(a.id, "verdict");
    const modele = vi.fn(() => ({}));
    await avecFactice(modele, () => executerChaine(a.id));
    expect(modele).not.toHaveBeenCalled();
    const { verdict } = await etatDesTaches(a.id, ["verdict"]);
    expect(verdict).toMatchObject({ status: "echec", error: "budget", attempts: 0 });
    expect(await progression(await ligneEnBase(a.id))).toMatchObject({ failed: true, failReason: "souffle" });

    /* Le même jour, rien ne repart : la tâche attend minuit */
    await cloreLesAbandons(a.id);
    expect((await etatDesTaches(a.id, ["verdict"])).verdict?.status).toBe("echec");

    /* Le lendemain : le budget du compte repart de zéro, la lecture aussi */
    await db().delete(schema.aiUsage).where(eq(schema.aiUsage.task, ETIQUETTE));
    await db()
      .update(schema.tasks)
      .set({ updatedAt: new Date(Date.now() - 86400e3 - 3600e3) })
      .where(eq(schema.tasks.id, verdict!.id));
    oublierLeBudget();
    await cloreLesAbandons(a.id);
    expect((await etatDesTaches(a.id, ["verdict"])).verdict).toMatchObject({ status: "attente", error: null, attempts: 0 });
    await executerChaine(a.id);
    expect((await etatDesTaches(a.id, ["verdict"])).verdict?.status).toBe("fini");
  });
});

describe("deux lectures arrêtées le même jour", () => {
  it("seule la dernière repart après minuit, sans buter sur l’index des tâches en cours", async () => {
    const a = await compteEtConv();
    await depense(a.id, 3);
    /* Arrêtée par le budget, puis relancée le jour même (POST /api/analyse planifie un nouveau verdict) : arrêtée encore */
    await planifier(a.id, "verdict");
    await executerChaine(a.id);
    await planifier(a.id, "verdict");
    await executerChaine(a.id);
    const verdicts = await db().select().from(schema.tasks).where(eq(schema.tasks.storyId, a.id)).orderBy(schema.tasks.createdAt);
    expect(verdicts.map((t) => [t.kind, t.status, t.error])).toEqual([
      ["verdict", "echec", "budget"],
      ["verdict", "echec", "budget"],
    ]);
    await db().delete(schema.aiUsage).where(eq(schema.aiUsage.task, ETIQUETTE));
    await db()
      .update(schema.tasks)
      .set({ updatedAt: new Date(Date.now() - 86400e3 - 3600e3) })
      .where(eq(schema.tasks.storyId, a.id));
    oublierLeBudget();
    await cloreLesAbandons(a.id);
    const apres = await db().select().from(schema.tasks).where(eq(schema.tasks.storyId, a.id)).orderBy(schema.tasks.createdAt);
    expect(apres.map((t) => t.status)).toEqual(["echec", "attente"]);
  });
});

describe("l’alerte à l’équipe", () => {
  /*
   * Les alertes des fichiers de tests déjà passés comptent dans le budget des alertes du jour, et le seuil a pu être dit
   * par un passage précédent : ce test remet à zéro ces trois compteurs (src/server/limites.ts les range sous leur empreinte)
   */
  const cles = () => ["alertes", "alertes:sujet:budget de l’IA : 50 % du jour", `budget-ia:alerte:${aujourdhuiParis().iso}:0.5`].map((c) => empreinte(`limite:${c}`));
  beforeEach(async () => {
    await db().delete(schema.rateLimits).where(inArray(schema.rateLimits.key, cles()));
  });

  it("part une fois par seuil et par jour, quelle que soit l’instance qui le passe", async () => {
    const dites: string[] = [];
    vi.spyOn(console, "log").mockImplementation((ligne: unknown) => void dites.push(String(ligne)));
    const a = await compteEtConv();
    await depense(null, 15.5);
    await controle(a.id);
    await vi.waitFor(() => expect(dites.filter((l) => l.includes("50 % du jour"))).toHaveLength(1));
    /* La même instance, puis une autre (qui n’a rien gardé) : le seuil est déjà dit */
    await controle(a.id);
    oublierLeBudget();
    await controle(a.id);
    await new Promise((ok) => setTimeout(ok, 200));
    expect(dites.filter((l) => l.includes("50 % du jour"))).toHaveLength(1);
    expect(dites.some((l) => l.includes("80 %"))).toBe(false);
  });
});
