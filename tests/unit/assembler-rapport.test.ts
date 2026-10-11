import { describe, expect, it } from "vitest";
import type { Rapport, Verdict } from "@prompts/lib/schemas";
import { CHAPITRES_PAYANTS, titreDAttente } from "@/contenu/chapitres";
import type { Tache } from "@/server/taches";
import { assemblerRapport, type RapportLu } from "@/server/presentation/rapport";
import type { Chapter, SoberReport } from "@/types";

/*
 * Le rapport tel que le front l’affiche, assemblé d’après ce qui est lu (src/server/presentation/rapport.ts) :
 * sans base ni modèle, sans rien planifier. Des exemples inventés : Tom importe sa conv avec Léa.
 */

const VERDICT: Verdict = {
  alerte: null,
  mode_sobre: false,
  emoji: "🔥",
  court: "ça chauffe",
  titre: "Elle attend que tu proposes",
  sous_titre: "Léa relance, Tom hésite.",
  preuves: ["m0003"],
  confiance: "probable",
  confiance_texte: "Trois relances en une semaine.",
  niveau: "voit",
  niveau_pourquoi: "Vous vous êtes vus deux fois.",
  tendance: "↗ ça monte",
  prochain_pas: "Propose un verre jeudi.",
  devinette: null,
};
const ALERTE: Verdict = { ...VERDICT, alerte: "danger", mode_sobre: true };
const SORTIE: Rapport = { alerte: null, mode_sobre: false, decouvertes: [], these: "Elle avance, il recule.", chapitres: [], sobre: null };
const chapitre = (n: number): Chapter => ({
  number: n,
  title: `Chapitre ${n}`,
  tocTitle: `Ch. ${n}`,
  free: n === 1,
  blocks: [{ kind: "essential", text: `Le contenu du chapitre ${n}.` }],
});
const SOBRE: SoberReport = {
  intro: "On va parler doucement.",
  title: "Ce que tu vis n’est pas normal.",
  facts: "Il revient sans cesse sur tes sorties.",
  reassurance: "Tu n’y es pour rien.",
  steps: ["Parles-en à quelqu’un de confiance."],
  draftLabel: "Si tu veux lui écrire",
  draft: "",
  helpLabel: "Besoin d’en parler à quelqu’un ?",
};
/** Une tâche du rapport, dans cet état (le reste ne compte pas ici), planifiée à l’heure 0. */
const tache = (status: Tache["status"], autres: Partial<Tache> = {}): Tache => ({
  id: "00000000-0000-4000-8000-0000000000aa",
  storyId: "00000000-0000-4000-8000-000000000001",
  kind: "rapport_plan",
  status,
  attempts: 1,
  input: null,
  error: null,
  progress: 0,
  detail: null,
  heartbeatAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...autres,
});

/** Ce que lit le rapport d’un compte gratuit, verdict écrit, rien d’autre (sauf ce que `lu` change). */
const lu = (l: Partial<RapportLu> = {}): RapportLu => ({
  storyId: "00000000-0000-4000-8000-000000000001",
  autre: "Léa",
  access: "gratuit",
  verdict: { sortie: VERDICT, scores: [{ label: "Qui relance", winner: "elle", toiPercent: 35 }] },
  donnees: null,
  plan: null,
  partiels: [],
  taches: {},
  vocal: null,
  voix: true,
  maintenant: 0,
  ...l,
});

describe("le rapport assemblé", () => {
  it("sans l’accès : le verdict offert, les chapitres payants fermés et vides, rien qui s’écrit", () => {
    const r = assemblerRapport(lu());
    expect(r.report.chapters.map((c) => [c.number, !!c.locked, c.blocks.length > 0])).toEqual([[1, false, true], ...CHAPITRES_PAYANTS.map((n) => [n, true, false])]);
    expect(r.report.nextStep).toBe("Ton prochain pas\u00a0: Propose un verre jeudi.");
    expect([r.sober, r.generating, r.ecriture, r.vocal, r.echec]).toEqual([null, false, undefined, undefined, undefined]);
  });

  it("avec l’accès, le rapport écrit : ses chapitres, et son temps de lecture", () => {
    const chapitres = [1, ...CHAPITRES_PAYANTS].map(chapitre);
    const r = assemblerRapport(lu({ access: "blushplus", donnees: { sortie: SORTIE, chapitres, sobre: null, lecture: { free: "2 min", full: "11 min" } } }));
    expect(r.report.chapters).toBe(chapitres);
    expect(r.report.readingTime).toEqual({ free: "2 min", full: "11 min" });
    expect(r.generating).toBe(false);
  });

  it("avec l’accès, pendant l’écriture : les titres du plan, l’écriture, et le vocal qui s’enregistre", () => {
    const r = assemblerRapport(
      lu({
        access: "blushplus",
        plan: {
          alerte: null,
          mode_sobre: false,
          these: "",
          decouvertes: [],
          chapitres: [{ numero: 2, titre: "Le premier verre", titre_court: "Le verre", surtitre: null, periode: "mars", scenes: [], epice: "doux" }],
        },
        taches: { rapport_plan: tache("en_cours", { progress: 40 }) },
      }),
    );
    expect(r.generating).toBe(true);
    expect(r.report.chapters[1]!.title).toBe("Le verre");
    expect(r.ecriture?.etape).toBe("plan");
    expect(r.ecriture?.progres).toBeCloseTo(0.35 * 0.4, 5);
    expect(r.vocal).toEqual({ etat: "en_cours" });
  });

  it("l’écriture en échec : le rapport le dit, et n’attend plus", () => {
    const r = assemblerRapport(lu({ access: "blushplus", taches: { rapport_plan: tache("echec", { error: "coupee" }) } }));
    expect([r.generating, r.echec, r.ecriture]).toEqual([false, "panne", undefined]);
  });
});

describe("le mode sobre (S-25)", () => {
  const chapitres = [chapitre(1), chapitre(2)];
  const donnees = { sortie: { ...SORTIE, alerte: "danger" as const, mode_sobre: true }, chapitres, sobre: SOBRE, lecture: { free: "1 min", full: "2 min" } };

  it("sans l’accès : sa partie sobre seulement, jamais des chapitres que le modèle aurait écrits", () => {
    const r = assemblerRapport(lu({ verdict: { sortie: ALERTE, scores: [] }, donnees }));
    expect(r.sober).toBe(SOBRE);
    expect(r.report.chapters.flatMap((c) => c.blocks)).not.toContainEqual(chapitres[1]!.blocks[0]);
    expect(r.report.chapters.slice(1).every((c) => c.locked && !c.blocks.length)).toBe(true);
    /* Une alerte : jamais de vocal */
    expect(r.vocal).toBeUndefined();
  });

  it("sans l’accès, pendant l’écriture : ni plan ni chapitre fini, même si la lecture en apportait", () => {
    const plan = {
      alerte: null,
      mode_sobre: false,
      these: "",
      decouvertes: [],
      chapitres: [{ numero: 2, titre: "SECRET", titre_court: "SECRET", surtitre: null, periode: "mars", scenes: [], epice: "doux" }],
    };
    const r = assemblerRapport(lu({ verdict: { sortie: ALERTE, scores: [] }, plan, partiels: [chapitre(2)], taches: { rapport_plan: tache("en_cours") } }));
    expect(r.generating).toBe(true);
    expect(r.report.chapters.slice(1).every((c) => c.locked && !c.blocks.length)).toBe(true);
    /* Les chapitres fermés, et ceux de l’écriture, gardent leurs titres d’attente : rien du plan */
    const attente = CHAPITRES_PAYANTS.map((n) => titreDAttente(n, "Léa"));
    expect(r.report.chapters.slice(1).map((c) => c.title)).toEqual(attente);
    expect(r.ecriture?.chapitres.map((c) => c.title)).toEqual(attente);
    expect(JSON.stringify(r)).not.toContain("SECRET");
  });

  it("avec l’accès : ce que le rapport garde", () => {
    const r = assemblerRapport(lu({ access: "blushplus", verdict: { sortie: ALERTE, scores: [] }, donnees }));
    expect(r.sober).toBe(SOBRE);
    expect(r.report.chapters).toBe(chapitres);
  });
});

describe("le vocal du rapport", () => {
  const pret = { etat: "pret" as const, audio: "/api/vocal/audio?conv=x&v=1", duree: 25, voix: "A" as const, sobre: false, lignes: [] };
  const donnees = { sortie: SORTIE, chapitres: [], sobre: null, lecture: { free: "1 min", full: "9 min" } };
  const avec = (l: Partial<RapportLu>) => assemblerRapport(lu({ access: "blushplus", donnees, ...l })).vocal;

  it("prêt, s’enregistre, ou rien", () => {
    expect(avec({ vocal: { pret, aJour: true, fait: new Date(1) } })).toBe(pret);
    /* Une ancienne version : l’ancien reste tant que le nouveau n’est pas tenté, puis s’il échoue */
    expect(avec({ vocal: { pret, aJour: false, fait: new Date(1) }, taches: { vocal: tache("attente") } })).toEqual({ etat: "en_cours" });
    expect(avec({ vocal: { pret, aJour: false, fait: new Date(1) }, taches: { vocal: tache("echec", { createdAt: new Date(2) }) } })).toBe(pret);
    /* Sans voix, ou jamais tenté et en échec : rien */
    expect(avec({ voix: false })).toBeUndefined();
    expect(avec({ taches: { vocal: tache("echec") } })).toBeUndefined();
  });
});
