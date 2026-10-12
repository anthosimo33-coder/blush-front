import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pagePrecedente, SuiviNavigation } from "@/lib/navigation";
import { BoutonRetour, LienRetourDesktop } from "@/components/shell/BoutonRetour";

/*
 * Les « Retour » des écrans (src/components/shell/BoutonRetour.tsx), seule partie de Screen qui tourne dans le
 * navigateur : vers une adresse (en arrière seulement si c’est la page d’avant), vers la page d’avant avec un repli
 * (jamais en arrière hors de BLUSH : useRetourSinon, dont la règle entière est dans tests/client/retour-sinon.test.tsx),
 * ou ce que l’écran décide. Un clic modifié (nouvel onglet) reste au lien.
 */

const routeur = { back: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() };
let chemin = "/";
vi.mock("next/navigation", () => ({ useRouter: () => routeur, usePathname: () => chemin }));
vi.mock("@/lib/navigation", async (vrai) => ({ ...(await vrai<typeof import("@/lib/navigation")>()), pagePrecedente: vi.fn() }));
const avant = vi.mocked(pagePrecedente);

beforeEach(() => {
  routeur.back.mockReset();
  routeur.push.mockReset();
  avant.mockReset();
});

/*
 * La page d’avant que lit useRetourSinon : celle que retient SuiviNavigation (la vraie, dans le module : `avant`, simulée,
 * ne sert qu’aux liens vers une adresse). On vient de `page` jusqu’à celle du « Retour ».
 */
function venirDe(page: string) {
  chemin = page;
  const { rerender, unmount } = render(<SuiviNavigation />);
  chemin = "/ici";
  rerender(<SuiviNavigation />);
  unmount();
}

/** Un clic gauche simple ; `false` : la page l’a gardé pour elle (en arrière), sans suivre le lien. */
const cliquer = (el: HTMLElement, init: MouseEventInit = {}) => fireEvent.click(el, { button: 0, ...init });

describe("BoutonRetour", () => {
  it("vers une adresse : un lien, qui revient en arrière quand c’est la page d’avant (sans la requête)", () => {
    avant.mockReturnValue("/importer/export");
    render(<BoutonRetour target="/importer/export?app=whatsapp" />);
    const lien = screen.getByRole("link", { name: "Retour" });
    expect(lien.getAttribute("href")).toBe("/importer/export?app=whatsapp");
    expect(cliquer(lien)).toBe(false);
    expect(routeur.back).toHaveBeenCalledTimes(1);
  });

  it("vers une adresse qui n’est pas la page d’avant : le lien l’ouvre, rien ne revient en arrière", () => {
    avant.mockReturnValue("/app");
    render(<BoutonRetour target="/commencer" />);
    cliquer(screen.getByRole("link", { name: "Retour" }));
    expect(routeur.back).not.toHaveBeenCalled();
  });

  it("la page d’avant avec un repli : un lien vers le repli, qui revient en arrière depuis une page de BLUSH", () => {
    venirDe("/compte");
    render(<BoutonRetour target={{ repli: "/" }} />);
    const lien = screen.getByRole("link", { name: "Retour" });
    expect(lien.getAttribute("href")).toBe("/");
    expect(cliquer(lien)).toBe(false);
    expect(routeur.back).toHaveBeenCalledTimes(1);
    expect(routeur.push).not.toHaveBeenCalled();
  });

  it("le repli après un retour du système : sans entrée de BLUSH avant (API Navigation), le repli, avec son scroll", () => {
    /*
     * Arrivé par un lien, « Retour » a poussé le repli, puis le retour du système est revenu ici : BLUSH garde une page
     * d’avant, mais l’entrée d’avant est le site d’où l’on vient. L’API Navigation le dit (index 0, rien de BLUSH avant).
     */
    venirDe("/app");
    vi.stubGlobal("navigation", { currentEntry: { index: 0 } });
    try {
      const { unmount } = render(<BoutonRetour target={{ repli: "/app", scroll: false }} />);
      expect(cliquer(screen.getByRole("link", { name: "Retour" }))).toBe(false);
      expect(routeur.back).not.toHaveBeenCalled();
      expect(routeur.push).toHaveBeenCalledWith("/app", { scroll: false });
      unmount();

      /* Une entrée de BLUSH avant celle-ci : en arrière */
      vi.stubGlobal("navigation", { currentEntry: { index: 2 } });
      render(<BoutonRetour target={{ repli: "/" }} />);
      expect(cliquer(screen.getByRole("link", { name: "Retour" }))).toBe(false);
      expect(routeur.back).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("un clic modifié (nouvel onglet) reste au lien, même vers la page d’avant", () => {
    venirDe("/compte");
    render(<BoutonRetour target={{ repli: "/" }} />);
    const lien = screen.getByRole("link", { name: "Retour" });
    cliquer(lien, { metaKey: true });
    cliquer(lien, { ctrlKey: true });
    cliquer(lien, { shiftKey: true });
    expect(routeur.back).not.toHaveBeenCalled();
    expect(routeur.push).not.toHaveBeenCalled();
  });

  it("ce que l’écran décide : un bouton, qui l’appelle", () => {
    const retour = vi.fn();
    render(<BoutonRetour target={retour} />);
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(retour).toHaveBeenCalledTimes(1);
    expect(routeur.back).not.toHaveBeenCalled();
  });
});

describe("LienRetourDesktop", () => {
  it("« Retour » écrit (ou son libellé), avec les mêmes règles que la flèche du mobile", () => {
    avant.mockReturnValue("/rapport");
    render(
      <>
        <LienRetourDesktop target="/rapport" />
        <LienRetourDesktop target={() => {}} label="Fermer" />
      </>,
    );
    const lien = screen.getByRole("link", { name: "Retour" });
    expect(lien.getAttribute("href")).toBe("/rapport");
    expect(cliquer(lien)).toBe(false);
    expect(routeur.back).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Fermer" })).toBeTruthy();
  });
});
