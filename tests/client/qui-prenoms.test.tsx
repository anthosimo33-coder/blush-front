import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuiScreen } from "@/app/qui/QuiScreen";
import { setJourney } from "@/state/journey";
import type { Person } from "@/types";

/*
 * « Qui es-tu ? » après des captures (src/app/qui/QuiScreen.tsx) : ton prénom toujours, et le sien quand la lecture n’a
 * pas lu son nom en haut de la conv (« Elle », un numéro : nomLu). Sans lui, « Continuer » attend. Sur un export, le
 * sien quand son nom de contact ne le dit pas (doutePrenom, que le serveur pose sur la carte : `nameCheck`), une fois
 * que tu as choisi qui tu es ; et deux personnes au même prénom se distinguent sur leurs cartes.
 */
const routeur = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => routeur, usePathname: () => "/qui", useSearchParams: () => new URLSearchParams() }));

const moi: Person = { id: "p0", name: "Moi", initial: "M" };
const autre = (name: string, nameCheck?: Person["nameCheck"]): Person => ({ id: "p1", name, initial: name.slice(0, 1), ...(nameCheck ? { nameCheck } : {}) });

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
      render(<QuiScreen people={[moi, autre(nom, "unknown")]} captures />);
      expect(screen.getByLabelText("Ton prénom (dans votre conv, tu es à droite)")).toBeTruthy();
      fireEvent.change(screen.getByPlaceholderText("Ton prénom"), { target: { value: "Tom" } });
      expect(continuer().hasAttribute("disabled")).toBe(true);
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Son prénom (on ne l’a pas trouvé dans votre conv)"), { target: { value: "Léa" } });
      });
      expect(continuer().hasAttribute("disabled")).toBe(false);
    });
});

describe("« Qui es-tu ? » sur un export", () => {
  const tom: Person = { id: "p0", name: "Tom", initial: "T" };
  const carte = (nom: string) => screen.getByRole("radio", { name: new RegExp(nom) });

  it("un prénom : rien de plus à écrire", () => {
    render(<QuiScreen people={[tom, autre("Léa")]} />);
    expect(screen.queryByPlaceholderText("Son prénom")).toBeNull();
    expect(continuer().hasAttribute("disabled")).toBe(false);
  });

  it("un surnom : on propose d’écrire son prénom, sans l’exiger, une fois que tu as choisi qui tu es", async () => {
    setJourney({ me: null });
    render(<QuiScreen people={[tom, autre("Mon amour", "nickname")]} />);
    expect(screen.queryByPlaceholderText("Son prénom")).toBeNull();
    await act(async () => {
      fireEvent.click(carte("Tom"));
    });
    /* La recherche par libellé ramène les insécables à des espaces */
    expect(screen.getByLabelText("Son prénom (« Mon amour », c’est un surnom ?)")).toBeTruthy();
    expect(continuer().hasAttribute("disabled")).toBe(false);
  });

  it("un numéro : son prénom est demandé, et changer de carte efface celui écrit pour l’autre d’avant", async () => {
    setJourney({ me: null });
    render(<QuiScreen people={[{ ...tom, nameCheck: "unknown", name: "+33 6 12 34 56 78" }, autre("+33 7 98 76 54 32", "unknown")]} />);
    await act(async () => {
      fireEvent.click(carte("\\+33 6"));
    });
    expect(continuer().hasAttribute("disabled")).toBe(true);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Son prénom (on ne l’a pas trouvé dans votre conv)"), { target: { value: "Léa" } });
    });
    expect(continuer().hasAttribute("disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(carte("\\+33 7"));
    });
    expect((screen.getByPlaceholderText("Son prénom") as HTMLInputElement).value).toBe("");
    expect(continuer().hasAttribute("disabled")).toBe(true);
  });

  it("le premier choix, après un morceau ajouté (toi s’y redemande), garde son prénom déjà écrit", async () => {
    setJourney({ me: null, prenomAutre: "Léa" });
    render(<QuiScreen people={[tom, autre("Mon amour", "nickname")]} />);
    await act(async () => {
      fireEvent.click(carte("Tom"));
    });
    expect((screen.getByPlaceholderText("Son prénom") as HTMLInputElement).value).toBe("Léa");
  });

  it("deux Léa : chaque carte dit son nom d’export et ses messages, jamais dans l’enregistrement des visites", () => {
    render(
      <QuiScreen
        people={[
          { id: "p0", name: "Léa M.", initial: "L", detail: "Léa Martin · 75 messages" },
          { id: "p1", name: "Léa D.", initial: "L", detail: "Léa Dubois · 25 messages" },
        ]}
      />,
    );
    expect(screen.getByText("Léa Martin · 75 messages").hasAttribute("data-prive")).toBe(true);
    expect(screen.getByText("Léa Dubois · 25 messages").hasAttribute("data-prive")).toBe(true);
  });
});
