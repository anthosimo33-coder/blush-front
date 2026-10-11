import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChoiceTile, RadioGroup, Segmented } from "@/components/ui/controls";
import { auMoins } from "../aide/listes";

/*
 * Les groupes de radios au clavier (RadioGroup, useRovingRadio : src/components/ui/controls.tsx), sous les quatre
 * sélecteurs de l’appli (Segmented, les tuiles de « Qui es-tu ? », ses deux personnes, les offres du paiement) : un seul
 * arrêt de tabulation, les flèches qui passent à l’option voisine en la choisissant, en boucle, Début et Fin.
 */

const radios = () => screen.getAllByRole("radio");
const arrets = () => radios().map((r) => r.tabIndex);

/** Trois tuiles de choix, comme « Ce que tu veux » : rien de coché au départ, sauf `depart`. */
function Tuiles({ depart = null, onChange }: { depart?: string | null; onChange?: (v: string) => void }) {
  const [choix, setChoix] = useState<string | null>(depart);
  const choisir = (v: string) => {
    setChoix(v);
    onChange?.(v);
  };
  return (
    <RadioGroup label="Ce que tu veux" className="flex">
      {["ensemble", "reciproque", "comprendre"].map((v) => (
        <ChoiceTile key={v} icon="heart" tone="elle" label={v} selected={choix === v} onClick={() => choisir(v)} />
      ))}
    </RadioGroup>
  );
}

describe("RadioGroup", () => {
  it("un seul arrêt de tabulation : la première option tant que rien n’est coché, puis l’option cochée", () => {
    render(<Tuiles />);
    expect(screen.getByRole("radiogroup", { name: "Ce que tu veux" })).toBeTruthy();
    expect(arrets()).toEqual([0, -1, -1]);
    fireEvent.click(radios()[2]!);
    expect(arrets()).toEqual([-1, -1, 0]);
  });

  it("les flèches passent à l’option voisine et la choisissent, en boucle dans les deux sens", () => {
    const onChange = vi.fn();
    render(<Tuiles depart="ensemble" onChange={onChange} />);
    const [a, b, c] = auMoins(radios(), 3);
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(document.activeElement).toBe(b);
    expect(b.getAttribute("aria-checked")).toBe("true");
    expect(arrets()).toEqual([-1, 0, -1]);
    fireEvent.keyDown(b, { key: "ArrowDown" });
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c, { key: "ArrowRight" });
    expect(document.activeElement).toBe(a);
    fireEvent.keyDown(a, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c, { key: "ArrowUp" });
    expect(document.activeElement).toBe(b);
    expect(onChange.mock.calls.map(([v]) => v)).toEqual(["reciproque", "comprendre", "ensemble", "comprendre", "reciproque"]);
  });

  it("Début et Fin vont aux extrémités ; une autre touche, ou une flèche avec un modificateur, ne change rien", () => {
    const onChange = vi.fn();
    render(<Tuiles depart="reciproque" onChange={onChange} />);
    const [a, b, c] = auMoins(radios(), 3);
    fireEvent.keyDown(b, { key: "End" });
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c, { key: "Home" });
    expect(document.activeElement).toBe(a);
    expect(onChange.mock.calls.map(([v]) => v)).toEqual(["comprendre", "ensemble"]);
    onChange.mockReset();
    expect(fireEvent.keyDown(a, { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(a, { key: "ArrowRight", altKey: true })).toBe(true);
    expect(fireEvent.keyDown(a, { key: "a" })).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    /* La flèche, elle, est gardée : la page ne défile pas */
    expect(fireEvent.keyDown(a, { key: "ArrowRight" })).toBe(false);
  });

  it("une flèche qui retombe sur l’option déjà cochée (la seule du groupe) ne la rechoisit pas", () => {
    const onChange = vi.fn();
    render(
      <RadioGroup label="Deux">
        <button type="button" role="radio" aria-checked onClick={() => onChange("un")}>
          un
        </button>
      </RadioGroup>,
    );
    const seule = radios()[0]!;
    fireEvent.keyDown(seule, { key: "ArrowRight" });
    expect(document.activeElement).toBe(seule);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Segmented", () => {
  it("un groupe de radios nommé, parcouru aux flèches", () => {
    function Choix() {
      const [v, setV] = useState<"export" | "captures">("export");
      return (
        <Segmented
          label="Ce que tu envoies"
          value={v}
          onChange={setV}
          options={[
            { value: "export", label: "Un export" },
            { value: "captures", label: "Des captures" },
          ]}
        />
      );
    }
    render(<Choix />);
    expect(screen.getByRole("radiogroup", { name: "Ce que tu envoies" })).toBeTruthy();
    expect(arrets()).toEqual([0, -1]);
    fireEvent.keyDown(radios()[0]!, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Des captures" }).getAttribute("aria-checked")).toBe("true");
    expect(arrets()).toEqual([-1, 0]);
  });
});
