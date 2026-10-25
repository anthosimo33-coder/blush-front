import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { suiteDuPaiement, useLibererAuRetour } from "@/lib/paiement";

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

describe("où reprendre une fois l’achat livré (suiteDuPaiement)", () => {
  it("une recharge revient avec les bulles que le serveur a livrées, pas celles que la feuille avait comptées", () => {
    /* La feuille a compté 80 ; l’achat livré en a donné 120 (une commande d’avant le 23 octobre, avec le bonus ④) : le mot dira « +120 bulles » */
    sessionStorage.setItem("blush.paiement.suite.a1", "/app?recharge=80");
    expect(suiteDuPaiement("a1", 120)).toBe("/app?recharge=120");
    expect(suiteDuPaiement("a1")).toBe("/app?recharge=80");
    /* Une autre suite (Mon compte, le rapport) reste telle quelle ; rien de gardé, ou une adresse hors du site : rien */
    sessionStorage.setItem("blush.paiement.suite.a2", "/compte");
    expect(suiteDuPaiement("a2", 30)).toBe("/compte");
    sessionStorage.setItem("blush.paiement.suite.a3", "//exemple.com/?recharge=1");
    expect(suiteDuPaiement("a3", 30)).toBeNull();
    expect(suiteDuPaiement("a4", 30)).toBeNull();
  });
});
