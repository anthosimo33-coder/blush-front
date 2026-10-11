import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ancreDuChapitre, chapitreDeLAncre, titreDuChapitre } from "@/app/rapport/ancres";
import { ecritureInachevee, phaseDuRapport, type PhaseDuRapport } from "@/app/rapport/phase";
import { Suite } from "@/app/rapport/Suite";
import type { Chapter } from "@/types";
import type { EcritureRapport, ReportPayload } from "@/types/api";

/*
 * La phase du rapport (src/app/rapport/phase.ts) : une seule valeur, d’après ce que répond GET /api/rapport, au lieu de
 * drapeaux lus chacun à part. Puis ce que la suite du rapport (Suite.tsx) en montre, et ses ancres (ancres.ts).
 */

type Entree = Pick<ReportPayload, "access" | "generating" | "ecriture" | "echec">;
const ecriture: EcritureRapport = { etape: "plan", progres: 0.1, chapitres: [], restant: null };

describe("phaseDuRapport", () => {
  it.each<[string, Entree, PhaseDuRapport]>([
    ["sans accès : l’aperçu", { access: "gratuit" }, { nom: "lecture" }],
    ["avec le rapport, écrit", { access: "rapport" }, { nom: "complet" }],
    ["avec BLUSH+, écrit", { access: "blushplus" }, { nom: "complet" }],
    ["l’écriture lancée, sans avancée encore", { access: "rapport", generating: true }, { nom: "ecriture" }],
    ["l’écriture et son avancée", { access: "blushplus", generating: true, ecriture }, { nom: "ecriture", ecriture }],
    ["le mode sobre pas encore écrit, sans accès", { access: "gratuit", generating: true }, { nom: "ecriture" }],
    ["une panne", { access: "rapport", echec: "panne" }, { nom: "echec", raison: "panne" }],
    ["un refus du modèle", { access: "rapport", echec: "refus" }, { nom: "echec", raison: "refus" }],
    ["le budget du jour atteint", { access: "rapport", echec: "souffle" }, { nom: "souffle" }],
    ["generating: false explicite", { access: "rapport", generating: false }, { nom: "complet" }],
    /* Le serveur ne les envoie jamais ensemble : l’échec, définitif, passerait avant */
    ["un échec avec generating", { access: "rapport", generating: true, echec: "panne" }, { nom: "echec", raison: "panne" }],
  ])("%s", (_, entree, phase) => {
    expect(phaseDuRapport(entree)).toEqual(phase);
  });

  it("l’écriture inachevée : elle s’écrit, a échoué, ou attend le budget du lendemain", () => {
    const phases: [PhaseDuRapport, boolean][] = [
      [{ nom: "lecture" }, false],
      [{ nom: "complet" }, false],
      [{ nom: "ecriture" }, true],
      [{ nom: "echec", raison: "refus" }, true],
      [{ nom: "souffle" }, true],
    ];
    for (const [phase, inachevee] of phases) expect(ecritureInachevee(phase)).toBe(inachevee);
  });
});

describe("Suite : ce que la phase montre après les chapitres ouverts", () => {
  const fermes: Chapter[] = [2, 3].map((n) => ({ number: n, title: `Chapitre inventé ${n}`, tocTitle: `Chapitre inventé ${n}`, free: false, locked: true, blocks: [] }));
  const rendre = (phase: PhaseDuRapport, access: ReportPayload["access"] = "rapport", ouvrirPaiement = () => {}) =>
    render(<Suite phase={phase} fermes={fermes} access={access} ouvrirPaiement={ouvrirPaiement} />);

  it("l’aperçu : les chapitres fermés mènent au paiement, sans « Ta question »", () => {
    const ouvrirPaiement = vi.fn();
    rendre({ nom: "lecture" }, "gratuit", ouvrirPaiement);
    expect(screen.getByText("La suite de ton rapport · 2 chapitres")).toBeTruthy();
    screen.getByRole("button", { name: /Chapitre inventé 2/ }).click();
    expect(ouvrirPaiement).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Poser ma question à BLUSH")).toBeNull();
  });

  it("le rapport écrit : « Ta question », incluse avec le rapport seul", () => {
    rendre({ nom: "complet" }, "rapport");
    expect(screen.getByText("Poser ma question à BLUSH")).toBeTruthy();
    expect(screen.getByText("Une question incluse avec ton rapport")).toBeTruthy();
  });

  it("une panne se relance ; un refus et le budget du jour, non", () => {
    const panne = rendre({ nom: "echec", raison: "panne" });
    expect(screen.getByRole("alert").textContent).toBe("La suite de ton rapport n’a pas pu s’écrire.");
    expect(screen.getByRole("button", { name: "Relancer l’écriture" })).toBeTruthy();
    panne.unmount();
    for (const phase of [{ nom: "echec", raison: "refus" }, { nom: "souffle" }] satisfies PhaseDuRapport[]) {
      const r = rendre(phase);
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Relancer l’écriture" })).toBeNull();
      expect(screen.queryByText("Poser ma question à BLUSH")).toBeNull();
      r.unmount();
    }
  });
});

describe("les ancres du rapport", () => {
  it("chaque chapitre a sa section et son titre, sous la forme que visent les liens (/rapport#chapitre-N)", () => {
    expect(ancreDuChapitre(3)).toBe("chapitre-3");
    expect(titreDuChapitre(3)).toBe("chapitre-3-titre");
  });

  it.each<[string, number | null]>([
    ["#chapitre-2", 2],
    ["#chapitre-12", 12],
    ["", null],
    ["#chapitre-", null],
    ["#chapitre-2-titre", null],
    ["#autre", null],
  ])("« %s » → %s", (hash, n) => {
    expect(chapitreDeLAncre(hash)).toBe(n);
  });
});
