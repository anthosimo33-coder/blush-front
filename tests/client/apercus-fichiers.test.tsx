import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { useApercusFichiers } from "@/lib/useApercusFichiers";
import { useMonte } from "@/lib/useMonte";

/*
 * Les aperçus des fichiers choisis (src/lib/useApercusFichiers.ts) : des URL d’objet, que le navigateur garde en
 * mémoire tant qu’on ne les libère pas. Chacune est libérée une fois, au plus tard au départ de l’écran, et une vignette
 * qui arrive après ce départ l’est aussitôt. Et le drapeau « l’écran est-il toujours là ? » (src/lib/useMonte.ts).
 */

const FICHIER = new Blob([new Uint8Array(4)], { type: "image/png" });
let n = 0;
let creer: MockInstance<typeof URL.createObjectURL>;
let liberer: MockInstance<typeof URL.revokeObjectURL>;

beforeEach(() => {
  n = 0;
  creer = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:apercu-${++n}`);
  liberer = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useApercusFichiers", () => {
  it("crée l’aperçu d’un fichier, et ne le libère qu’une fois", () => {
    const { result } = renderHook(() => useApercusFichiers());
    const url = result.current.creer(FICHIER);
    expect(url).toBe("blob:apercu-1");
    expect(creer).toHaveBeenCalledWith(FICHIER);
    expect(liberer).not.toHaveBeenCalled();
    result.current.liberer(url);
    result.current.liberer(url);
    expect(liberer).toHaveBeenCalledTimes(1);
    expect(liberer).toHaveBeenCalledWith(url);
    /* Sans URL (la vignette n’est pas encore là), ou une URL qu’il n’a pas créée : rien */
    result.current.liberer(null);
    result.current.liberer(undefined);
    result.current.liberer("blob:ailleurs");
    expect(liberer).toHaveBeenCalledTimes(1);
  });

  it("au départ de l’écran, libère ce qui reste, une fois chacun", () => {
    const { result, unmount } = renderHook(() => useApercusFichiers());
    const a = result.current.creer(FICHIER);
    const b = result.current.creer(FICHIER);
    const c = result.current.creer(FICHIER);
    result.current.liberer(b);
    unmount();
    expect(liberer.mock.calls.map(([u]) => u).sort()).toEqual([a, b, c].sort());
    /* Libérer après le départ ne relibère rien */
    result.current.liberer(a);
    expect(liberer).toHaveBeenCalledTimes(3);
  });

  it("un aperçu créé après le départ (une vignette arrivée trop tard) est libéré aussitôt", () => {
    const { result, unmount } = renderHook(() => useApercusFichiers());
    const { creer: creerApres } = result.current;
    unmount();
    expect(liberer).not.toHaveBeenCalled();
    const tard = creerApres(FICHIER);
    expect(liberer).toHaveBeenCalledTimes(1);
    expect(liberer).toHaveBeenCalledWith(tard);
  });

  it("garde les mêmes fonctions d’un rendu à l’autre", () => {
    const { result, rerender } = renderHook(() => useApercusFichiers());
    const avant = result.current;
    rerender();
    expect(result.current).toBe(avant);
  });
});

describe("useMonte", () => {
  it("vrai tant que l’écran est là, faux après son départ", () => {
    const { result, unmount } = renderHook(() => useMonte());
    const monte = result.current;
    expect(monte.current).toBe(true);
    unmount();
    expect(monte.current).toBe(false);
  });
});
