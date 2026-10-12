import { describe, expect, it } from "vitest";
import type { Rapport, Verdict } from "@prompts/lib/schemas";
import { assemblerRapport, type RapportLu } from "@/server/presentation/rapport";
import type { SoberReport } from "@/types";

/*
 * `alerte` (src/server/presentation/rapport.ts) : le verdict a levé une alerte de danger (son mode_sobre). Le front le
 * sait dès le verdict, avant que le rapport doux (`sober`) soit écrit : ni scène du verdict, ni sons, ni rapport joueur,
 * mais l’attente sobre (src/app/rapport/verdict/page.tsx, ReportScreen). Des exemples inventés : Sam et Inès.
 */

const VERDICT: Verdict = {
  alerte: null,
  mode_sobre: false,
  emoji: "🧊",
  court: "ça refroidit",
  titre: "Elle prend ses distances",
  sous_titre: "Inès répond moins, Sam insiste.",
  preuves: ["m0002"],
  confiance: "probable",
  confiance_texte: "Des réponses de plus en plus courtes.",
  niveau: "parle",
  niveau_pourquoi: "Vous ne vous êtes pas encore vus.",
  tendance: "↘ ça baisse",
  prochain_pas: "Laisse-lui de l’air.",
  devinette: null,
};
const ALERTE: Verdict = { ...VERDICT, alerte: "danger", mode_sobre: true };
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
const SORTIE_SOBRE: Rapport = { alerte: "danger", mode_sobre: true, decouvertes: [], these: "", chapitres: [], sobre: null };

/** Ce que lit le rapport juste après le verdict : rien d’écrit encore (sauf ce que `l` change). */
const lu = (sortie: Verdict, l: Partial<RapportLu> = {}): RapportLu => ({
  storyId: "00000000-0000-4000-8000-000000000002",
  autre: "Inès",
  debloque: false,
  verdict: { sortie, scores: [{ label: "Qui relance", winner: "toi", toiPercent: 70 }] },
  donnees: null,
  plan: null,
  partiels: [],
  taches: {},
  vocal: null,
  voix: true,
  maintenant: 0,
  ...l,
});

describe("alerte : le verdict dit le mode sobre avant le rapport doux", () => {
  it.each([false, true])("une alerte, rien d’écrit encore (débloqué : %s) : alerte vraie, sober encore null, le rapport s’écrit", (debloque) => {
    const r = assemblerRapport(lu(ALERTE, { debloque }));
    expect(r.alerte).toBe(true);
    expect(r.sober).toBeNull();
    /* Le front relit le rapport (la phase `ecriture`) jusqu’au rapport doux */
    expect(r.generating).toBe(true);
  });

  it("une alerte, le rapport doux écrit : alerte toujours vraie, et sober présent", () => {
    const r = assemblerRapport(lu(ALERTE, { donnees: { sortie: SORTIE_SOBRE, chapitres: [], sobre: SOBRE, lecture: { free: "1 min", full: "2 min" } } }));
    expect(r.alerte).toBe(true);
    expect(r.sober).toBe(SOBRE);
    expect(r.generating).toBe(false);
  });

  it.each([false, true])("sans alerte (débloqué : %s) : alerte fausse, la scène du verdict se joue", (debloque) => {
    const r = assemblerRapport(lu(VERDICT, { debloque }));
    expect(r.alerte).toBe(false);
    expect(r.sober).toBeNull();
  });
});
