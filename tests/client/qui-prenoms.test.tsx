import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuiScreen } from "@/app/qui/QuiScreen";
import { setJourney } from "@/state/journey";
import type { Person } from "@/types";

/*
 * « Qui es-tu ? » après des captures (src/app/qui/QuiScreen.tsx) : ton prénom toujours, et le sien quand la lecture n’a
 * pas lu son nom en haut de la conv (« Elle », un numéro : nomLu). Sans lui, « Continuer » attend.
 */
const routeur = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => routeur, usePathname: () => "/qui", useSearchParams: () => new URLSearchParams() }));

const moi: Person = { id: "p0", name: "Moi", initial: "M" };
const autre = (name: string): Person => ({ id: "p1", name, initial: name.slice(0, 1) });

beforeEach(() => {
  sessionStorage.clear();
  /* Tout est rempli, sauf les prénoms */
  setJourney({ me: "p0", pronom: "il", guess: "parle", goal: "comprendre", prenom: "", prenomAutre: "" });
});
afterEach(cleanup);

const continuer = () => screen.getByRole("button", { name: /Continuer/ });

describe("« Qui es-tu ? » sur des captures", () => {
  it("son nom lu : on ne demande que le tien, et la phrase le nomme", () => {
    render(<QuiScreen people={[moi, autre("Inès")]} captures />);
    expect(screen.getByLabelText("Ton prénom (dans votre conv avec Inès, tu es à droite)")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Son prénom")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Ton prénom"), { target: { value: "Tom" } });
    expect(continuer().hasAttribute("disabled")).toBe(false);
  });

  for (const nom of ["Elle", "+33 6 12 34 56 78"])
    it(`son nom pas lu (« ${nom} ») : on demande aussi le sien, et « Continuer » l’attend`, async () => {
      render(<QuiScreen people={[moi, autre(nom)]} captures />);
      expect(screen.getByLabelText("Ton prénom (dans votre conv, tu es à droite)")).toBeTruthy();
      fireEvent.change(screen.getByPlaceholderText("Ton prénom"), { target: { value: "Tom" } });
      expect(continuer().hasAttribute("disabled")).toBe(true);
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Son prénom (on ne l’a pas trouvé dans votre conv)"), { target: { value: "Léa" } });
      });
      expect(continuer().hasAttribute("disabled")).toBe(false);
    });
});
