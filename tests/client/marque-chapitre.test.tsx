import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LigneEcriture, MarqueChapitre } from "@/app/rapport/Ecriture";

/*
 * L’état d’un chapitre pendant l’écriture (src/app/rapport/Ecriture.tsx) : dans le sommaire, rien d’autre ne le dit, les
 * trois états sont des images nommées ; sur la ligne de « La suite s’écrit », le texte visible le dit déjà, la marque se tait.
 */

describe("MarqueChapitre", () => {
  it("nomme les trois états de la même façon (une image) dans le sommaire", () => {
    const { rerender } = render(<MarqueChapitre etat="ecrit" />);
    expect(screen.getByRole("img", { name: "prêt" })).toBeTruthy();
    rerender(<MarqueChapitre etat="en_cours" />);
    expect(screen.getByRole("img", { name: "en cours d’écriture" })).toBeTruthy();
    rerender(<MarqueChapitre etat="attente" />);
    expect(screen.getByRole("img", { name: "en attente" })).toBeTruthy();
  });

  it("se tait à côté du texte visible de la ligne : l’état n’est annoncé qu’une fois", () => {
    for (const [etat, texte] of [
      ["ecrit", "Prêt"],
      ["en_cours", "S’écrit"],
      ["attente", "En attente"],
    ] as const) {
      const { unmount } = render(<LigneEcriture number={3} title="Le chapitre" etat={etat} />);
      expect(screen.getByText(texte)).toBeTruthy();
      expect(screen.queryAllByRole("img")).toHaveLength(0);
      unmount();
    }
  });
});
