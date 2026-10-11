import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sheet, sortieDeFeuille, TitreFeuille } from "@/components/ui/surfaces";

/*
 * La feuille (src/components/ui/surfaces.tsx) : son titre (posé par l’écran, ou par elle avec useId), les refs qu’elle
 * donne à l’écran, et sa sortie animée, finie avant que le dialogue se ferme. Le DOM simulé n’anime rien : animate()
 * est remplacé par une animation tenue à la main (le test dit quand elle finit), et matchMedia par la réponse du test.
 */

type Animee = { el: Element; images: Keyframe[]; temps: KeyframeAnimationOptions; finir: () => void; cancel: ReturnType<typeof vi.fn> };
let animees: Animee[] = [];
let moinsDeMouvement = false;
let ordinateur = false;
/* Ce que le DOM simulé avait à leur place, remis après chaque test */
const { animate, getAnimations } = Element.prototype;

beforeEach(() => {
  animees = [];
  moinsDeMouvement = false;
  ordinateur = false;
  vi.spyOn(window, "matchMedia").mockImplementation(
    (requete: string) =>
      ({
        matches: requete.includes("reduced-motion") ? moinsDeMouvement : requete.includes("min-width: 1024px") ? ordinateur : false,
        media: requete,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  /* Le DOM simulé n’anime rien : une animation que le test finit lui-même, et aucune animation en cours */
  Element.prototype.animate = function (this: Element, images: Keyframe[] | PropertyIndexedKeyframes | null, temps?: number | KeyframeAnimationOptions) {
    let finir!: () => void;
    const finished = new Promise<void>((ok) => (finir = ok));
    const cancel = vi.fn();
    animees.push({ el: this, images: images as Keyframe[], temps: temps as KeyframeAnimationOptions, finir, cancel });
    return { finished, cancel } as unknown as Animation;
  };
  Element.prototype.getAnimations = () => [];
});

afterEach(() => {
  Element.prototype.animate = animate;
  Element.prototype.getAnimations = getAnimations;
});

/** Une feuille qu’on ouvre et ferme par un bouton, comme un écran. */
function Ecran(props: { onClosed?: () => void; sortie?: { duration: number; easing: string } }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)}>
        basculer
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Ta feuille" onClosed={props.onClosed} sortie={props.sortie}>
        <p>Le contenu</p>
      </Sheet>
    </>
  );
}

const dialogue = () => document.querySelector("dialog")!;

describe("Sheet : le titre", () => {
  it("pose son titre et le donne à lire au dialogue, avec un id à elle", () => {
    render(
      <>
        <Sheet open onClose={() => {}} title="Première">
          <p>un</p>
        </Sheet>
        <Sheet open onClose={() => {}} title="Seconde" titleSize={26}>
          <p>deux</p>
        </Sheet>
      </>,
    );
    const [a, b] = Array.from(document.querySelectorAll("dialog"));
    const titreA = screen.getByRole("heading", { name: "Première" });
    const titreB = screen.getByRole("heading", { name: "Seconde" });
    expect(a.getAttribute("aria-labelledby")).toBe(titreA.id);
    expect(b.getAttribute("aria-labelledby")).toBe(titreB.id);
    expect(titreA.id).not.toBe(titreB.id);
    expect(titreA.className).toContain("text-titre-3");
    expect(titreB.className).toContain("text-[26px]");
  });

  it("garde l’API d’avant : labelledBy désigne le titre que l’écran pose lui-même", () => {
    render(
      <Sheet open onClose={() => {}} labelledBy="mon-titre">
        <h2 id="mon-titre">Le mien</h2>
      </Sheet>,
    );
    expect(dialogue().getAttribute("aria-labelledby")).toBe("mon-titre");
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("titleClose : un bouton Fermer à côté du titre, qui demande la fermeture", () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Partager" titleClose>
        <p>contenu</p>
      </Sheet>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Sheet : les refs données à l’écran", () => {
  it("donne le dialogue, le panneau et le voile, en objet comme en fonction", () => {
    const dialogRef = createRef<HTMLDialogElement>();
    const panelRef = createRef<HTMLDivElement>();
    let voile: HTMLDivElement | null = null;
    render(
      <Sheet open onClose={() => {}} title="Refs" dialogRef={dialogRef} panelRef={panelRef} backdropRef={(el) => void (voile = el)}>
        <p>contenu</p>
      </Sheet>,
    );
    expect(dialogRef.current).toBe(dialogue());
    expect(panelRef.current?.getAttribute("tabindex")).toBe("-1");
    expect(panelRef.current?.textContent).toContain("contenu");
    expect(voile).not.toBeNull();
    expect(voile!.getAttribute("aria-hidden")).toBe("true");
    expect(voile!.nextElementSibling?.contains(panelRef.current)).toBe(true);
  });

  it("le voile touché demande la fermeture, comme Échap", () => {
    const onClose = vi.fn();
    const backdropRef = createRef<HTMLDivElement>();
    render(
      <Sheet open onClose={onClose} title="Voile" backdropRef={backdropRef}>
        <p>contenu</p>
      </Sheet>,
    );
    fireEvent.click(backdropRef.current!);
    fireEvent(dialogue(), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("Sheet : la sortie animée", () => {
  it("redescend avant de se fermer : le contenu reste là, puis le dialogue se ferme et onClosed suit", async () => {
    const onClosed = vi.fn();
    render(<Ecran onClosed={onClosed} />);
    expect(dialogue().open).toBe(true);
    fireEvent.click(screen.getByText("basculer"));
    /* Le panneau et le voile s’animent ensemble, au rythme du téléphone par défaut */
    expect(animees).toHaveLength(2);
    expect(animees.map((a) => a.temps.duration)).toEqual([280, 280]);
    expect(animees[0].images).toEqual(sortieDeFeuille(false).panneau);
    expect(dialogue().open).toBe(true);
    expect(screen.getByText("Le contenu")).toBeTruthy();
    expect(onClosed).not.toHaveBeenCalled();
    await act(async () => animees[0].finir());
    expect(dialogue().open).toBe(false);
    expect(screen.queryByText("Le contenu")).toBeNull();
    /* Le dialogue fermé annonce sa fermeture : onClosed, une fois */
    await act(async () => {});
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("prend la durée et la courbe que l’écran lui donne", () => {
    render(<Ecran sortie={{ duration: 300, easing: "linear" }} />);
    fireEvent.click(screen.getByText("basculer"));
    expect(animees.map((a) => [a.temps.duration, a.temps.easing])).toEqual([
      [300, "linear"],
      [300, "linear"],
    ]);
  });

  it("rouverte pendant sa sortie, elle reprend sa place : la sortie est annulée", () => {
    render(<Ecran />);
    fireEvent.click(screen.getByText("basculer"));
    fireEvent.click(screen.getByText("basculer"));
    expect(animees.every((a) => a.cancel.mock.calls.length === 1)).toBe(true);
    expect(dialogue().open).toBe(true);
  });

  it("sans animation quand l’appareil demande moins de mouvement : fermée tout de suite", async () => {
    moinsDeMouvement = true;
    const onClosed = vi.fn();
    render(<Ecran onClosed={onClosed} />);
    fireEvent.click(screen.getByText("basculer"));
    expect(animees).toHaveLength(0);
    expect(dialogue().open).toBe(false);
    await act(async () => {});
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});

describe("sortieDeFeuille", () => {
  it("redescend sur téléphone (280 ms), s’efface en reculant sur ordinateur (200 ms)", () => {
    const tel = sortieDeFeuille(false);
    const ordi = sortieDeFeuille(true);
    expect(tel.temps).toEqual({ duration: 280, easing: "cubic-bezier(0.3, 0, 0.2, 1)", fill: "forwards" });
    expect(tel.panneau.at(-1)).toEqual({ transform: "translateY(100%)" });
    expect(ordi.temps.duration).toBe(200);
    expect(ordi.panneau.at(-1)).toEqual({ opacity: 0, transform: "translateY(16px) scale(0.98)" });
    expect(tel.voile).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(sortieDeFeuille(true, { duration: 300, easing: "linear" }).temps).toEqual({ duration: 300, easing: "linear", fill: "forwards" });
  });
});

describe("TitreFeuille", () => {
  it("un titre de feuille à sa taille, seul ou avec le bouton Fermer", () => {
    const fermer = vi.fn();
    const { rerender } = render(
      <TitreFeuille id="t" taille={22}>
        La vidéo
      </TitreFeuille>,
    );
    const titre = screen.getByRole("heading", { name: "La vidéo" });
    expect(titre.id).toBe("t");
    expect(titre.className).toContain("text-[22px]");
    expect(screen.queryByRole("button")).toBeNull();
    rerender(
      <TitreFeuille id="t" fermer={fermer}>
        La vidéo
      </TitreFeuille>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(fermer).toHaveBeenCalledTimes(1);
  });
});
