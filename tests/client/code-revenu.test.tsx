import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ECOUTE, useCodeRevenu } from "@/lib/useCodeRevenu";
import { codeRevenu } from "@/services/api";

/*
 * L’écoute du mail du code revenu (src/lib/useCodeRevenu.ts) : l’écran du code demande au serveur (GET /api/auth/code,
 * simulé ici) toutes les quelques secondes après l’envoi, onglet visible seulement, puis à chaque retour sur l’onglet ;
 * un nouvel envoi repart de zéro.
 */
vi.mock("@/services/api", async (vrai) => ({ ...(await vrai<typeof import("@/services/api")>()), codeRevenu: vi.fn() }));
const demander = vi.mocked(codeRevenu);

let visibilite: DocumentVisibilityState = "visible";
const montrer = (v: DocumentVisibilityState) =>
  act(() => {
    visibilite = v;
    document.dispatchEvent(new Event("visibilitychange"));
  });
const attendre = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  demander.mockReset();
  visibilite = "visible";
  Object.defineProperty(document, "visibilityState", { get: () => visibilite, configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
  /* Le document retrouve sa visibilité à lui */
  Reflect.deleteProperty(document, "visibilityState");
});

describe("le mail du code revenu", () => {
  it("demande toutes les 3 s : revenu dès que le serveur le dit, puis plus rien", async () => {
    demander.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true);
    const { result } = renderHook(() => useCodeRevenu(0));
    expect(result.current).toBe(false);
    await attendre(ECOUTE.intervalleMs * 2);
    expect(result.current).toBe(false);
    await attendre(ECOUTE.intervalleMs);
    expect(result.current).toBe(true);
    await attendre(ECOUTE.intervalleMs * 3);
    expect(demander).toHaveBeenCalledTimes(3);
  });

  it("s’arrête au bout de 45 s ; onglet caché, rien ; au retour sur l’onglet, une demande", async () => {
    demander.mockResolvedValue(false);
    const { result } = renderHook(() => useCodeRevenu(0));
    await attendre(ECOUTE.dureeMs + ECOUTE.intervalleMs * 3);
    expect(demander).toHaveBeenCalledTimes(ECOUTE.dureeMs / ECOUTE.intervalleMs);
    montrer("hidden");
    expect(demander).toHaveBeenCalledTimes(ECOUTE.dureeMs / ECOUTE.intervalleMs);
    demander.mockResolvedValue(true);
    montrer("visible");
    await attendre(0);
    expect(result.current).toBe(true);
  });

  it("une erreur du réseau n’arrête pas l’écoute ; un nouvel envoi repart de zéro", async () => {
    demander.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(true);
    const { result, rerender } = renderHook(({ envoi }) => useCodeRevenu(envoi), { initialProps: { envoi: 0 } });
    await attendre(ECOUTE.intervalleMs * 2);
    expect(result.current).toBe(true);
    demander.mockResolvedValue(false);
    rerender({ envoi: 1 });
    expect(result.current).toBe(false);
    await attendre(ECOUTE.intervalleMs);
    expect(result.current).toBe(false);
  });
});
