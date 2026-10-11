import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copyText } from "@/lib/hooks";
import { scaleOf } from "@/contenu/niveaux";
import { Button, ButtonLink, IconButton } from "@/components/ui/Button";
import { ContactRing } from "@/components/ui/contact";
import { Chip, CopyPill } from "@/components/ui/controls";
import { InsetRow } from "@/components/ui/inset";
import { LevelPath, ScoreBar } from "@/components/ui/progress";

/*
 * Les contrôles du design system (src/components/ui) : le bouton et son état « en route », le bouton icône, la pastille,
 * la ligne de liste (normale et compacte), la pastille « Copier », l’anneau du contact, le chemin des niveaux en version
 * compacte et la ligne du duel sur fond sombre. Ce qu’ils rendent, et ce qu’un écran peut leur passer en plus
 * (aria-*, data-*, disabled) au lieu de className="!…".
 */

vi.mock("@/lib/hooks", async (vrai) => ({ ...(await vrai<typeof import("@/lib/hooks")>()), copyText: vi.fn() }));
const copier = vi.mocked(copyText);

beforeEach(() => {
  copier.mockReset();
});

describe("Button", () => {
  it("le grand bouton par défaut, le moyen avec size=\"md\" ; le lien garde sa taille", () => {
    render(
      <>
        <Button>Grand</Button>
        <Button size="md">Moyen</Button>
        <Button variant="link" size="md">
          Lien
        </Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Grand" }).className).toContain("h-[60px]");
    const moyen = screen.getByRole("button", { name: "Moyen" }).className;
    expect(moyen).toContain("h-[52px]");
    expect(moyen).not.toContain("h-[60px]");
    expect(screen.getByRole("button", { name: "Lien" }).className).not.toMatch(/h-\[(52|60)px\]/);
  });

  it("en route : les trois points à la place du texte, dits aux lecteurs d’écran, sans flèche, et le toucher retenu", () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const { container } = render(
      <form onSubmit={onSubmit}>
        <Button type="submit" arrow loading loadingLabel="Envoi du code" onClick={onClick}>
          Recevoir mon code
        </Button>
      </form>,
    );
    const bouton = container.querySelector("button")!;
    expect(bouton.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status", { name: "Envoi du code" })).toBeTruthy();
    expect(screen.queryByText("Recevoir mon code")).toBeNull();
    /* Les points du bouton principal restent blancs (sa couleur, comme avant), et pas de flèche */
    expect(bouton.querySelector<HTMLElement>("[data-dots]")!.style.color).toBe("#FFFFFF");
    expect(bouton.querySelector("svg")).toBeNull();
    /* Il garde son allure : seul disabled le grise */
    expect(bouton.disabled).toBe(false);
    fireEvent.click(bouton);
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("au repos : le texte, la flèche, et le toucher passe ; désactivé, la flèche s’efface", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button arrow onClick={onClick}>
        Continuer
      </Button>,
    );
    const bouton = screen.getByRole("button", { name: "Continuer" });
    expect(bouton.hasAttribute("aria-busy")).toBe(false);
    expect(bouton.querySelector("svg")).not.toBeNull();
    fireEvent.click(bouton);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <Button arrow disabled onClick={onClick}>
        Continuer
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Continuer" }).querySelector("svg")).toBeNull();
  });

  it("en route sans loadingLabel : le bouton garde son nom, son texte caché à l’œil", () => {
    render(<Button loading>Recevoir mon code</Button>);
    const bouton = screen.getByRole("button", { name: "Recevoir mon code" });
    expect(bouton.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Recevoir mon code").className).toBe("sr-only");
    expect(bouton.querySelector("[data-dots]")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("un aria-busy posé par l’écran reste le sien hors de loading", () => {
    render(<Button aria-busy={false}>Effacer</Button>);
    expect(screen.getByRole("button", { name: "Effacer" }).getAttribute("aria-busy")).toBe("false");
  });

  it("le bouton secondaire en route : les points dans le gris doux", () => {
    const { container } = render(
      <Button variant="secondary" loading loadingLabel="Retrait">
        Retirer
      </Button>,
    );
    const points = container.querySelector<HTMLElement>("[data-dots]")!;
    expect(points.className).toContain("text-muted");
    expect(points.style.color).toBe("");
  });

  it("ButtonLink prend la même taille", () => {
    render(
      <ButtonLink href="/rapport" size="md">
        Le rapport
      </ButtonLink>,
    );
    expect(screen.getByRole("link", { name: "Le rapport" }).className).toContain("h-[52px]");
  });
});

describe("IconButton", () => {
  it("44 px en carte par défaut ; 40 px, plus doux, sans !important", () => {
    render(
      <>
        <IconButton icon="close" label="Fermer" onClick={() => {}} />
        <IconButton icon="back" label="Retour" size="sm" variant="doux" onClick={() => {}} />
        <IconButton icon="back" label="Nu" plain onClick={() => {}} />
      </>,
    );
    const carte = screen.getByRole("button", { name: "Fermer" }).className;
    expect(carte).toContain("size-11");
    expect(carte).toContain("shadow-card");
    const doux = screen.getByRole("button", { name: "Retour" }).className;
    expect(doux).toContain("size-10");
    expect(doux).toContain("shadow-soft");
    expect(doux).not.toContain("size-11");
    expect(doux).not.toContain("shadow-card");
    expect(screen.getByRole("button", { name: "Nu" }).className).not.toContain("shadow");
  });

  it("disabled, aria-* et data-* vont sur le bouton ; un lien désactivé sort du parcours au clavier", () => {
    const onClick = vi.fn();
    render(
      <>
        <IconButton icon="close" label="Fermer" onClick={onClick} disabled data-a="acc" aria-describedby="aide" />
        <IconButton icon="user" label="Mon compte" href="/compte" disabled data-a="compte" />
      </>,
    );
    const bouton = screen.getByRole("button", { name: "Fermer" }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    expect(bouton.dataset.a).toBe("acc");
    expect(bouton.getAttribute("aria-describedby")).toBe("aide");
    fireEvent.click(bouton);
    expect(onClick).not.toHaveBeenCalled();
    const lien = screen.getByRole("link", { name: "Mon compte" });
    expect(lien.getAttribute("aria-disabled")).toBe("true");
    expect(lien.getAttribute("tabindex")).toBe("-1");
    expect(lien.dataset.a).toBe("compte");
    /* Ni la souris ni le toucher ne l’atteignent, et un clic qui passe quand même ne navigue pas */
    expect(lien.className).toContain("aria-disabled:pointer-events-none");
    expect(fireEvent.click(lien)).toBe(false);
  });

  it("un lien actif, lui, laisse passer son clic", () => {
    render(<IconButton icon="user" label="Mon compte" href="/compte" />);
    const lien = screen.getByRole("link", { name: "Mon compte" });
    expect(lien.hasAttribute("aria-disabled")).toBe(false);
    /* Hors du routeur de l’app, le lien suit la navigation du navigateur : rien ne retient le clic */
    expect(fireEvent.click(lien)).toBe(true);
  });
});

describe("Chip", () => {
  it("à bascule : aria-pressed, disabled et data-* sur le bouton ; étiquette : data-* sur la pastille", () => {
    render(
      <>
        <Chip selected onClick={() => {}} disabled data-choix="flou">
          Le flou
        </Chip>
        <Chip data-compte="12">12 messages</Chip>
      </>,
    );
    const bascule = screen.getByRole("button", { name: "Le flou" }) as HTMLButtonElement;
    expect(bascule.getAttribute("aria-pressed")).toBe("true");
    expect(bascule.disabled).toBe(true);
    expect(bascule.dataset.choix).toBe("flou");
    expect(screen.getByText("12 messages").dataset.compte).toBe("12");
  });

  it("disabled ne se pose que sur une pastille à bascule : sur un lien ou une étiquette, le type le refuse", () => {
    render(
      <>
        {/* @ts-expect-error un lien ne se désactive pas */}
        <Chip href="/rapport" disabled>
          Le rapport
        </Chip>
        {/* @ts-expect-error une étiquette ne se désactive pas */}
        <Chip disabled>Une étiquette</Chip>
      </>,
    );
    expect(screen.getByRole("link", { name: "Le rapport" })).toBeTruthy();
  });
});

describe("InsetRow", () => {
  it("normale : 58 px au moins, le titre à 16 px, le chevron des Réglages ; danger en rouge", () => {
    render(<InsetRow title="Tout effacer" sub="Ton compte" onClick={() => {}} chevron danger />);
    const ligne = screen.getByRole("button");
    expect(ligne.className).toContain("min-h-[58px]");
    const titre = screen.getByText("Tout effacer");
    expect(titre.className).toContain("text-corps"); /* 16 px, le token --text-corps */
    expect(titre.className).toContain("text-danger");
    expect(ligne.querySelector("svg")?.getAttribute("width")).toBe("17");
  });

  it("compacte (la feuille du contact) : le titre à 15 px, le sous-titre coupé, un lien préchargé avec son onNavigate", () => {
    const onNavigate = vi.fn();
    render(<InsetRow variant="compact" href="/rapport" prefetch onNavigate={onNavigate} title="Le rapport" sub="Depuis mars" chevron data-ligne="rapport" />);
    const lien = screen.getByRole("link");
    expect(lien.className).not.toContain("min-h-[58px]");
    expect(lien.className).toContain("py-3.5");
    expect(lien.dataset.ligne).toBe("rapport");
    expect(screen.getByText("Le rapport").className).toContain("text-detail"); /* 15 px, le token --text-detail */
    expect(screen.getByText("Depuis mars").className).toContain("truncate");
    expect(lien.querySelector("svg")?.getAttribute("width")).toBe("16");
  });

  it("compacte et bouton : toute la largeur de la carte, le texte à gauche (comme la normale)", () => {
    const onClick = vi.fn();
    render(<InsetRow variant="compact" onClick={onClick} title="Renommer" chevron />);
    const ligne = screen.getByRole("button", { name: "Renommer" });
    expect(ligne.className).toContain("w-full");
    expect(ligne.className).toContain("text-left");
    fireEvent.click(ligne);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("un bouton désactivé ne répond plus", () => {
    const onClick = vi.fn();
    render(<InsetRow title="Ouvrir" onClick={onClick} disabled />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("CopyPill", () => {
  it("copie le texte, dit « Copié » deux secondes, puis redevient « Copier »", async () => {
    vi.useFakeTimers();
    try {
      copier.mockResolvedValue(true);
      render(<CopyPill text="on se voit samedi ?" label="Copier" />);
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copier" })));
      expect(copier).toHaveBeenCalledWith("on se voit samedi ?");
      expect(screen.getByRole("button", { name: "Copié" })).toBeTruthy();
      await act(async () => vi.advanceTimersByTime(2000));
      expect(screen.getByRole("button", { name: "Copier" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("une copie refusée par le navigateur ne change rien", async () => {
    copier.mockResolvedValue(false);
    render(<CopyPill text="x" label="Copier le message" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copier le message" })));
    expect(screen.queryByText("Copié")).toBeNull();
  });
});

describe("ContactRing", () => {
  it("l’arc du niveau, le badge et l’avatar acceptent les ancres d’animation de l’accueil", () => {
    const { container } = render(
      <ContactRing
        initial="S"
        level="voit"
        emoji="🔥"
        size={48}
        fontSize={15}
        data-sophie=""
        ringProps={{ "data-a": "ring" }}
        badgeProps={{ "data-a": "badge" }}
        enveloppe={(avatar) => <span data-sophie-avatar="">{avatar}</span>}
      >
        <span data-glow-ring="" />
      </ContactRing>,
    );
    const anneau = container.firstElementChild as HTMLElement;
    expect(anneau.hasAttribute("data-sophie")).toBe(true);
    expect(anneau.firstElementChild?.hasAttribute("data-glow-ring")).toBe(true);
    const arc = container.querySelector<SVGCircleElement>("[data-a=ring]")!;
    const tour = 2 * Math.PI * 21;
    expect(arc.getAttribute("stroke-dasharray")).toBe(`${(tour * 2) / 4} ${tour}`);
    expect(container.querySelector("[data-a=badge]")?.textContent).toBe("🔥");
    const avatar = container.querySelector("[data-sophie-avatar] > span") as HTMLElement;
    expect(avatar.textContent).toBe("S");
    expect(avatar.style.fontSize).toBe("15px");
    expect(avatar.style.width).toBe("36px");
  });

  it("sans niveau ni verdict : l’anneau vide, sans badge", () => {
    const { container } = render(<ContactRing initial="S" level={null} emoji={null} />);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
    expect(container.textContent).toBe("S");
  });
});

describe("LevelPath compact et les niveaux", () => {
  it("les étapes : franchies cochées, la tienne en cours, les suivantes à venir, dit aux lecteurs d’écran", () => {
    const { container } = render(<LevelPath current="dit" variant="compact" />);
    const etapes = Array.from(container.querySelectorAll("li"));
    expect(etapes.map((e) => e.textContent)).toEqual(["On se parle\u00a0: réussi", "On se voit\u00a0: réussi", "On se le dit\u00a0: niveau en cours", "On est ensemble\u00a0: à venir"]);
    expect(etapes.map((e) => e.getAttribute("aria-current"))).toEqual([null, null, "step", null]);
    expect(container.querySelector("[data-beat]")?.getAttribute("data-beat")).toBe("");
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });

  it("en couple : la température, juste où vous êtes, sans coche ni fil franchi", () => {
    const { container } = render(<LevelPath current="va" variant="compact" />);
    const etapes = Array.from(container.querySelectorAll("li"));
    expect(etapes.map((e) => e.textContent)).toEqual(["On s’éloigne", "Ça coince", "Ça va\u00a0: vous en êtes là", "On est soudés"]);
    expect(container.querySelectorAll("svg")).toHaveLength(0);
  });

  it("le chemin normal dit la même chose avec ses grands ronds", () => {
    const { container } = render(<LevelPath current="voit" />);
    expect(container.querySelector("[data-beat]")?.getAttribute("data-beat")).toBe("doux");
    expect(Array.from(container.querySelectorAll(".sr-only")).map((e) => e.textContent)).toEqual(["\u00a0: réussi", "\u00a0: niveau en cours", "\u00a0: à venir", "\u00a0: à venir"]);
  });

  it("scaleOf : l’échelle et la place d’un niveau", () => {
    expect(scaleOf("ensemble")).toMatchObject({ index: 3, temperature: false });
    expect(scaleOf("eloigne")).toMatchObject({ index: 0, temperature: true });
    expect(scaleOf("parle").levels.map((l) => l.label)).toEqual(["On se parle", "On se voit", "On se le dit", "On est ensemble"]);
  });
});

describe("ScoreBar sombre", () => {
  it("la ligne du duel garde sa barre dite aux lecteurs d’écran, et le pronom de l’autre", () => {
    const { container } = render(
      <ul>
        <li>
          <ScoreBar sombre row={{ label: "Qui relance", winner: "elle", toiPercent: 30, captionLeft: "3 fois", captionRight: "7 fois" }} autre="il" delay={0.45} />
        </li>
      </ul>,
    );
    expect(screen.getByRole("img", { name: "Qui relance\u00a0: toi 30 %, il 70 %" })).toBeTruthy();
    expect(screen.getByText("il").className).toContain("text-elle");
    const barre = container.querySelector<HTMLElement>("[data-bar]")!;
    expect(barre.style.getPropertyValue("--w")).toBe("30%");
    /* Ses morceaux se posent dans le <li> de l’écran, sans enveloppe */
    expect(container.querySelector("li")!.children).toHaveLength(3);
  });
});
