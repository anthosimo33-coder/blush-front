import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeuilleBulle } from "@/components/bulles/FeuilleBulle";
import { Cadeau, Grappe, Perle, PerleVide, Rangee } from "@/components/bulles/perles";
import { Carte, CestQuoiUneBulle, Contenu, LigneOfferte, Option, Pastille, PetitBouton, RondACocher } from "@/components/bulles/pieces";
import { RadioGroup } from "@/components/ui/controls";
import { CEST_QUOI, COUTS, FEUILLE_BULLE, PIECES } from "@/contenu/bulles";
import { COUT_EN_BULLES } from "@/contenu/offres";
import { auMoins } from "../aide/listes";

/*
 * Les pièces communes des écrans des bulles (src/components/bulles), seules : les perles et leurs rangées, l’option à
 * cocher d’une feuille et ce qu’elle contient, la ligne offerte, les pastilles, la carte du chat et son petit bouton,
 * « C’est quoi une bulle ? » et sa feuille. Ce qu’elles montrent, ce qu’en entend un lecteur d’écran, et ce qu’on y
 * touche (au doigt et au clavier). La feuille s’ouvre sans animation (le DOM simulé n’en a pas : moins de mouvement).
 */

const { getAnimations } = Element.prototype;

beforeEach(() => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (requete: string) => ({ matches: requete.includes("reduced-motion"), media: requete, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
  );
  Element.prototype.getAnimations = () => [];
});

afterEach(() => {
  Element.prototype.getAnimations = getAnimations;
  vi.useRealTimers();
});

/** Les perles pleines (la sphère du logo, un svg) et vides (data-perle) sous `el`. */
const pleines = (el: Element) => el.querySelectorAll("svg").length;
const vides = (el: Element) => el.querySelectorAll('[data-perle="vide"]').length;

describe("les perles", () => {
  it("une perle est la sphère opale du logo, cachée aux lecteurs d’écran, à sa taille", () => {
    const { container } = render(<Perle taille={22} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("22");
    /* Sans ombre portée : une perle se pose dans une ligne de texte */
    expect(svg.querySelector("ellipse[filter]")).toBeNull();
  });

  it("une perle vide est une place ronde de la même taille, cachée", () => {
    const { container } = render(<PerleVide taille={18} />);
    const vide = container.querySelector<HTMLElement>('[data-perle="vide"]')!;
    expect(vide.getAttribute("aria-hidden")).toBe("true");
    expect([vide.style.width, vide.style.height]).toEqual(["18px", "18px"]);
  });

  it("une rangée pose ses perles pleines, puis ses places vides ; jamais un nombre négatif", () => {
    const { container, rerender } = render(<Rangee pleines={2} vides={3} />);
    const rangee = container.firstElementChild!;
    expect(rangee.getAttribute("aria-hidden")).toBe("true");
    expect([pleines(rangee), vides(rangee)]).toEqual([2, 3]);
    /* Les pleines d’abord */
    expect(rangee.firstElementChild!.tagName.toLowerCase()).toBe("svg");
    rerender(<Rangee pleines={-1} />);
    expect([pleines(container), vides(container)]).toEqual([0, 0]);
  });

  it("une grappe : trois perles dans un carré de sa taille, à l’échelle", () => {
    const { container } = render(<Grappe taille={20} />);
    const grappe = container.firstElementChild as HTMLElement;
    expect(grappe.getAttribute("aria-hidden")).toBe("true");
    expect([grappe.style.width, grappe.style.height]).toEqual(["20px", "20px"]);
    expect(Array.from(grappe.querySelectorAll("svg"), (s) => s.getAttribute("width"))).toEqual(["8.5", "10", "7.5"]);
  });

  it("le cadeau est un dessin au trait, caché, à sa taille et sa teinte", () => {
    const { container } = render(<Cadeau taille={15} className="text-elle-ink" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("15");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.classList.contains("text-elle-ink")).toBe(true);
  });
});

describe("l’option d’une feuille", () => {
  /** Deux options dans un groupe, comme la recharge : la seconde choisie d’avance. */
  function Deux({ choisir = () => {} }: { choisir?: (v: string) => void }) {
    const [choisie, setChoisie] = useState("b");
    const prendre = (v: string) => {
      setChoisie(v);
      choisir(v);
    };
    return (
      <RadioGroup label="Ton pack">
        <Option on={choisie === "a"} choisir={() => prendre("a")} titre="30 bulles" note="0,16 € la bulle" prix="4,90 €" />
        <Option
          on={choisie === "b"}
          choisir={() => prendre("b")}
          titre="70 bulles"
          tag={<span>+10 offertes</span>}
          badge={<span>Conseillé</span>}
          note="80 bulles"
          prix="9,90 €"
          barre="12,90 €"
        >
          <LigneOfferte bulles={10} />
        </Option>
      </RadioGroup>
    );
  }

  it("un radio du groupe : son titre, sa note, son prix (et le barré) dans son nom ; coché ou non", () => {
    render(<Deux />);
    const [a, b] = auMoins(screen.getAllByRole("radio"), 2);
    expect(screen.getByRole("radiogroup", { name: "Ton pack" })).toBeTruthy();
    expect(a.getAttribute("aria-checked")).toBe("false");
    expect(b.getAttribute("aria-checked")).toBe("true");
    expect(b.textContent).toContain("70 bulles");
    expect(b.textContent).toContain("+10 offertes");
    expect(b.textContent).toContain("Conseillé");
    expect(b.querySelector("s")!.textContent).toBe("12,90 €");
    expect(a.querySelector("s")).toBeNull();
  });

  it("son contenu ne s’ouvre qu’une fois choisie", () => {
    render(<Deux />);
    const [a, b] = auMoins(screen.getAllByRole("radio"), 2);
    /* La ligne offerte (son « 0 € ») : le contenu de la seconde */
    expect(b.textContent).toContain(PIECES.gratuit);
    fireEvent.click(a);
    expect(a.getAttribute("aria-checked")).toBe("true");
    expect(b.textContent).not.toContain(PIECES.gratuit);
  });

  it("au clavier : les flèches choisissent l’option voisine (le groupe les mène)", () => {
    const choisir = vi.fn();
    render(<Deux choisir={choisir} />);
    const [a, b] = auMoins(screen.getAllByRole("radio"), 2);
    expect([a.tabIndex, b.tabIndex]).toEqual([-1, 0]);
    b.focus();
    fireEvent.keyDown(b, { key: "ArrowDown" });
    expect(choisir).toHaveBeenLastCalledWith("a");
    expect(document.activeElement).toBe(a);
  });

  it("le rond à cocher : plein, un point blanc au centre, seulement choisi ; caché aux lecteurs d’écran", () => {
    const { container, rerender } = render(<RondACocher on={false} />);
    const rond = container.firstElementChild!;
    expect(rond.getAttribute("aria-hidden")).toBe("true");
    expect(rond.childElementCount).toBe(0);
    rerender(<RondACocher on />);
    expect(container.firstElementChild!.childElementCount).toBe(1);
    expect(container.firstElementChild!.classList.contains("bg-ink")).toBe(true);
  });

  it("une ligne de contenu : une coche, ou une perle, devant son texte", () => {
    const { container, rerender } = render(<Contenu>7 chapitres, ton plan, ton vocal</Contenu>);
    expect(container.textContent).toBe("7 chapitres, ton plan, ton vocal");
    /* La coche des icônes de l’appli : un seul trait */
    expect(container.querySelector("svg path")).toBeTruthy();
    expect(container.querySelector("svg circle")).toBeNull();
    rerender(<Contenu perle>60 bulles</Contenu>);
    expect(container.querySelector("svg circle")).toBeTruthy();
  });
});

describe("les lignes et les cartes", () => {
  it("la ligne offerte : « + N bulles offertes », à 0 €, son libellé à changer", () => {
    const { container, rerender } = render(<LigneOfferte bulles={50} />);
    expect(container.textContent).toBe(`+ 50 bulles ${PIECES.offertes}${PIECES.gratuit}`);
    expect(PIECES.gratuit).toBe("0\u00a0€");
    rerender(<LigneOfferte bulles={40} libelle="en cadeau" />);
    expect(container.textContent).toContain("+ 40 bulles en cadeau");
  });

  it("une pastille : blanche, ou rose pour ce qui est offert", () => {
    const { container, rerender } = render(<Pastille>Ton vocal</Pastille>);
    const pastille = () => container.firstElementChild!;
    expect(pastille().textContent).toBe("Ton vocal");
    expect(pastille().classList.contains("bg-white")).toBe(true);
    rerender(<Pastille rose>10 bulles offertes</Pastille>);
    expect(pastille().classList.contains("bg-white")).toBe(false);
    expect(pastille().classList.contains("text-elle-ink")).toBe(true);
  });

  it("la carte du chat et son petit bouton encre, qu’on touche", () => {
    const recharger = vi.fn();
    const { container, rerender } = render(
      <Carte>
        <span>Tes bulles sont finies</span>
        <PetitBouton onClick={recharger}>Recharger</PetitBouton>
      </Carte>,
    );
    const ombre = container.firstElementChild!.className;
    fireEvent.click(screen.getByRole("button", { name: "Recharger" }));
    expect(recharger).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Recharger" }).getAttribute("type")).toBe("button");
    rerender(
      <Carte rose>
        <span>Plus que 2 bulles</span>
      </Carte>,
    );
    /* Rose : elle appelle à agir, sa bordure change */
    expect(container.firstElementChild!.className).not.toBe(ombre);
  });

  it("« C’est quoi une bulle ? » : un bouton qui dit la règle et ouvre sa feuille", () => {
    const ouvrir = vi.fn();
    render(<CestQuoiUneBulle ouvrir={ouvrir} />);
    const bouton = screen.getByRole("button", { name: CEST_QUOI.nom });
    expect(bouton.textContent).toBe(CEST_QUOI.texte);
    expect(bouton.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(bouton);
    expect(ouvrir).toHaveBeenCalledTimes(1);
  });
});

describe("la feuille « C’est quoi une bulle ? »", () => {
  it("nommée par son titre ; le focus va sur la feuille à l’ouverture", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    render(<FeuilleBulle open onClose={() => {}} />);
    const feuille = screen.getByRole("dialog", { name: FEUILLE_BULLE.titre });
    act(() => void vi.advanceTimersToNextFrame());
    expect(feuille.contains(document.activeElement)).toBe(true);
    expect(within(feuille).getByText(FEUILLE_BULLE.regle)).toBeTruthy();
    expect(within(feuille).getByText(FEUILLE_BULLE.sousRegle)).toBeTruthy();
  });

  it("ce que coûte chaque réponse est lu dans le catalogue, avec l’unité pour un lecteur d’écran ; le reste est offert", () => {
    render(<FeuilleBulle open onClose={() => {}} />);
    expect(COUTS.map((c) => [c.cle, c.bulles])).toEqual(Object.entries(COUT_EN_BULLES));
    const feuille = screen.getByRole("dialog");
    for (const c of COUTS) {
      const ligne = within(feuille).getByText(c.quoi).closest("div")!;
      expect(ligne.textContent).toBe(`${c.quoi}${c.bulles}${FEUILLE_BULLE.unite(c.bulles)}`);
    }
    expect(FEUILLE_BULLE.unite(1)).toBe("\u00a0bulle");
    expect(FEUILLE_BULLE.unite(3)).toBe("\u00a0bulles");
    expect(within(feuille).getByText(FEUILLE_BULLE.offert.quoi).closest("div")!.textContent).toContain(FEUILLE_BULLE.offert.prix);
  });

  it("les exemples : une liste nommée, où un lecteur d’écran entend qui parle", () => {
    render(<FeuilleBulle open onClose={() => {}} />);
    const liste = screen.getByRole("list", { name: FEUILLE_BULLE.exemplesTitre });
    const items = within(liste).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(FEUILLE_BULLE.exemples.map((e) => `${FEUILLE_BULLE.toi}${e.toi}${FEUILLE_BULLE.blush}${e.blush}`));
  });

  it("sans recharge : « Compris » la ferme, comme Échap", () => {
    const onClose = vi.fn();
    render(<FeuilleBulle open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: FEUILLE_BULLE.compris }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("ouverte du chat : « Recharger · il t’en reste N » ouvre la recharge, sans « Compris »", () => {
    const recharger = vi.fn();
    const onClose = vi.fn();
    render(<FeuilleBulle open onClose={onClose} solde={4} recharger={recharger} />);
    expect(screen.queryByRole("button", { name: FEUILLE_BULLE.compris })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: FEUILLE_BULLE.recharger(4) }));
    expect(recharger).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(FEUILLE_BULLE.recharger(4)).toBe("Recharger · il t’en reste 4");
  });

  it("fermée, elle ne montre rien", () => {
    render(<FeuilleBulle open={false} onClose={() => {}} />);
    expect(screen.queryByText(FEUILLE_BULLE.regle)).toBeNull();
  });
});
