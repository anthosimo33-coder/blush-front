import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { Requete } from "@prompts/lib/contextes";

/* after() de Next ne vit que dans une requête : ici, ce qui devait partir après la réponse est gardé, et lancé à la main */
const apres = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => apres.push(f) }));
/* L’état des tâches, compté : le rapport, relu toutes les 2 s pendant son écriture, ne le lit qu’une fois par appel */
vi.mock("@/server/taches", async (original) => {
  const m = await original<typeof import("@/server/taches")>();
  return { ...m, etatDesTaches: vi.fn(m.etatDesTaches) };
});

import * as coffre from "@/server/coffre";
import { db, schema } from "@/server/db";
import { ouvrirLeRapport, rapportDe } from "@/server/donnees";
import { histoireOuverte } from "@/server/histoires";
import { fournisseurFactice, type RequeteFactice } from "@/server/ia/factice";
import { etatDesTaches } from "@/server/taches";
import { avecFactice, compteDeTest, debloquerLaConv, histoireLue, ligneEnBase } from "./aide/fixtures";

const lues = vi.mocked(etatDesTaches);
const { etatDesTaches: vraiEtatDesTaches } = await vi.importActual<typeof import("@/server/taches")>("@/server/taches");

/** Les tâches d’un genre d’une histoire, en base. */
const tachesDe = (storyId: string, kind: "memoire" | "rapport_plan") =>
  db()
    .select({ status: schema.tasks.status, error: schema.tasks.error })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.storyId, storyId), eq(schema.tasks.kind, kind)));

describe("le rapport pendant son écriture", () => {
  it("lit l’état des tâches une fois par appel, et montre l’écriture dès qu’elle est lancée", async () => {
    const u = await compteDeTest("rapport-taches");
    const imp = await histoireLue(u, "06-elle-hesite.txt");

    /* Sans l’accès : ni l’écriture ni le vocal ne sont regardés */
    lues.mockClear();
    expect((await rapportDe((await histoireOuverte(u, { affichee: imp.id }))!, u))?.generating).toBe(false);
    expect(lues).not.toHaveBeenCalled();

    /* Le rapport se débloque. Lu seul (rapportDe), il ne lance rien : une lecture ne planifie pas de tâche payante */
    const plus = u;
    await debloquerLaConv(imp.id);
    const ligne = (await histoireOuverte(plus, { affichee: imp.id }))!;
    const lances = apres.length;
    expect(await rapportDe(ligne, plus)).not.toBeNull();
    expect(await tachesDe(imp.id, "rapport_plan")).toEqual([]);
    expect(apres).toHaveLength(lances);

    /* Ouvert (ouvrirLeRapport) : le rapport part, et l’état est relu une fois pour montrer l’écriture tout de suite */
    lues.mockClear();
    const lance = await ouvrirLeRapport(ligne, plus);
    expect(lance?.generating).toBe(true);
    expect(lance?.ecriture?.etape).toBe("plan");
    expect(lues).toHaveBeenCalledTimes(2);

    /* Les relectures suivantes : une seule lecture de l’état */
    lues.mockClear();
    expect((await ouvrirLeRapport(ligne, plus))?.ecriture?.etape).toBe("plan");
    expect(lues).toHaveBeenCalledTimes(1);

    apres.length = 0;
  });
});

/*
 * Le mode sobre (S-25) : le modèle factice lève une alerte au verdict, et son rapport sobre contient des chapitres, ce
 * que le prompt interdit mais qu’un modèle peut écrire. Ce rapport offert ne doit rien ouvrir de plus.
 */
const blocs = [{ type: "chute", texte: "La chute du chapitre caché.", preuves: [], titre: null, niveau: null, items: null }];
const sobreAvecChapitres = (req: Requete) => {
  const s = fournisseurFactice(req);
  if (req.tache === "04-verdict") return { ...(s as object), alerte: "mineur" };
  if (req.tache !== "05-rapport") return s;
  return {
    alerte: "mineur",
    mode_sobre: true,
    decouvertes: [],
    these: "Ce que tu vis compte.",
    chapitres: [2, 3].map((numero) => ({ numero, titre: `Caché ${numero}`, titre_court: `Caché ${numero}`, surtitre: null, blocs })),
    sobre: {
      intro: "On va parler doucement.",
      titre: "Ce que tu vis n’est pas normal.",
      faits: "Il revient sur tes sorties.",
      preuves: [],
      reassurance: "Tu n’y es pour rien.",
      gestes: ["Parles-en."],
      brouillon: null,
    },
  };
};

describe("le rapport sobre, de bout en bout (S-25)", () => {
  it("sans l’accès : gardé sans chapitres, ni mémoire ni vocal, et le rapport ne montre que sa partie sobre", async () => {
    const u = await compteDeTest("sobre-gratuit");
    const imp = await avecFactice(sobreAvecChapitres, () => histoireLue(u, "06-elle-hesite.txt"));

    const r = (await db().select().from(schema.reports).where(eq(schema.reports.storyId, imp.id)))[0]!;
    const donnees = coffre.lire("reports.data", r.data!);
    expect(donnees.sortie.chapitres).toBeNull();
    expect(donnees.chapitres).toEqual([]);
    expect(donnees.sobre).not.toBeNull();
    /* Rien au-delà du rapport doux : ni mémoire, ni vocal */
    expect(await tachesDe(imp.id, "memoire")).toEqual([]);
    expect((await vraiEtatDesTaches(imp.id, ["vocal"])).vocal).toBeUndefined();

    const lu = (await rapportDe((await histoireOuverte(u, { affichee: imp.id }))!, u))!;
    expect(lu.sober?.title).toBe("Ce que tu vis n’est pas normal.");
    expect(lu.report.chapters.slice(1).every((c) => c.locked && !c.blocks.length)).toBe(true);
    expect(JSON.stringify(lu)).not.toContain("Caché");

    /* Le rapport se débloque : l’ouvrir lance la mémoire (la réparation), toujours sans chapitre */
    const plus = u;
    await debloquerLaConv(imp.id);
    const avecAcces = (await ouvrirLeRapport((await histoireOuverte(plus, { affichee: imp.id }))!, plus))!;
    expect(await tachesDe(imp.id, "memoire")).toEqual([{ status: "attente", error: null }]);
    expect(JSON.stringify(avecAcces)).not.toContain("Caché");
    apres.length = 0;
  });

  it("avec l’accès : la mémoire suit le rapport doux, dans la chaîne", async () => {
    const u = await compteDeTest("sobre-plus", "debloque");
    const imp = await avecFactice(sobreAvecChapitres, () => histoireLue(u, "06-elle-hesite.txt"));
    expect(await tachesDe(imp.id, "rapport_plan")).toEqual([{ status: "fini", error: null }]);
    expect(await tachesDe(imp.id, "memoire")).toEqual([{ status: "fini", error: null }]);
    expect((await ligneEnBase(imp.id)).conv).toBeNull();
  });
});

describe("les découvertes du rapport", () => {
  it("un plan qui en écrit quatre : le rapport garde les trois premières", async () => {
    const u = await compteDeTest("rapport-decouvertes", "debloque");
    const quatre = (req: RequeteFactice) => {
      const s = fournisseurFactice(req) as { plan?: { decouvertes: { texte: string; preuves: string[] }[] } };
      if (req.tache !== "05-rapport" || req.partie !== "plan" || !s.plan) return s;
      return { ...s, plan: { ...s.plan, decouvertes: [...s.plan.decouvertes, { texte: "Une de trop", preuves: [] }] } };
    };
    const imp = await avecFactice(quatre, () => histoireLue(u, "06-elle-hesite.txt"));
    const r = (await db().select().from(schema.reports).where(eq(schema.reports.storyId, imp.id)))[0]!;
    const { sortie } = coffre.lire("reports.data", r.data!);
    expect(sortie.decouvertes.map((d) => d.texte)).toEqual(["Découverte 1", "Découverte 2", "Découverte 3"]);
  });
});

describe("la mémoire, qui efface la conv", () => {
  it("est finie même si sa suite ne peut pas être planifiée : rejouée, elle ne trouverait plus la conv", async () => {
    const u = await compteDeTest("memoire-suite", "debloque");
    let memoireEcrite = false;
    let coupures = 0;
    /* Juste après l’appel de la mémoire, la première lecture de l’état (celle de la suite) tombe : une coupure passagère */
    lues.mockImplementation(async (...args) => {
      if (memoireEcrite && !coupures++) throw new Error("coupure");
      return vraiEtatDesTaches(...args);
    });
    const factice = (req: Requete) => {
      if (req.tache === "07-memoire") memoireEcrite = true;
      return fournisseurFactice(req);
    };
    const imp = await avecFactice(factice, () => histoireLue(u, "06-elle-hesite.txt"));
    expect(coupures).toBeGreaterThan(0);
    expect(await tachesDe(imp.id, "memoire")).toEqual([{ status: "fini", error: null }]);
    expect((await db().select().from(schema.memories).where(eq(schema.memories.storyId, imp.id))).length).toBe(1);
    expect((await ligneEnBase(imp.id)).conv).toBeNull();
  });
});
