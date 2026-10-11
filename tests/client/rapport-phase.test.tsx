import { fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ancreDuChapitre, chapitreDeLAncre, SUITE_ECRITURE, titreDuChapitre } from "@/app/rapport/ancres";
import { ecritureInachevee, phaseDuRapport, type PhaseDuRapport } from "@/app/rapport/phase";
import { etatDeLaLigne, FeuilleSommaire, Sommaire } from "@/app/rapport/Sommaire";
import { Suite } from "@/app/rapport/Suite";
import { useReprise } from "@/app/rapport/useReprise";
import { CLE_REPRISE } from "@/state/cles";
import type { Chapter } from "@/types";
import type { EcritureRapport, ReportPayload } from "@/types/api";

/*
 * La phase du rapport (src/app/rapport/phase.ts) : une seule valeur, d’après ce que répond GET /api/rapport, au lieu de
 * drapeaux lus chacun à part. Puis ce que la suite du rapport (Suite.tsx) et les deux sommaires (Sommaire.tsx) en
 * montrent, la reprise de la lecture (useReprise.ts), et les ancres (ancres.ts).
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

const chapitre = (n: number, locked: boolean): Chapter => ({ number: n, title: `Chapitre inventé ${n}`, tocTitle: `Chapitre inventé ${n}`, free: !locked, locked, blocks: [] });
const fermes: Chapter[] = [2, 3].map((n) => chapitre(n, true));
const chapitres: Chapter[] = [chapitre(1, false), ...fermes];
/* Toutes les phases où l’écriture a été lancée sans aboutir */
const inachevees: PhaseDuRapport[] = [{ nom: "ecriture" }, { nom: "echec", raison: "panne" }, { nom: "souffle" }];

describe("Suite : ce que la phase montre après les chapitres ouverts", () => {
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

  it("l’écriture : la liste de ce qui s’écrit (que la pastille surveille), sans paiement ni « Ta question »", async () => {
    const ouvrirPaiement = vi.fn();
    const { container } = rendre({ nom: "ecriture" }, "rapport", ouvrirPaiement);
    expect(screen.getByText("La suite de ton rapport s’écrit · 2 chapitres")).toBeTruthy();
    /* La liste que la pastille suit, par son repère */
    const liste = SUITE_ECRITURE.lire()!;
    expect(container.contains(liste)).toBe(true);
    /* Ses lignes sont chargées à part (next/dynamic) */
    expect(await within(liste).findByText("Chapitre inventé 2")).toBeTruthy();
    expect(within(liste).getByText("Chapitre inventé 3")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Poser ma question à BLUSH")).toBeNull();
    expect(ouvrirPaiement).not.toHaveBeenCalled();
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

describe("les sommaires : une même règle par ligne, d’après la phase", () => {
  it("etatDeLaLigne : un chapitre ouvert y mène ; fermé, il ouvre le paiement, sauf l’écriture lancée et pas aboutie", () => {
    for (const phase of [{ nom: "lecture" }, { nom: "complet" }, ...inachevees] satisfies PhaseDuRapport[]) expect(etatDeLaLigne({ locked: false }, phase)).toBe("ouvert");
    expect(etatDeLaLigne({ locked: true }, { nom: "lecture" })).toBe("paiement");
    expect(etatDeLaLigne({ locked: true }, { nom: "complet" })).toBe("paiement");
    for (const phase of inachevees) expect(etatDeLaLigne({ locked: true }, phase)).toBe("ecriture");
  });

  describe("la feuille (téléphone)", () => {
    /* Le DOM simulé n’a ni matchMedia ni animate : la feuille s’ouvre sans animation */
    const { animate } = Element.prototype;
    beforeEach(() => {
      vi.spyOn(window, "matchMedia").mockImplementation(
        (requete: string) => ({ matches: false, media: requete, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
      );
      Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel: () => {} }) as unknown as Animation;
    });
    afterEach(() => {
      Element.prototype.animate = animate;
      vi.restoreAllMocks();
    });
    const rendre = (phase: PhaseDuRapport) => {
      const ouvrirPaiement = vi.fn();
      const onClose = vi.fn();
      const r = render(<FeuilleSommaire open onClose={onClose} chapters={chapitres} current={1} allerAuChapitre={() => {}} ouvrirPaiement={ouvrirPaiement} phase={phase} />);
      return { ...r, ouvrirPaiement, onClose };
    };
    /* La ligne d’un chapitre, d’après son titre : la plus profonde qui le contient (les lignes n’ont que des spans) */
    const ligne = (container: HTMLElement, titre: string) => [...container.querySelectorAll("button, div")].findLast((el) => el.textContent?.includes(titre))!;

    it("l’aperçu : un chapitre fermé, touché, ferme la feuille et ouvre le paiement ; il se dit verrouillé", () => {
      const { container, ouvrirPaiement, onClose } = rendre({ nom: "lecture" });
      const ferme = within(container).getByRole("button", { name: /^Chapitre inventé 2.*\(verrouillé\)$/, hidden: true });
      fireEvent.click(ferme);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(ouvrirPaiement).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Poser ma question à BLUSH")).toBeNull();
    });

    it.each(inachevees)("l’accès là et l’écriture pas aboutie ($nom) : un chapitre fermé ne mène pas au paiement, et pas de « Ta question »", (phase) => {
      const { container, ouvrirPaiement, onClose } = rendre(phase);
      const ferme = ligne(container, "Chapitre inventé 2");
      expect(ferme.tagName).toBe("DIV");
      expect(ferme.textContent).toContain("(verrouillé)");
      fireEvent.click(ferme);
      expect(ouvrirPaiement).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByText("Poser ma question à BLUSH")).toBeNull();
    });

    it("le rapport écrit : « Poser ma question à BLUSH » en bas ; la feuille est nommée par son titre", () => {
      const { container } = rendre({ nom: "complet" });
      expect(screen.getByText("Poser ma question à BLUSH")).toBeTruthy();
      const dialogue = container.querySelector("dialog")!;
      const titre = document.getElementById(dialogue.getAttribute("aria-labelledby")!);
      expect(titre?.textContent).toBe("Sommaire");
    });
  });

  describe("la colonne (ordinateur)", () => {
    const rendre = (phase: PhaseDuRapport) => {
      const ouvrirPaiement = vi.fn();
      const r = render(<Sommaire chapters={chapitres} current={1} allerAuChapitre={() => {}} ouvrirPaiement={ouvrirPaiement} phase={phase} />);
      return { ...r, ouvrirPaiement };
    };

    it("l’aperçu : un chapitre fermé ouvre le paiement", () => {
      const { ouvrirPaiement } = rendre({ nom: "lecture" });
      fireEvent.click(screen.getByRole("button", { name: /^Chapitre inventé 2.*\(verrouillé\)$/ }));
      expect(ouvrirPaiement).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Ta question")).toBeNull();
    });

    it.each(inachevees)("l’écriture pas aboutie ($nom) : aucun chapitre fermé ne se touche, pas de « Ta question »", (phase) => {
      rendre(phase);
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.queryByText("Ta question")).toBeNull();
    });

    it("le rapport écrit : « Ta question »", () => {
      rendre({ nom: "complet" });
      expect(screen.getByText("Ta question")).toBeTruthy();
    });
  });
});

describe("useReprise : la reprise gardée sur ce navigateur", () => {
  beforeEach(() => {
    localStorage.clear();
    /* Les sections des chapitres ouverts : le DOM simulé les met toutes en haut de l’écran, le dernier est donc à l’écran */
    for (const n of [1, 2]) {
      const section = document.createElement("section");
      section.id = ancreDuChapitre(n);
      document.body.append(section);
    }
  });
  afterEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
  });

  it("une valeur abîmée sous CLE_REPRISE ne bloque pas : le chapitre lu la remplace", () => {
    localStorage.setItem(CLE_REPRISE, "{abîmé");
    const { result } = renderHook(() => useReprise("histoire-inventee", "1,2"));
    expect(result.current.current).toBe(2);
    expect(JSON.parse(localStorage.getItem(CLE_REPRISE)!)).toEqual({ "histoire-inventee": 2 });
  });

  it("les reprises des autres convs sont gardées", () => {
    localStorage.setItem(CLE_REPRISE, JSON.stringify({ autre: 3 }));
    renderHook(() => useReprise("histoire-inventee", "1,2"));
    expect(JSON.parse(localStorage.getItem(CLE_REPRISE)!)).toEqual({ autre: 3, "histoire-inventee": 2 });
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
