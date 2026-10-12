import { render, renderHook } from "@testing-library/react";
import type { Route } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * La règle unique des « Retour » vers la page d’avant (useRetourSinon, src/lib/navigation.ts), celle du rapport, du mode
 * sobre, de Mon compte, de /commencer et des BoutonRetour à repli : en arrière seulement quand on reste dans BLUSH,
 * sinon le repli. Arrivé par un lien, un « Retour » (le repli, poussé) puis le retour du système ramènent sur la page
 * avec une page d’avant : seule l’API Navigation (simulée ici) dit que l’entrée d’avant est le site d’où l’on vient.
 */

const routeur = { back: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() };
let chemin = "/";
vi.mock("next/navigation", () => ({ useRouter: () => routeur, usePathname: () => chemin }));

beforeEach(() => {
  routeur.back.mockReset();
  routeur.push.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

/**
 * Un premier chargement de l’appli (le module neuf : aucune page d’avant), puis, avec `avant`, le passage de cette page
 * à celle du « Retour » (SuiviNavigation, comme le layout le monte).
 */
async function arriver(avant: string | null) {
  vi.resetModules();
  const navigation = await import("@/lib/navigation");
  if (avant) {
    chemin = avant;
    const { rerender, unmount } = render(<navigation.SuiviNavigation />);
    chemin = "/rapport";
    rerender(<navigation.SuiviNavigation />);
    unmount();
  }
  return navigation;
}

/** Touche « Retour » (repli `repli`, `scroll` de son lien) sur la page où l’on est arrivé. */
async function toucher(avant: string | null, repli: Route = "/app", options?: { scroll?: boolean }) {
  const { useRetourSinon } = await arriver(avant);
  const { result } = renderHook(() => useRetourSinon(repli, options));
  result.current();
}

/** L’entrée de l’historique où l’on est, d’après l’API Navigation : 0, la première de BLUSH dans cet onglet. */
const entree = (index: number) => vi.stubGlobal("navigation", { currentEntry: { index } });

describe("useRetourSinon", () => {
  it("ouvert d’ailleurs (un lien, un nouvel onglet), sans page d’avant dans BLUSH : le repli, avec son scroll", async () => {
    await toucher(null, "/app", { scroll: false });
    expect(routeur.back).not.toHaveBeenCalled();
    expect(routeur.push).toHaveBeenCalledWith("/app", { scroll: false });
  });

  it("API Navigation, index 0 : une page d’avant dans BLUSH, mais l’entrée d’avant est un autre site ; le repli", async () => {
    entree(0);
    await toucher("/app", "/app", { scroll: false });
    expect(routeur.back).not.toHaveBeenCalled();
    expect(routeur.push).toHaveBeenCalledWith("/app", { scroll: false });
  });

  it("API Navigation, index au-dessus de 0 : l’entrée d’avant est à BLUSH ; en arrière", async () => {
    entree(3);
    await toucher("/app");
    expect(routeur.back).toHaveBeenCalledTimes(1);
    expect(routeur.push).not.toHaveBeenCalled();
  });

  it("sans l’API Navigation (WebKit) : la page d’avant suffit ; en arrière", async () => {
    await toucher("/compte");
    expect(routeur.back).toHaveBeenCalledTimes(1);
    expect(routeur.push).not.toHaveBeenCalled();
  });

  it("sans scroll donné : celui de Next (la page du repli s’ouvre en haut)", async () => {
    await toucher(null, "/");
    expect(routeur.push).toHaveBeenCalledWith("/", { scroll: undefined });
  });
});
