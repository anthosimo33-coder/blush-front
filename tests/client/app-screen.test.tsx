import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Besoin } from "@/lib/acces";
import type { Plan } from "@/types";
import { AppScreen } from "@/components/shell/AppScreen";

/*
 * La coque des écrans après le rapport (src/components/shell/AppScreen.tsx) et son paiement par besoin : ouvert quand le
 * plan du compte n’ouvre pas ce que l’écran demande, et réduit à BLUSH+ pour qui a déjà le rapport (le chat, sa fiche).
 * Le compte est simulé ; le paiement, chargé à part (next/dynamic), est remplacé par un témoin qui montre ce qu’il reçoit.
 */
const compte = vi.hoisted(() => ({ plan: "gratuit" as Plan }));
vi.mock("@/lib/requetes", () => ({ useCompte: () => ({ data: { email: "test@example.com", subscription: { plan: compte.plan } } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }), usePathname: () => "/app" }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function Paiement({ open, only }: { open: boolean; only?: string }) {
      return <div data-testid="paiement" data-open={String(open)} data-only={only ?? ""} />;
    },
}));

beforeEach(() => {
  compte.plan = "gratuit";
});

/* Pour chaque plan et chaque besoin : le paiement ouvert, et l’offre seule qu’il propose (« » : toutes) */
const ATTENDU: Record<Plan, Record<Besoin, { ouvert: boolean; seule: string }>> = {
  gratuit: { rapport: { ouvert: true, seule: "" }, question: { ouvert: true, seule: "" }, chat: { ouvert: true, seule: "" }, fiche: { ouvert: true, seule: "" } },
  rapport: { rapport: { ouvert: false, seule: "" }, question: { ouvert: false, seule: "" }, chat: { ouvert: true, seule: "blushplus" }, fiche: { ouvert: true, seule: "blushplus" } },
  blushplus: { rapport: { ouvert: false, seule: "" }, question: { ouvert: false, seule: "" }, chat: { ouvert: false, seule: "" }, fiche: { ouvert: false, seule: "" } },
};
const CAS = (Object.keys(ATTENDU) as Plan[]).flatMap((plan) => (["question", "chat", "fiche"] as const).map((besoin) => [plan, besoin, ATTENDU[plan][besoin]] as const));

describe("AppScreen : le paiement par besoin", () => {
  it.each(CAS)("%s, %s : %o", (plan, besoin, { ouvert, seule }) => {
    compte.plan = plan;
    render(
      <AppScreen besoin={besoin}>
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
    expect(paiement?.dataset.only).toBe(seule);
  });

  it("sans besoin : jamais de paiement", () => {
    render(
      <AppScreen>
        <p>L’écran</p>
      </AppScreen>,
    );
    expect(screen.queryByTestId("paiement")).toBeNull();
  });
});
