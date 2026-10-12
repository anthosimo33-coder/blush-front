import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLibererAuRetour } from "@/lib/paiement";

/*
 * Revenir de chez Whop par « Retour » (src/lib/paiement.ts) : le navigateur rend la page gardée dans son cache des pages,
 * le bouton « Débloquer » encore occupé. pageshow avec `persisted` le libère ; un premier affichage (sans `persisted`) ne
 * change rien.
 */

/* Le DOM simulé ne pose pas `persisted` sur son PageTransitionEvent : l’événement le porte lui-même */
const afficher = (persisted: boolean) => window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted }));

describe("le retour de chez Whop par « Retour »", () => {
  it("la page rendue par le cache libère le bouton ; un premier affichage, non ; démonté, plus rien", () => {
    const liberer = vi.fn();
    const { unmount } = renderHook(() => useLibererAuRetour(liberer));
    afficher(false);
    expect(liberer).not.toHaveBeenCalled();
    afficher(true);
    expect(liberer).toHaveBeenCalledTimes(1);
    unmount();
    afficher(true);
    expect(liberer).toHaveBeenCalledTimes(1);
  });
});
