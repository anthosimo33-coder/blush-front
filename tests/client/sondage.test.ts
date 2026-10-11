import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSondage, type SuiteDuSondage } from "@/lib/useSondage";

/*
 * useSondage (src/lib/useSondage.ts) : relire à intervalles tant qu’il le faut. Les minuteurs sont simulés : le temps
 * n’avance que quand le test le dit (avancer).
 */

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Avance le temps de `ms`, en laissant finir les tours qui attendent une promesse. */
const avancer = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("useSondage", () => {
  it("un tour toutes les `intervalle` ms, le premier après une attente, tant qu’il est actif", async () => {
    const tour = vi.fn();
    const { rerender, unmount } = renderHook(({ actif }) => useSondage(tour, { actif, intervalle: 2000 }), { initialProps: { actif: true } });
    await avancer(1999);
    expect(tour).not.toHaveBeenCalled();
    await avancer(1);
    expect(tour).toHaveBeenCalledTimes(1);
    await avancer(4000);
    expect(tour).toHaveBeenCalledTimes(3);
    /* Plus actif (le rapport écrit) : plus aucun tour */
    rerender({ actif: false });
    await avancer(10_000);
    expect(tour).toHaveBeenCalledTimes(3);
    /* Actif de nouveau : ça repart, après une attente */
    rerender({ actif: true });
    await avancer(2000);
    expect(tour).toHaveBeenCalledTimes(4);
    unmount();
    await avancer(10_000);
    expect(tour).toHaveBeenCalledTimes(4);
  });

  it("`immediat` : le premier tour part tout de suite", async () => {
    const tour = vi.fn();
    renderHook(() => useSondage(tour, { intervalle: 1000, immediat: true }));
    await avancer(0);
    expect(tour).toHaveBeenCalledTimes(1);
  });

  it("un tour attend la fin du précédent : jamais deux lectures en même temps", async () => {
    let enCours = 0;
    let auPlus = 0;
    const tour = vi.fn(async () => {
      auPlus = Math.max(auPlus, ++enCours);
      await new Promise((r) => setTimeout(r, 5000));
      enCours -= 1;
    });
    renderHook(() => useSondage(tour, { intervalle: 1000 }));
    await avancer(20_000);
    expect(auPlus).toBe(1);
    /* 1 s d’attente, 5 s de lecture : un tour toutes les 6 s (à 1, 7, 13 et 19 s) */
    expect(tour).toHaveBeenCalledTimes(4);
  });

  it("le tour décide de la suite : un délai à lui, ou l’arrêt", async () => {
    const suites: SuiteDuSondage[] = [500, undefined, false];
    const tour = vi.fn(() => suites.shift());
    renderHook(() => useSondage(tour, { intervalle: 1000 }));
    await avancer(1000);
    expect(tour).toHaveBeenCalledTimes(1);
    /* Il a demandé 500 ms */
    await avancer(500);
    expect(tour).toHaveBeenCalledTimes(2);
    /* Rien : l’intervalle */
    await avancer(1000);
    expect(tour).toHaveBeenCalledTimes(3);
    /* false : fini */
    await avancer(10_000);
    expect(tour).toHaveBeenCalledTimes(3);
  });

  it("un tour qui lève ne casse pas le sondage : le suivant part à l’intervalle", async () => {
    const tour = vi.fn(async () => {
      throw new Error("réseau");
    });
    renderHook(() => useSondage(tour, { intervalle: 1000 }));
    await avancer(3000);
    expect(tour).toHaveBeenCalledTimes(3);
  });

  it("démonté pendant un tour : sa réponse arrive, et rien ne repart", async () => {
    let finir = () => {};
    const tour = vi.fn(() => new Promise<void>((r) => (finir = r)));
    const { unmount } = renderHook(() => useSondage(tour, { intervalle: 1000 }));
    await avancer(1000);
    expect(tour).toHaveBeenCalledTimes(1);
    unmount();
    finir();
    await avancer(10_000);
    expect(tour).toHaveBeenCalledTimes(1);
  });

  it("c’est toujours le dernier `tour` rendu qui sert, sans relancer l’attente", async () => {
    const premier = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ tour }) => useSondage(tour, { intervalle: 1000 }), { initialProps: { tour: premier } });
    await avancer(600);
    rerender({ tour: second });
    await avancer(400);
    expect(premier).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
