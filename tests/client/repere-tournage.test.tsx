import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepereTournage } from "@/components/shell/RepereTournage";
import { lireLeRepereDuTournage } from "@/services/api";

/*
 * Le repère du mode tournage (src/components/shell/RepereTournage.tsx) : il n’affiche que ce que le serveur lui répond
 * (GET /api/tournage/repere, simulé ici). null (une créatrice, un visiteur sans compte), une erreur, ou un écran quitté
 * avant la réponse : rien.
 */
vi.mock("@/services/api", async (vrai) => ({ ...(await vrai<typeof import("@/services/api")>()), lireLeRepereDuTournage: vi.fn() }));
const lire = vi.mocked(lireLeRepereDuTournage);

/* Un bloc : rendue par beforeEach, la fonction simulée serait prise pour son nettoyage, et rappelée après le test */
beforeEach(() => {
  lire.mockReset();
});

describe("le repère du mode tournage", () => {
  it("nomme le lien que le serveur donne et mène à /tournage, posé hors de l’écran (un portail)", async () => {
    lire.mockResolvedValue({ nom: "A · Il répond plus pareil" });
    const { container } = render(
      <main>
        <RepereTournage />
      </main>,
    );
    const lien = await screen.findByRole("link", { name: "Mode tournage\u00a0: A · Il répond plus pareil. Ouvrir la page du mode tournage" });
    expect(lien.getAttribute("href")).toBe("/tournage");
    expect(lien.textContent).toBe("Mode tournageTournage·A · Il répond plus pareil");
    expect(container.contains(lien)).toBe(false);
  });

  it("rien quand le serveur répond null, ni quand il ne répond pas", async () => {
    lire.mockResolvedValue({ nom: null });
    const { unmount } = render(<RepereTournage />);
    await act(async () => {});
    expect(screen.queryByRole("link")).toBeNull();
    unmount();
    lire.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<RepereTournage />);
    await act(async () => {});
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("abandonne sa requête quand l’écran part", () => {
    lire.mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<RepereTournage />);
    const signal = lire.mock.calls[0]![0];
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
