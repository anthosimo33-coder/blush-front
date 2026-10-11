import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactSheet } from "@/app/app/accueil/ContactSheet";
import { creerRegistreEntete, type Departs, type RegistreEntete } from "@/app/app/accueil/mouvement/registre";
import { sortieDeFeuille } from "@/components/ui/surfaces";

/*
 * Les détails du contact de l’accueil (src/app/app/accueil/ContactSheet.tsx) : ce qu’ils montrent, et leur fermeture
 * animée : la feuille joue sa propre sortie au rythme qu’on lui donne (sortie), la bulle et l’avatar regagnent l’en-tête
 * avec elle, et tout reprend sa place à sa fin (onClosed). Le DOM simulé n’a ni mise en page ni animations : animate()
 * est noté et finit quand le test le dit (comme dans sheet.test.tsx), offsetParent est le parent, et les minuteurs
 * (requestAnimationFrame compris) avancent à la main.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }) }));
/*
 * next/link, réduit à ce que la feuille en attend : onNavigate reçoit le toucher, et un lien dont la navigation est
 * empêchée (preventDefault) ne navigue pas. `suivi` note les liens suivis. (Le vrai lien ne navigue que sous le routeur de Next.)
 */
const suivi = vi.hoisted(() => ({ liens: [] as string[] }));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, onNavigate, children, className }: { href: string; onNavigate?: (e: { preventDefault: () => void }) => void; children: ReactNode; className?: string }) => (
    <a
      href={href}
      className={className}
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        let empeche = false;
        onNavigate?.({ preventDefault: () => void (empeche = true) });
        if (!empeche) suivi.liens.push(href);
      }}
    >
      {children}
    </a>
  ),
}));

type Animee = { el: Element; images: Keyframe[]; temps: KeyframeAnimationOptions; finir: () => void };
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
  suivi.liens = [];
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] });
  vi.spyOn(window, "matchMedia").mockImplementation(
    (requete: string) => ({ matches: requete.includes("reduced-motion") ? moinsDeMouvement : false, media: requete, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
  );
  Element.prototype.animate = function (this: Element, images: Keyframe[] | PropertyIndexedKeyframes | null, temps?: number | KeyframeAnimationOptions) {
    let finir!: () => void;
    const finished = new Promise<void>((ok) => (finir = ok));
    animees.push({ el: this, images: images as Keyframe[], temps: temps as KeyframeAnimationOptions, finir });
    return { finished, cancel: vi.fn() } as unknown as Animation;
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

/** Ce que l’accueil donne à la feuille hors du départ : le registre de son en-tête (vide), et lui-même (absent ici). */
const sansAccueil = () => ({ entete: creerRegistreEntete(), pageRef: { current: null } });

/** L’accueil autour de la feuille : il l’ouvre (« ouvrir ») et la ferme quand elle le demande (onClose). Son registre et sa ref ne changent pas, comme dans HomeScreen. */
function Accueil({
  departRef,
  onClose,
  entete: registre,
  pageRef: ref,
}: {
  departRef: { current: Departs | null };
  onClose?: () => void;
  entete?: RegistreEntete;
  pageRef?: { current: HTMLElement | null };
}) {
  const [open, setOpen] = useState(true);
  const [entete] = useState(() => registre ?? creerRegistreEntete());
  const [pageRef] = useState(() => ref ?? { current: null });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        ouvrir
      </button>
      <ContactSheet
        contact={CONTACT}
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        departRef={departRef}
        entete={entete}
        pageRef={pageRef}
      />
    </>
  );
}

const feuille = () => screen.getByRole("dialog", { name: "Maëlys et toi" });
const dialogue = () => document.querySelector("dialog")!;
const panneau = () => feuille().querySelector<HTMLElement>("[tabindex='-1']")!;
const voile = () => feuille().querySelector<HTMLElement>("[aria-hidden='true']")!;

describe("ContactSheet : ce qu’il montre", () => {
  it("le verdict, où vous en êtes (le chemin compact des niveaux), le rapport et sa fiche", () => {
    render(<ContactSheet contact={CONTACT} open onClose={() => {}} departRef={{ current: null }} {...sansAccueil()} />);
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
    render(<ContactSheet contact={{ ...CONTACT, fiche: { ...CONTACT.fiche, summaryShort: "" } }} open onClose={() => {}} departRef={{ current: null }} {...sansAccueil()} />);
    const titre = within(feuille()).getByText("Sa fiche");
    expect(titre.nextElementSibling?.className).toContain("truncate");
    expect(titre.nextElementSibling?.textContent).toBe("");
  });

  it("sa fiche mène où l’accueil le dit (l’aperçu a la sienne)", () => {
    render(<ContactSheet contact={{ ...CONTACT, ficheHref: "/apercu/fiche" }} open onClose={() => {}} departRef={{ current: null }} {...sansAccueil()} />);
    expect(within(feuille()).getByRole("link", { name: /^Sa fiche/ }).getAttribute("href")).toBe("/apercu/fiche");
  });
});

describe("ContactSheet : l’ouverture et la fermeture animées", () => {
  it("la bulle et l’avatar quittent l’en-tête ; à la fermeture, onClose tout de suite, la feuille redescend à son rythme, et tout reprend sa place à la fin de sa sortie", async () => {
    const onClose = vi.fn();
    const de = enTete();
    const departRef = { current: de as Departs | null };
    render(<Accueil departRef={departRef} onClose={onClose} />);
    act(() => void vi.advanceTimersByTime(20));
    /* Le départ est lu une fois, puis oublié ; ce qui vole est caché à sa place de départ */
    expect(departRef.current).toBeNull();
    expect(de.logo!.src.style.visibility).toBe("hidden");
    expect(de.av!.src.style.visibility).toBe("hidden");
    /* L’écran recule derrière la feuille (mobile) : sans accueil dans ce test, il n’y a rien à faire reculer */
    animees = [];

    fireEvent.click(within(feuille()).getByRole("button", { name: "Fermer" }));
    /* La fermeture est demandée tout de suite : la feuille joue sa propre sortie, au rythme de celle du contact (300 ms) */
    expect(onClose).toHaveBeenCalledTimes(1);
    const { temps, panneau: descente, voile: extinction } = sortieDeFeuille(false, { duration: 300, easing: "cubic-bezier(0.3, 0, 0.2, 1)" });
    const duPanneau = animees.find((a) => a.el === panneau());
    const duVoile = animees.find((a) => a.el === voile());
    expect(duPanneau).toMatchObject({ images: descente, temps });
    expect(duVoile).toMatchObject({ images: extinction, temps });
    /* La bulle et l’avatar regagnent l’en-tête au même rythme (leurs doubles volent) ; l’en-tête reste caché pendant la sortie */
    expect(animees.filter((a) => a.el !== panneau() && a.el !== voile()).every((a) => a.temps.duration === 300)).toBe(true);
    expect(de.logo!.src.style.visibility).toBe("hidden");
    expect(dialogue().open).toBe(true);
    /* Un second toucher pendant la sortie ne la relance pas */
    fireEvent.click(within(feuille()).getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(animees.filter((a) => a.el === panneau())).toHaveLength(1);

    /* La sortie finie, le dialogue se ferme (onClosed) : tout reprend sa place dans l’en-tête */
    await act(async () => duPanneau!.finir());
    await act(async () => {});
    expect(dialogue().open).toBe(false);
    expect(de.logo!.src.style.visibility).toBe("");
    expect(de.av!.src.style.visibility).toBe("");
  });

  it("rouverte pendant sa sortie : la précédente remet tout en place, la bulle et l’avatar repartent vers la feuille", async () => {
    const de = enTete();
    const departRef = { current: de as Departs | null };
    render(<Accueil departRef={departRef} />);
    act(() => void vi.advanceTimersByTime(20));
    fireEvent.click(within(feuille()).getByRole("button", { name: "Fermer" }));
    departRef.current = de;
    fireEvent.click(screen.getByText("ouvrir"));
    act(() => void vi.advanceTimersByTime(20));
    expect(dialogue().open).toBe(true);
    /* Repartis vers la feuille : cachés à leur place de départ, et la fermeture suivante rejoue la sortie */
    expect(de.logo!.src.style.visibility).toBe("hidden");
    animees = [];
    fireEvent.click(within(feuille()).getByRole("button", { name: "Fermer" }));
    expect(animees.some((a) => a.el === panneau())).toBe(true);
  });

  it("l’accueil quitté pendant la sortie : rien ne reste caché dans l’en-tête", () => {
    const de = enTete();
    const { unmount } = render(<Accueil departRef={{ current: de }} />);
    act(() => void vi.advanceTimersByTime(20));
    fireEvent.click(within(feuille()).getByRole("button", { name: "Fermer" }));
    expect(de.logo!.src.style.visibility).toBe("hidden");
    unmount();
    expect(de.logo!.src.style.visibility).toBe("");
    expect(de.av!.src.style.visibility).toBe("");
  });

  it("moins d’animations : rien ne vole, la fermeture est demandée tout de suite (la feuille joue sa propre sortie)", () => {
    moinsDeMouvement = true;
    const onClose = vi.fn();
    const de = enTete();
    render(<ContactSheet contact={CONTACT} open onClose={onClose} departRef={{ current: de }} {...sansAccueil()} />);
    act(() => void vi.advanceTimersByTime(20));
    expect(de.logo!.src.style.visibility).toBe("");
    fireEvent.click(within(feuille()).getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(animees.some((a) => a.el === panneau())).toBe(false);
  });

  it("vers le rapport : le dialogue se ferme d’un coup, tout reprend sa place, puis on part, une image et 120 ms plus tard", () => {
    const onClose = vi.fn();
    const de = enTete();
    render(<Accueil departRef={{ current: de }} onClose={onClose} />);
    act(() => void vi.advanceTimersByTime(20));
    animees = [];
    fireEvent.click(within(feuille()).getByRole("link", { name: /Le rapport de votre histoire/ }));
    expect(dialogue().open).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    /* Sans sortie animée : rien ne redescend, et l’en-tête est déjà en place (Safari le capture pour le geste retour) */
    expect(animees.some((a) => a.el === panneau())).toBe(false);
    expect(de.logo!.src.style.visibility).toBe("");
    expect(push).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(20 + 120));
    expect(push).toHaveBeenCalledWith("/rapport");
    /* Le lien lui-même ne navigue pas : c’est le départ différé qui s’en charge */
    expect(suivi.liens).toEqual([]);
  });

  it("9 · l’accueil recule derrière la feuille par sa ref (mobile) : il rétrécit et s’arrondit, revient à la fermeture, et tout est remis à la fin de la sortie", async () => {
    const accueil = document.body.appendChild(document.createElement("div"));
    enTetes.push(accueil);
    render(<Accueil departRef={{ current: enTete() }} pageRef={{ current: accueil }} />);
    act(() => void vi.advanceTimersByTime(20));
    const recul = animees.find((a) => a.el === accueil);
    expect(recul?.images).toEqual([{ transform: "none" }, { transform: "scale(0.94)" }]);
    expect(recul?.temps).toMatchObject({ duration: 380, fill: "forwards" });
    expect(accueil.style.clipPath).toMatch(/^inset\(.* round 24px\)$/);
    expect(document.body.style.background).toBe("#000");

    animees = [];
    fireEvent.click(within(feuille()).getByRole("button", { name: "Fermer" }));
    /* Il revient au rythme de la sortie de la feuille */
    expect(animees.find((a) => a.el === accueil)).toMatchObject({ images: [{ transform: "scale(0.94)" }, { transform: "none" }], temps: { duration: 300 } });
    await act(async () => animees.find((a) => a.el === panneau())!.finir());
    await act(async () => {});
    expect(dialogue().open).toBe(false);
    expect(accueil.style.clipPath).toBe("");
    expect(document.body.style.background).toBe("");
  });

  it("9 · sans départ relevé au toucher : la bulle et l’avatar sont pris au registre de l’en-tête à l’ouverture, ceux qu’on voit, et volent", () => {
    const entete = creerRegistreEntete();
    const [cache, logo, av] = [0, 1, 2].map(() => {
      const el = document.body.appendChild(document.createElement("span"));
      enTetes.push(el);
      return el;
    });
    /* L’en-tête existe deux fois : celui qui est masqué (sans rectangles) ne part pas */
    cache.getClientRects = () => [] as unknown as DOMRectList;
    [logo, av].forEach((el) => (el.getClientRects = () => [{}] as unknown as DOMRectList));
    entete.inscrire.logo(cache);
    entete.inscrire.logo(logo);
    entete.inscrire.avatar(av);
    render(<Accueil departRef={{ current: null }} entete={entete} />);
    act(() => void vi.advanceTimersByTime(20));
    expect(logo.style.visibility).toBe("hidden");
    expect(av.style.visibility).toBe("hidden");
    expect(cache.style.visibility).toBe("");
    /* Leurs doubles volent vers la feuille, au rythme de sa montée */
    const vols = animees.filter((a) => a.el !== panneau() && a.el !== voile());
    expect(vols.length).toBeGreaterThanOrEqual(2);
    expect(vols.every((a) => a.temps.duration === 380)).toBe(true);
  });

  it("vers sa fiche : le lien est suivi (la feuille garde le glissé de l’avatar)", () => {
    render(<Accueil departRef={{ current: enTete() }} />);
    fireEvent.click(within(feuille()).getByRole("link", { name: /^Sa fiche/ }));
    expect(suivi.liens).toEqual(["/app/fiche"]);
  });
});
