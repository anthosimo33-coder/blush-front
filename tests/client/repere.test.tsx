import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEnVue, useHauteur } from "@/lib/hooks";
import { creerRepere } from "@/lib/repere";

/*
 * Les repères (src/lib/repere.ts, suivis par src/lib/hooks.ts) : une pastille suit un élément que montre un autre écran, par sa `ref`, sans le
 * chercher dans la page ni repasser à intervalles. IntersectionObserver et ResizeObserver sont simulés : le test dit
 * quand l’élément entre à l’écran, ou change de taille.
 */

type Rappel = (entrees: Partial<IntersectionObserverEntry & ResizeObserverEntry>[]) => void;
/** Les observateurs ouverts, par élément observé : le test les déclenche. */
const observes = new Map<Element, Rappel>();

class FauxObservateur {
  constructor(private readonly rappel: Rappel) {}
  observe(el: Element) {
    observes.set(el, this.rappel);
  }
  disconnect() {
    for (const [el, r] of observes) if (r === this.rappel) observes.delete(el);
  }
}

beforeEach(() => {
  observes.clear();
  vi.stubGlobal("IntersectionObserver", FauxObservateur);
  vi.stubGlobal("ResizeObserver", FauxObservateur);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useEnVue", () => {
  it("faux tant que l’élément n’existe pas ; suit son entrée à l’écran dès qu’il arrive, sans repasser", () => {
    const repere = creerRepere();
    const { result } = renderHook(() => useEnVue(repere));
    expect(result.current).toBe(false);
    /* L’élément arrive après coup (le rapport se met à jour) : le repère prévient */
    const { unmount } = render(<div ref={repere} />);
    const el = repere.lire()!;
    expect(observes.has(el)).toBe(true);
    act(() => observes.get(el)!([{ isIntersecting: true }]));
    expect(result.current).toBe(true);
    act(() => observes.get(el)!([{ isIntersecting: false }]));
    expect(result.current).toBe(false);
    act(() => observes.get(el)!([{ isIntersecting: true }]));
    /* Il s’en va : faux, et plus rien n’est observé */
    unmount();
    expect(repere.lire()).toBeNull();
    expect(result.current).toBe(false);
    expect(observes.size).toBe(0);
  });

  it("un élément qui s’en va n’efface pas celui qui l’a déjà remplacé", () => {
    const repere = creerRepere();
    const ancien = render(<div ref={repere} />);
    render(<p ref={repere} />);
    ancien.unmount();
    expect(repere.lire()?.tagName).toBe("P");
  });
});

describe("useHauteur", () => {
  it("0 tant que l’élément n’existe pas, puis sa hauteur, suivie", () => {
    const repere = creerRepere();
    const { result } = renderHook(() => useHauteur(repere));
    expect(result.current).toBe(0);
    const { unmount } = render(<div ref={repere} />);
    const el = repere.lire()!;
    act(() => observes.get(el)!([{ borderBoxSize: [{ blockSize: 52, inlineSize: 300 }] }]));
    expect(result.current).toBe(52);
    act(() => observes.get(el)!([{ borderBoxSize: [{ blockSize: 60, inlineSize: 300 }] }]));
    expect(result.current).toBe(60);
    unmount();
    expect(result.current).toBe(0);
  });

  it("mesurée dès que l’élément arrive, avant tout rappel de l’observateur (pas d’image où la bulle saute)", () => {
    const mesure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 300, 48));
    const repere = creerRepere();
    const { result } = renderHook(() => useHauteur(repere));
    render(<div ref={repere} />);
    expect(result.current).toBe(48);
    mesure.mockRestore();
  });
});
