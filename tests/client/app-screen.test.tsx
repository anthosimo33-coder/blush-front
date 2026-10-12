import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FRAIS_DU_RENDU } from "@/lib/query";
import type { Account } from "@/types/api";
import { AppScreen } from "@/components/shell/AppScreen";
import { PoseConv } from "@/components/shell/PoseConv";

/*
 * La coque des écrans après le rapport (src/components/shell/AppScreen.tsx) et son paiement par besoin : ouvert quand le
 * compte n’ouvre pas ce que l’écran demande (sa fiche : un client). Le compte est simulé ; le paiement, chargé à part
 * (next/dynamic), est remplacé par un témoin qui montre ce qu’il reçoit.
 */
const compte = vi.hoisted(() => ({ client: false }));
const lectureDuCompte = vi.hoisted(() => vi.fn());
vi.mock("@/lib/requetes", () => ({
  useCompte: (...args: unknown[]) => (lectureDuCompte(...args), { data: { email: "test@example.com", bulles: 0, client: compte.client, equipe: false, storyDeleted: false } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }), usePathname: () => "/app" }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function Paiement({ open }: { open: boolean }) {
      return <div data-testid="paiement" data-open={String(open)} />;
    },
}));

beforeEach(() => {
  compte.client = false;
});

describe("AppScreen : le paiement par besoin", () => {
  it.each([
    [false, true],
    [true, false],
  ])("sa fiche, client : %s, paiement ouvert : %s", (client, ouvert) => {
    compte.client = client;
    render(
      <AppScreen besoin="fiche">
        <p>L’écran</p>
      </AppScreen>,
    );
    expect(screen.getByText("L’écran")).toBeTruthy();
    const paiement = screen.queryByTestId("paiement");
    if (!ouvert) {
      /* Qui a les droits ne monte pas le paiement */
      expect(paiement).toBeNull();
      return;
    }
    expect(paiement?.dataset.open).toBe("true");
  });

  it("sans besoin : jamais de paiement", () => {
    render(
      <AppScreen>
        <p>L’écran</p>
      </AppScreen>,
    );
    expect(screen.queryByTestId("paiement")).toBeNull();
  });

  it("dans la page d’une conv, la coque part du compte qu’elle a rendu, avec l’heure du rendu (frais, il n’est pas relu) ; ailleurs, de rien", () => {
    const rendu: Account = { email: "rendu@blush.test", bulles: 12, client: true, equipe: false, storyDeleted: false };
    render(
      <PoseConv id="conv-a" compte={rendu} rendu={1234}>
        <AppScreen>
          <p>L’écran</p>
        </AppScreen>
      </PoseConv>,
    );
    expect(lectureDuCompte).toHaveBeenLastCalledWith(rendu, { rendu: 1234, frais: FRAIS_DU_RENDU });
    lectureDuCompte.mockClear();
    render(
      <AppScreen>
        <p>Tes convs</p>
      </AppScreen>,
    );
    expect(lectureDuCompte).toHaveBeenLastCalledWith(undefined, { rendu: undefined, frais: FRAIS_DU_RENDU });
  });
});
