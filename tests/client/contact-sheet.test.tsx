import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRouter } from "next/router";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { ContactSheet, type Departs } from "@/app/app/accueil/ContactSheet";
import { sortieDeFeuille } from "@/components/ui/surfaces";

/*
 * Les détails du contact de l’accueil (src/app/app/accueil/ContactSheet.tsx) : ce qu’ils montrent, et leur fermeture
 * animée, qui passe par les refs de la feuille (son panneau, son voile, son dialogue) et non par le DOM autour d’elle.
 * Le DOM simulé n’a ni mise en page ni animations : animate() est noté (comme dans sheet.test.tsx), offsetParent est
 * le parent, et les minuteurs (requestAnimationFrame compris) avancent à la main.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }) }));

type Animee = { el: Element; images: Keyframe[]; temps: KeyframeAnimationOptions };
let animees: Animee[] = [];
let moinsDeMouvement = false;
/* Les éléments d’en-tête posés par un test (enTete), retirés après lui */
const enTetes: HTMLElement[] = [];
const { animate, getAnimations } = Element.prototype;
const offsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");

beforeEach(() => {
  animees = [];
  moinsDeMouvement = false;
  push.mockReset();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] });
  vi.spyOn(window, "matchMedia").mockImplementation(
    (requete: string) => ({ matches: requete.includes("reduced-motion") ? moinsDeMouvement : false, media: requete, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
  );
  Element.prototype.animate = function (this: Element, images: Keyframe[] | PropertyIndexedKeyframes | null, temps?: number | KeyframeAnimationOptions) {
    animees.push({ el: this, images: images as Keyframe[], temps: temps as KeyframeAnimationOptions });
    return { finished: new Promise(() => {}), cancel: vi.fn() } as unknown as Animation;
  };
  Element.prototype.getAnimations = () => [];
  Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get: function (this: HTMLElement) { return this.parentElement; } });
});

afterEach(() => {
  vi.useRealTimers();
  Element.prototype.animate = animate;
  Element.prototype.getAnimations = getAnimations;
  if (offsetParent) Object.defineProperty(HTMLElement.prototype, "offsetParent", offsetParent);
  document.body.removeAttribute("style");
  enTetes.splice(0).forEach((el) => el.remove());
});

const CONTACT: ComponentProps<typeof ContactSheet>["contact"] = {
  report: { verdict: { emoji: "🤏", short: "À deux doigts", title: "Elle hésite encore", subtitle: "Un pas de plus" }, level: "dit", trend: "En hausse", nextStep: "Propose-lui un verre" },
  fiche: { person: { id: "p1", name: "Maëlys", initial: "M" }, summaryShort: "Son exam jeudi" },
  period: "4 sept. → 7 sept.",
};

/** L’en-tête de l’accueil, tel que departs() le relève au toucher : la bulle de BLUSH et l’avatar de l’autre. */
function enTete(): Departs {
  const [logo, av] = [0, 1].map(() => document.body.appendChild(document.createElement("span")));
  enTetes.push(logo, av);
  return { logo: { src: logo, from: { left: 150, top: 10, width: 88, height: 88 } }, av: { src: av, from: { left: 330, top: 20, width: 40, height: 40 } } };
}

const feuille = () => screen.getByRole("dialog", { name: "Maëlys et toi" });
const panneau = () => feuille().querySelector<HTMLElement>("[tabindex='-1']")!;
const voile = () => feuille().querySelector<HTMLElement>("[aria-hidden='true']")!;

describe("ContactSheet : ce qu’il montre", () => {
  it("le verdict, où vous en êtes (le chemin compact des niveaux), le rapport et sa fiche", () => {
    render(<ContactSheet contact={CONTACT} open onClose={() => {}} departRef={{ current: null }} />);
    const f = within(feuille());
    expect(f.getByText("Ce que BLUSH voit")).toBeTruthy();
    expect(f.getByRole("heading", { name: "Maëlys et toi" })).toBeTruthy();
    expect(f.getByText("🤏 À deux doigts")).toBeTruthy();
    expect(f.getByText("En hausse")).toBeTruthy();
    expect(f.getAllByRole("listitem").map((l) => l.textContent)).toEqual(["On se parle\u00a0: réussi", "On se voit\u00a0: réussi", "On se le dit\u00a0: niveau en cours", "On est ensemble\u00a0: à venir"]);
    const rapport = f.getByRole("link", { name: /Le rapport de votre histoire/ });
    expect(rapport.getAttribute("href")).toBe("/rapport");
    expect(rapport.textContent).toContain("4 sept. → 7 sept.");
    const fiche = f.getByRole("link", { name: /^Sa fiche/ });
    expect(fiche.getAttribute("href")).toBe("/app/fiche");
    expect(fiche.textContent).toContain("Son exam jeudi");
  });

  it("sa fiche pas encore écrite : sa ligne garde un sous-titre, vide (le titre ne descend pas)", () => {
    render(<ContactSheet contact={{ ...CONTACT, fiche: { ...CONTACT.fiche, summaryShort: "" } }} open onClose={() => {}} departRef={{ current: null }} />);
    const titre = within(feuille()).getByText("Sa fiche");
    expect(titre.nextElementSibling?.className).toContain("truncate");
    expect(titre.nextElementSibling?.textContent).toBe("");
  });

  it("sa fiche mène où l’accueil le dit (l’aperçu a la sienne)", () => {
    render(<ContactSheet contact={{ ...CONTACT, ficheHref: "/apercu/fiche" }} open onClose={() => {}} departRef={{ current: null }} />);
    expect(within(feuille()).getByRole("link", { name: /^Sa fiche/ }).getAttribute("href")).toBe("/apercu/fiche");
  });
});

describe("ContactSheet : l’ouverture et la fermeture animées", () => {
  it("la bulle et l’avatar quittent l’en-tête ; à la fermeture, le panneau et le voile de la feuille redescendent à son rythme, puis onClose", () => {
    const onClose = vi.fn();
    const de = enTete();
    const departRef = { current: de };
    const { rerender } = render(<ContactSheet contact={CONTACT} open onClose={onClose} departRef={departRef} />);
    act(() => void vi.advanceTimersByTime(20));
    /* Le départ est lu une fois, puis oublié ; ce qui vole est caché à sa place de départ */
    expect(departRef.current).toBeNull();
    expect(de.logo!.src.style.visibility).toBe("hidden");
    expect(de.av!.src.style.visibility).toBe("hidden");
    /* L’écran recule derrière la feuille (mobile) : sans accueil dans ce test, il n’y a rien à faire reculer */
    animees = [];

    fireEvent.click(within(feuille()).getByRole("button", { name: "Fermer" }));
    const { temps, panneau: descente, voile: extinction } = sortieDeFeuille(false, { duration: 300, easing: "cubic-bezier(0.3, 0, 0.2, 1)" });
    const duPanneau = animees.find((a) => a.el === panneau());
    const duVoile = animees.find((a) => a.el === voile());
    expect(duPanneau).toEqual({ el: panneau(), images: descente, temps });
    expect(duVoile).toEqual({ el: voile(), images: extinction, temps });
    expect(onClose).not.toHaveBeenCalled();
    /* Un second toucher pendant la sortie ne la relance pas */
    fireEvent.click(within(feuille()).getByRole("button", { name: "Fermer" }));
    expect(animees.filter((a) => a.el === panneau())).toHaveLength(1);
    act(() => void vi.advanceTimersByTime(300));
    expect(onClose).toHaveBeenCalledTimes(1);

    /* Fermée : tout reprend sa place dans l’en-tête */
    rerender(<ContactSheet contact={CONTACT} open={false} onClose={onClose} departRef={departRef} />);
    expect(de.logo!.src.style.visibility).toBe("");
    expect(de.av!.src.style.visibility).toBe("");
  });

  it("moins d’animations : rien ne vole, la fermeture est demandée tout de suite (la feuille joue sa propre sortie)", () => {
    moinsDeMouvement = true;
    const onClose = vi.fn();
    const de = enTete();
    render(<ContactSheet contact={CONTACT} open onClose={onClose} departRef={{ current: de }} />);
    act(() => void vi.advanceTimersByTime(20));
    expect(de.logo!.src.style.visibility).toBe("");
    fireEvent.click(within(feuille()).getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(animees.some((a) => a.el === panneau())).toBe(false);
  });

  it("vers le rapport : le dialogue se ferme d’un coup, puis on part, une image et 120 ms plus tard", () => {
    const onClose = vi.fn();
    /*
     * next/link ne suit un lien (et n’appelle onNavigate) que sous un routeur. Hors du build de Next, `next/link` est
     * celui des pages : un routeur simulé, qui note (le lien lui-même ne doit pas s’en servir)
     */
    const routeur = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(() => Promise.resolve()) } as unknown as NextRouter;
    render(
      <RouterContext value={routeur}>
        <ContactSheet contact={CONTACT} open onClose={onClose} departRef={{ current: enTete() }} />
      </RouterContext>,
    );
    act(() => void vi.advanceTimersByTime(20));
    const dialogue = document.querySelector("dialog")!;
    fireEvent.click(within(feuille()).getByRole("link", { name: /Le rapport de votre histoire/ }));
    expect(dialogue.open).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(20 + 120));
    expect(push).toHaveBeenCalledWith("/rapport");
    /* Le lien lui-même ne navigue pas : c’est le départ différé qui s’en charge */
    expect(routeur.push).not.toHaveBeenCalled();
  });
});
