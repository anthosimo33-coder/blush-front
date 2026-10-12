import { fireEvent, render, screen } from "@testing-library/react";
import { createRef, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "@/app/app/accueil/Composer";
import { QuestionChat } from "@/app/rapport/question/QuestionChat";
import type { Story } from "@/types";

/*
 * Le nom du champ du chat (src/app/app/accueil/Composer.tsx) et de celui de « Ta question »
 * (src/app/rapport/question/QuestionChat.tsx). Leur <label> n’entoure que le texte caché et le champ : les boutons
 * (« Envoyer », « Enregistrer un vocal », « Poser ma question ») sont à côté, dans la même pastille. Un bouton dans le
 * <label> ferait lire son nom avec celui du champ (« … Enregistrer un vocal »).
 */
vi.mock("@/lib/sound", () => ({ play: vi.fn() }));
vi.mock("@/components/shell/Reveil", () => ({ reveiller: vi.fn() }));
vi.mock("@/lib/requetes", () => ({ useCompte: () => ({ data: { email: "test@example.com", subscription: { plan: "rapport" } } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }), usePathname: () => "/rapport/question" }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
/* Les polices de Next ne se chargent pas hors de Next */
vi.mock("@/lib/fonts", () => ({ figtree: { variable: "" } }));

/** Le champ porte ce seul nom : son unique <label> le dit, et ne contient aucun bouton (dont le nom s’y ajouterait). */
function aSonSeulNom(champ: HTMLElement, nom: string) {
  const labels = [...((champ as HTMLInputElement | HTMLTextAreaElement).labels ?? [])];
  expect(labels).toHaveLength(1);
  expect(labels[0]!.textContent).toBe(nom);
  expect(labels[0]!.querySelector("button")).toBeNull();
  expect(screen.getByRole("textbox", { name: nom })).toBe(champ);
}

function monterComposer(plus: Partial<ComponentProps<typeof Composer>> = {}) {
  render(
    <Composer
      formRef={createRef<HTMLFormElement>()}
      inputRef={createRef<HTMLInputElement>()}
      quick={[]}
      ideesMasquees={false}
      entree={false}
      about={null}
      onAboutClear={vi.fn()}
      modeVocal={false}
      onEcrit={vi.fn()}
      busy={false}
      onText={vi.fn()}
      onQuick={vi.fn()}
      onImages={vi.fn()}
      onExport={vi.fn()}
      onVoice={vi.fn()}
      onMicError={vi.fn()}
      arriving={false}
      logo={() => null}
      {...plus}
    />,
  );
}

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

describe("le champ du chat de l’accueil porte son seul nom", () => {
  it("champ vide (le vocal à côté), puis un texte tapé (la flèche à côté)", () => {
    monterComposer();
    const champ = screen.getByRole("textbox");
    expect(screen.getByRole("button", { name: "Enregistrer un vocal" })).toBeTruthy();
    aSonSeulNom(champ, "Écris à BLUSH, ou colle sa réponse");
    fireEvent.change(champ, { target: { value: "elle m’a vu" } });
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeTruthy();
    aSonSeulNom(champ, "Écris à BLUSH, ou colle sa réponse");
  });

  it("une question sur un point du rapport : son nom à elle, toujours seul", () => {
    monterComposer({ about: "Elle hésite encore" });
    aSonSeulNom(screen.getByRole("textbox", { name: "Ta question sur ce point" }), "Ta question sur ce point");
  });
});

describe("le champ de « Ta question » porte son seul nom", () => {
  it("sans le nom de « Poser ma question », à côté de lui", () => {
    render(<QuestionChat ideas={[]} story={STORY} />);
    expect(screen.getByRole("button", { name: "Poser ma question" })).toBeTruthy();
    aSonSeulNom(screen.getByRole("textbox"), "Ta question à BLUSH");
  });
});
