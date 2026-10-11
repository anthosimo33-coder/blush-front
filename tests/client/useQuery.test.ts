import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidate, MontageDeLaPage, setQueryData, useQuery } from "@/lib/query";
import type { Account } from "@/types/api";
import { renduNeuf } from "./temps";

/*
 * useQuery (src/lib/query.ts) monté dans un écran : la donnée rendue par le serveur, relue ou non au montage (`rendu`,
 * `frais`), et ce qu’une relecture change. Les règles hors de React (depart, renduFrais…) : tests/query.test.ts.
 * Le cache du module est partagé par tout le fichier : chaque test part d’un cache vide pour sa clé, et chaque rendu a
 * son heure (renduNeuf : deux rendus de la même milliseconde passeraient pour le même rendu revu).
 */

/* Un compte, que son email distingue d’une version à l’autre */
const compte = (email: string): Account => ({
  email,
  subscription: { plan: "blushplus", priceLabel: "", renewLabel: "", stopLabel: "", active: true, paused: false },
  storyDeleted: false,
});

beforeEach(() => invalidate("account"));

describe("useQuery : rendu par le serveur, ou relu", () => {
  it("une donnée que le serveur vient de rendre n’est pas relue au montage ; revue (le même rendu), elle l’est", async () => {
    const lire = vi.fn(async () => compte("relu@blush.test"));
    const rendu = renduNeuf();
    const { result } = renderHook(() => useQuery("account", lire, compte("rendu@blush.test"), { rendu, frais: 10_000 }));
    expect(result.current.data?.email).toBe("rendu@blush.test");
    expect(result.current.loading).toBe(false);
    await act(() => Promise.resolve());
    expect(lire).not.toHaveBeenCalled();

    /* La même page revue par l’historique : le même rendu, peut-être périmé, est relu */
    const revue = renderHook(() => useQuery("account", lire, compte("rendu@blush.test"), { rendu, frais: 10_000 }));
    await waitFor(() => expect(revue.result.current.data?.email).toBe("relu@blush.test"));
    expect(lire).toHaveBeenCalledTimes(1);
  });

  it("dans une page qui donne son montage, deux écrans de la même clé (la coque et son écran) ne relisent pas le rendu ; la page remontée, si", async () => {
    const lire = vi.fn(async () => compte("relu@blush.test"));
    const rendu = renduNeuf();
    const montage = {};
    const page = ({ children }: { children: ReactNode }) => createElement(MontageDeLaPage, { value: montage }, children);
    const useDeuxEcrans = () => [
      useQuery("account", lire, compte("rendu@blush.test"), { rendu, frais: 10_000 }),
      useQuery("account", lire, compte("rendu@blush.test"), { rendu, frais: 10_000 }),
    ];
    const { result } = renderHook(useDeuxEcrans, { wrapper: page });
    await act(() => Promise.resolve());
    expect(lire).not.toHaveBeenCalled();
    expect(result.current.map((r) => r.data?.email)).toEqual(["rendu@blush.test", "rendu@blush.test"]);

    /* Revue par l’historique, la page est un autre montage : le même rendu est relu */
    const autreMontage = {};
    const revue = renderHook(() => useQuery("account", lire, compte("rendu@blush.test"), { rendu, frais: 10_000 }), {
      wrapper: ({ children }: { children: ReactNode }) => createElement(MontageDeLaPage, { value: autreMontage }, children),
    });
    await waitFor(() => expect(revue.result.current.data?.email).toBe("relu@blush.test"));
    expect(lire).toHaveBeenCalledTimes(1);
  });

  it("un rendu trop ancien, ou sans fraîcheur demandée, est relu au montage", async () => {
    const lire = vi.fn(async () => compte("frais@blush.test"));
    const vieux = renduNeuf(-60_000);
    const ancien = renderHook(() => useQuery("account", lire, compte("vieux@blush.test"), { rendu: vieux, frais: 10_000 }));
    expect(ancien.result.current.data?.email).toBe("vieux@blush.test");
    await waitFor(() => expect(ancien.result.current.data?.email).toBe("frais@blush.test"));
    const neuf = renduNeuf();
    const sansFrais = renderHook(() => useQuery("account", lire, compte("vieux@blush.test"), { rendu: neuf }));
    await waitFor(() => expect(sansFrais.result.current.data?.email).toBe("frais@blush.test"));
    expect(lire).toHaveBeenCalledTimes(2);
  });

  it("`fetch: false` : la donnée de départ reste, sans relire", async () => {
    const lire = vi.fn(async () => compte("relu@blush.test"));
    const { result } = renderHook(() => useQuery("account", lire, compte("fige@blush.test"), { fetch: false }));
    await act(() => Promise.resolve());
    expect(lire).not.toHaveBeenCalled();
    expect(result.current.data?.email).toBe("fige@blush.test");
  });

  it("une lecture qui échoue garde la donnée qu’on a, et le dit", async () => {
    const lire = vi.fn(async (): Promise<Account> => {
      throw new Error("réseau");
    });
    const { result } = renderHook(() => useQuery("account", lire, compte("garde@blush.test")));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data?.email).toBe("garde@blush.test");
    expect(result.current.loading).toBe(false);
  });

  it("sans donnée de départ : chargement, puis la donnée lue ; une mise à jour optimiste la remplace sans relire", async () => {
    const lire = vi.fn(async () => compte("lu@blush.test"));
    const { result } = renderHook(() => useQuery("account", lire));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data?.email).toBe("lu@blush.test"));
    act(() => setQueryData("account", compte("change@blush.test")));
    expect(result.current.data?.email).toBe("change@blush.test");
    expect(lire).toHaveBeenCalledTimes(1);
  });

  it("une invalidation fait relire tous les écrans de la clé", async () => {
    let n = 0;
    const lire = vi.fn(async () => compte(`v${++n}@blush.test`));
    const a = renderHook(() => useQuery("account", lire));
    const b = renderHook(() => useQuery("account", lire));
    await waitFor(() => expect(a.result.current.data?.email).toBe("v1@blush.test"));
    await waitFor(() => expect(b.result.current.data?.email).toBe("v1@blush.test"));
    /* Deux écrans montés ensemble ne lisent qu’une fois (lirePartage) */
    expect(lire).toHaveBeenCalledTimes(1);
    act(() => a.result.current.refresh());
    await waitFor(() => expect(b.result.current.data?.email).toBe("v2@blush.test"));
    expect(a.result.current.data?.email).toBe("v2@blush.test");
  });
});
