import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMomentVenu } from "@/lib/hooks";

/*
 * useMomentVenu (src/lib/hooks.ts), qui ouvre la roue du paywall (décidé le 21 octobre) : au premier des deux, le temps
 * passé sur l’écran ou la part de la page défilée ; une fois venu, il le reste. La page de jsdom n’a ni hauteur ni
 * défilement : chaque test pose les siens, retirés à la fin.
 */

/** Une page de `hauteur` px dans une fenêtre de 800 px, défilée de `defile` px (un évènement « scroll » le dit). */
function page(hauteur: number, defile = 0) {
  Object.defineProperty(document.documentElement, "scrollHeight", { value: hauteur, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  Object.defineProperty(window, "scrollY", { value: defile, configurable: true });
}

function defiler(y: number) {
  act(() => {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true });
    window.dispatchEvent(new Event("scroll"));
  });
}

describe("useMomentVenu : le temps passé ou la page défilée, au premier des deux", () => {
  const avant = { innerHeight: window.innerHeight, scrollY: window.scrollY };
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (document.documentElement as { scrollHeight?: number }).scrollHeight;
    Object.defineProperty(window, "innerHeight", { value: avant.innerHeight, configurable: true });
    Object.defineProperty(window, "scrollY", { value: avant.scrollY, configurable: true });
  });

  it("sans défiler : faux jusqu’au bout du temps, puis vrai", () => {
    page(2800);
    const { result } = renderHook(() => useMomentVenu(5_000, 0.5));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(4_999));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });

  it("la moitié de la page défilée avant le temps : vrai tout de suite, et le reste en remontant", () => {
    /* 2 800 px dans 800 : 2 000 px de course, la moitié à 1 000 */
    page(2800);
    const { result } = renderHook(() => useMomentVenu(5_000, 0.5));
    defiler(999);
    expect(result.current).toBe(false);
    defiler(1_000);
    expect(result.current).toBe(true);
    defiler(0);
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toBe(true);
  });

  it("une page trop courte pour défiler : seul le temps compte", () => {
    page(800);
    const { result } = renderHook(() => useMomentVenu(5_000, 0.5));
    defiler(0);
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(true);
  });

  it("l’écran quitté avant : plus de minuteur ni d’écoute du défilement", () => {
    page(2800);
    const retire = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useMomentVenu(5_000, 0.5));
    unmount();
    expect(retire).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    retire.mockRestore();
  });
});
