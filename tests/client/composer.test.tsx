import { fireEvent, render, screen } from "@testing-library/react";
import { createRef, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "@/app/app/accueil/Composer";

/*
 * La barre de saisie de l’accueil (src/app/app/accueil/Composer.tsx), seule : ce qu’on y écrit ou touche part vers
 * l’accueil, qui l’envoie à BLUSH. Les sons et le réveil du serveur sont muets (ils ne se testent pas ici).
 */
vi.mock("@/lib/sound", () => ({ play: vi.fn() }));
vi.mock("@/components/shell/Reveil", () => ({ reveiller: vi.fn() }));

type Props = ComponentProps<typeof Composer>;

/*
 * Le choix « idées masquées » vit hors du composant (le stockage local, un cookie, la mémoire du module) : un test qui
 * s’arrête entre « Masquer » et « Idées de questions », ou un ordre mélangé, ne le laisse pas aux suivants. Ce afterEach
 * passe avant le démontage (tests/client/preparer.ts) : la barre est encore là pour le rendre.
 */
afterEach(() => {
  const rendre = screen.queryByRole("button", { name: "Idées de questions" });
  if (rendre) fireEvent.click(rendre);
  localStorage.clear();
});

const QUESTIONS = ["elle pense quoi ?", "je lui réponds quoi ?"];

function monter(plus: Partial<Props> = {}) {
  const props: Props = {
    formRef: createRef<HTMLFormElement>(),
    inputRef: createRef<HTMLInputElement>(),
    quick: QUESTIONS,
    ideesMasquees: false,
    entree: false,
    about: null,
    onAboutClear: vi.fn(),
    modeVocal: false,
    onEcrit: vi.fn(),
    busy: false,
    onText: vi.fn(),
    onQuick: vi.fn(),
    onImages: vi.fn(),
    onExport: vi.fn(),
    onVoice: vi.fn(),
    onMicError: vi.fn(),
    arriving: false,
    logo: () => null,
    ...plus,
  };
  const rendu = render(<Composer {...props} />);
  return { props, rendu, champ: screen.getByRole<HTMLInputElement>("textbox", { name: "Écris à BLUSH, ou colle sa réponse" }) };
}

describe("la barre de saisie de l’accueil", () => {
  it("un texte : « Envoyer » le donne à l’accueil sans ses espaces autour, et vide le champ", () => {
    const { props, champ } = monter();
    expect(screen.queryByRole("button", { name: "Envoyer" })).toBeNull();
    fireEvent.change(champ, { target: { value: "  elle m’a vu hier  " } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(props.onText).toHaveBeenCalledExactlyOnceWith("elle m’a vu hier");
    expect(champ.value).toBe("");
    /* Le champ vide : le vocal revient à la place de la flèche */
    expect(screen.queryByRole("button", { name: "Envoyer" })).toBeNull();
    expect(screen.getByRole("button", { name: "Enregistrer un vocal" })).toBeTruthy();
  });

  it("des espaces seulement : rien ne part, même par la touche Entrée", () => {
    const { props, champ, rendu } = monter();
    fireEvent.change(champ, { target: { value: "   " } });
    expect(screen.queryByRole("button", { name: "Envoyer" })).toBeNull();
    fireEvent.submit(rendu.container.querySelector("form")!);
    expect(props.onText).not.toHaveBeenCalled();
  });

  it("une pastille : sa question part telle quelle, avec la pastille d’où elle s’envole", () => {
    const { props } = monter();
    const pastille = screen.getByRole("button", { name: QUESTIONS[1] });
    fireEvent.click(pastille);
    expect(props.onQuick).toHaveBeenCalledExactlyOnceWith(QUESTIONS[1], pastille);
    expect(props.onText).not.toHaveBeenCalled();
  });

  it("les pastilles s’effacent pendant que tu écris (à leur place, sans faire sauter la conv), et pendant que BLUSH répond", () => {
    const { champ, rendu, props } = monter();
    const groupe = screen.getByRole("group", { name: "Questions toutes prêtes" });
    fireEvent.change(champ, { target: { value: "et" } });
    expect(groupe.getAttribute("aria-hidden")).toBe("true");
    expect(groupe.hasAttribute("inert")).toBe(true);
    fireEvent.change(champ, { target: { value: "" } });
    expect(groupe.hasAttribute("aria-hidden")).toBe(false);
    rendu.rerender(<Composer {...props} busy />);
    expect(screen.queryByRole("group", { name: "Questions toutes prêtes" })).toBeNull();
  });

  it("« Masquer les idées de questions » les range derrière « Idées de questions », qui les rend", () => {
    monter();
    fireEvent.click(screen.getByRole("button", { name: "Masquer les idées de questions" }));
    expect(screen.queryByRole("group", { name: "Questions toutes prêtes" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Idées de questions" }));
    expect(screen.getByRole("group", { name: "Questions toutes prêtes" })).toBeTruthy();
  });

  it("2 · chaque lettre penche le logo que l’accueil donne (celui de son en-tête), et lui seul ; il se redresse après 0,9 s", () => {
    vi.useFakeTimers();
    try {
      /* Un autre logo dans la page, qui porte le même attribut : il n’est pas pris (Q62, rien n’est cherché dans la page) */
      const [donne, autre] = [0, 1].map(() => {
        const el = document.body.appendChild(document.createElement("span"));
        el.setAttribute("data-blush-logo", "");
        return el;
      });
      const { champ } = monter({ logo: () => donne });
      fireEvent.change(champ, { target: { value: "s" } });
      expect(donne.hasAttribute("data-lean")).toBe(true);
      expect(autre.hasAttribute("data-lean")).toBe(false);
      vi.advanceTimersByTime(900);
      expect(donne.hasAttribute("data-lean")).toBe(false);
      donne.remove();
      autre.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("2 · sans logo à l’écran (l’accueil n’en donne pas), une lettre ne casse rien", () => {
    const { champ } = monter({ logo: () => null });
    fireEvent.change(champ, { target: { value: "s" } });
    expect(champ.value).toBe("s");
  });
});
