import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pagePrecedente } from "@/lib/navigation";
import { BoutonRetour, LienRetourDesktop } from "@/components/shell/BoutonRetour";

/*
 * Les « Retour » des écrans (src/components/shell/BoutonRetour.tsx), seule partie de Screen qui tourne dans le
 * navigateur : vers une adresse (en arrière seulement si c’est la page d’avant), vers la page d’avant avec un repli
 * (jamais en arrière hors de BLUSH), ou ce que l’écran décide. Un clic modifié (nouvel onglet) reste au lien.
 */

const routeur = { back: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => routeur }));
vi.mock("@/lib/navigation", async (vrai) => ({ ...(await vrai<typeof import("@/lib/navigation")>()), pagePrecedente: vi.fn() }));
const avant = vi.mocked(pagePrecedente);

beforeEach(() => {
  routeur.back.mockReset();
  avant.mockReset();
});

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

  it("la page d’avant avec un repli : en arrière depuis une page de BLUSH, le repli quand on arrive d’ailleurs", () => {
    avant.mockReturnValue("/compte");
    const { unmount } = render(<BoutonRetour target={{ repli: "/" }} />);
    const lien = screen.getByRole("link", { name: "Retour" });
    expect(lien.getAttribute("href")).toBe("/");
    expect(cliquer(lien)).toBe(false);
    expect(routeur.back).toHaveBeenCalledTimes(1);
    unmount();

    /* Ouverte directement (un lien, un nouvel onglet) : revenir en arrière quitterait BLUSH, le lien mène au repli */
    avant.mockReturnValue(null);
    render(<BoutonRetour target={{ repli: "/" }} />);
    cliquer(screen.getByRole("link", { name: "Retour" }));
    expect(routeur.back).toHaveBeenCalledTimes(1);
  });

  it("un clic modifié (nouvel onglet) reste au lien, même vers la page d’avant", () => {
    avant.mockReturnValue("/compte");
    render(<BoutonRetour target={{ repli: "/" }} />);
    const lien = screen.getByRole("link", { name: "Retour" });
    cliquer(lien, { metaKey: true });
    cliquer(lien, { ctrlKey: true });
    cliquer(lien, { shiftKey: true });
    expect(routeur.back).not.toHaveBeenCalled();
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
