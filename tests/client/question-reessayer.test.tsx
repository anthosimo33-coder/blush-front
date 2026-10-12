import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionChat } from "@/app/rapport/question/QuestionChat";
import { askQuestion } from "@/services/api";
import type { QuestionAnswer, Story } from "@/types";
import { ErreurApi } from "@/types/erreurs-api";

/*
 * « Ta question » (src/app/rapport/question/QuestionChat.tsx) est une réponse du chat comme une autre : elle se paie une
 * bulle. Le réseau qui coupe pendant que BLUSH écrit ne l’arrête pas côté serveur (la réponse s’écrit et se paie) ; la
 * question revient dans le champ, et la renvoyer est un « Réessayer ». Elle repart donc avec la même clé (le serveur la
 * reconnaît, rend la réponse déjà écrite et ne débite pas deux fois : tests/chat-bulles.test.ts) ; une autre question,
 * avec une autre clé. Le serveur est simulé : ici, ce que l’écran envoie.
 */
vi.mock("@/lib/sound", () => ({ play: vi.fn() }));
vi.mock("@/components/shell/Reveil", () => ({ reveiller: vi.fn() }));
vi.mock("@/lib/requetes", () => ({ useCompte: () => ({ data: { email: "test@example.com", bulles: 10, client: true, equipe: false } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }), usePathname: () => "/rapport/question" }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
/* Les polices de Next ne se chargent pas hors de Next */
vi.mock("@/lib/fonts", () => ({ figtree: { variable: "" } }));
vi.mock("@/services/api", async (vrai) => ({ ...(await vrai<typeof import("@/services/api")>()), askQuestion: vi.fn() }));
const poser = vi.mocked(askQuestion);

const STORY: Story = {
  id: "conv-test",
  participants: [
    { id: "a", name: "Tom", initial: "T" },
    { id: "b", name: "Léa", initial: "L" },
  ],
  sources: [],
  totalMessages: 1200,
  voiceCount: 0,
  period: "14 déc. → 12 mars",
  durationLabel: "3 mois",
  updatedLabel: "hier",
  me: "a",
};

const reponse = (question: string): QuestionAnswer => ({ question, title: "oui, clairement", evidenceLabel: "", evidence: "", confidence: "probable", limits: "" });

beforeEach(() => {
  poser.mockReset();
  vi.spyOn(window, "matchMedia").mockImplementation(
    (requete: string) => ({ matches: requete.includes("reduced-motion"), media: requete, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
  );
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

/** Écrit cette question et l’envoie. */
async function envoyer(question: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Ta question à BLUSH" }), { target: { value: question } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Poser ma question" })));
}

describe("« Ta question » renvoyée après une coupure", () => {
  it("la même question repart avec la même clé (jamais payée deux fois) ; une autre question, avec une autre", async () => {
    render(<QuestionChat ideas={[]} story={STORY} />);
    poser.mockRejectedValueOnce(new ErreurApi("panne", 502));
    await envoyer("il pense à moi ?");
    /* La question revient dans le champ : la renvoyer, c’est réessayer */
    expect((screen.getByRole("textbox", { name: "Ta question à BLUSH" }) as HTMLTextAreaElement).value).toBe("il pense à moi ?");
    poser.mockRejectedValueOnce(new ErreurApi("panne", 502));
    await envoyer("il pense à moi ?");
    poser.mockRejectedValueOnce(new ErreurApi("panne", 502));
    await envoyer("et là, il m’en veut ?");
    const [premiere, encore, autre] = poser.mock.calls;
    expect(premiere![0]).toBe("il pense à moi ?");
    expect(premiere![1]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(encore![1]).toBe(premiere![1]);
    expect(autre![0]).toBe("et là, il m’en veut ?");
    expect(autre![1]).not.toBe(premiere![1]);
    /* Renvoyée, elle passe : avec sa clé à elle, et la réponse s’affiche */
    poser.mockResolvedValueOnce(reponse("et là, il m’en veut ?"));
    await envoyer("et là, il m’en veut ?");
    expect(poser.mock.calls[3]![1]).toBe(autre![1]);
    expect(await screen.findByText("oui, clairement")).toBeTruthy();
  });
});
