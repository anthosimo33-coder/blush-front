import { act, render, renderHook } from "@testing-library/react";
import { createElement, createRef, type ComponentProps, type RefObject } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvecLogoDuFil, BlushTitle, LogoDuFil, SophieButton } from "@/app/app/accueil/Entetes";
import { ConvEnBas } from "@/app/app/accueil/mouvement/ConvEnBas";
import { useAnciensEnRemontant, useConvSuitLeBas, useDefilement } from "@/app/app/accueil/mouvement/defilement";
import { useEnteteAuClavier, useHeaderCollapse } from "@/app/app/accueil/mouvement/entete";
import { celebrate } from "@/app/app/accueil/mouvement/fete";
import { useThreadGestures } from "@/app/app/accueil/mouvement/gestes";
import { recede, shown } from "@/app/app/accueil/mouvement/recul";
import { creerRegistreEntete, departs, useRegistreEntete } from "@/app/app/accueil/mouvement/registre";
import { launch } from "@/app/app/accueil/mouvement/vol";
import { flyBox, flyText } from "@/lib/motion";
import type { Msg } from "@/app/app/accueil/conv/modele";
import { auMoins } from "../aide/listes";

/*
 * Le mouvement de l’accueil (src/app/app/accueil/mouvement/) et ses en-têtes (accueil/Entetes.tsx), dans le DOM simulé :
 * le registre de l’en-tête (ce qui part de l’en-tête ou s’y anime, pris là au lieu d’être cherché dans la page), l’écran
 * qui recule par sa ref, la fête d’un niveau, les vols, le repli de l’en-tête et l’en-tête au clavier, les gestes de la
 * conv, son défilement (posée en bas, retour par l’historique, la conv qui suit le bas, les anciens en remontant), l’arrivée
 * du jour et le script qui pose la conv en bas. Le DOM simulé n’a ni mise en page ni animations :
 * animate() est noté (et rend une animation qu’on finit à la main), ce qu’on voit (getClientRects) et les rectangles
 * sont posés par le test, et les minuteurs (requestAnimationFrame compris) avancent à la main.
 */

/* Les mêmes espions pour les modules rechargés (l’arrivée se teste sur un module neuf, voir plus bas) */
const espions = vi.hoisted(() => ({ play: vi.fn(), markArrivalPlayed: vi.fn() }));
vi.mock("@/lib/sound", () => ({ play: espions.play }));
vi.mock("@/services/session", () => ({ markArrivalPlayed: espions.markArrivalPlayed }));
vi.mock("@/lib/motion", async (vrai) => {
  const m = await vrai<typeof import("@/lib/motion")>();
  return { ...m, flyText: vi.fn(() => Promise.resolve()), flyBox: vi.fn(() => Promise.resolve()) };
});
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => createElement("a", { href, className }, children as never),
}));

type Animee = { el: Element; images: Keyframe[]; temps: KeyframeAnimationOptions | number | undefined; animation: Animation & { onfinish: (() => void) | null } };
let animees: Animee[] = [];
let desktop = false;
let moinsDeMouvement = false;
const { animate, getAnimations } = Element.prototype;
const posees: HTMLElement[] = [];

beforeEach(() => {
  /* Les espions des modules simulés comptent depuis zéro à chaque test */
  vi.clearAllMocks();
  animees = [];
  desktop = false;
  moinsDeMouvement = false;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] });
  vi.spyOn(window, "matchMedia").mockImplementation(
    (requete: string) =>
      ({
        matches: requete.includes("reduced-motion") ? moinsDeMouvement : requete.includes("min-width") ? desktop : false,
        media: requete,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  Element.prototype.animate = function (this: Element, images: Keyframe[] | PropertyIndexedKeyframes | null, temps?: number | KeyframeAnimationOptions) {
    const animation = { onfinish: null, cancel: vi.fn(), finish: vi.fn(), finished: Promise.resolve() } as unknown as Animee["animation"];
    animees.push({ el: this, images: images as Keyframe[], temps, animation });
    return animation;
  };
  Element.prototype.getAnimations = () => [];
});

afterEach(() => {
  vi.useRealTimers();
  Element.prototype.animate = animate;
  Element.prototype.getAnimations = getAnimations;
  posees.splice(0).forEach((el) => el.remove());
  document.body.removeAttribute("style");
  document.documentElement.removeAttribute("style");
  document.querySelectorAll(".level-spark").forEach((el) => el.remove());
});

/** Un élément posé dans la page (retiré après le test) ; `vu` : il a des rectangles (on le voit), `boite` : son rectangle. */
function pose<T extends HTMLElement>(el: T, { vu = true, boite }: { vu?: boolean; boite?: Partial<DOMRect> } = {}) {
  document.body.append(el);
  posees.push(el);
  voir(el, vu);
  if (boite) el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, ...boite }) as DOMRect;
  return el;
}

/** Ce qu’on voit : un élément affiché a des rectangles, un élément caché (`lg:hidden`, `hidden lg:grid`) n’en a pas. */
function voir(el: Element, vu: boolean) {
  el.getClientRects = () => (vu ? [{}] : []) as unknown as DOMRectList;
}

const span = () => document.createElement("span");

/** Les dimensions de la page et sa place, posées par le test (le DOM simulé n’a pas de mise en page). */
function page({ hauteur, y, vue }: { hauteur: number; y: number; vue: number }) {
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: hauteur });
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: vue });
}

describe("le registre de l’en-tête", () => {
  it("chacun s’inscrit par sa ref et se retire au démontage ; on prend celui qu’on voit (mobile ou desktop)", () => {
    const entete = creerRegistreEntete();
    const mobile = pose(span(), { vu: false });
    const ordi = pose(span());
    const retirerMobile = entete.inscrire.logo(mobile);
    entete.inscrire.logo(ordi);
    expect(entete.visible("logo")).toBe(ordi);
    voir(mobile, true);
    voir(ordi, false);
    expect(entete.visible("logo")).toBe(mobile);
    retirerMobile?.();
    expect(entete.visible("logo")).toBeNull();
    /* Un rôle ne prend pas les éléments d’un autre */
    expect(entete.visible("avatar")).toBeNull();
    /* Le démontage d’une ref passe par son nettoyage : React ne la rappelle pas avec null */
    expect(entete.inscrire.logo(null)).toBeUndefined();
  });

  it("le même registre et les mêmes refs pendant toute la vie de l’accueil", () => {
    const { result, rerender } = renderHook(() => useRegistreEntete());
    const premier = result.current;
    rerender();
    expect(result.current).toBe(premier);
    expect(result.current.inscrire.logo).toBe(premier.inscrire.logo);
  });

  it("9 · d’où partent la bulle de BLUSH et l’avatar vers la feuille du contact : ceux qu’on voit, relevés au toucher", () => {
    const entete = creerRegistreEntete();
    const logo = pose(span(), { boite: { left: 150, top: 10, width: 88, height: 88 } });
    const av = pose(span(), { boite: { left: 330, top: 20, width: 40, height: 40 } });
    entete.inscrire.logo(logo);
    entete.inscrire.avatar(av);
    const de = departs(entete);
    expect(de.logo?.src).toBe(logo);
    expect(de.logo?.from).toMatchObject({ left: 150, top: 10, width: 88, height: 88 });
    expect(de.av?.src).toBe(av);
    expect(de.av?.from).toMatchObject({ left: 330, width: 40 });
    /* Rien d’inscrit : rien ne vole */
    expect(departs(creerRegistreEntete())).toEqual({ logo: null, av: null });
  });

  it("les en-têtes s’inscrivent d’eux-mêmes : la bulle de BLUSH, l’anneau et l’avatar de l’autre", () => {
    const entete = creerRegistreEntete();
    const contact: ComponentProps<typeof SophieButton>["contact"] = {
      report: { verdict: { emoji: "🔥", short: "Ça chauffe", title: "Elle répond vite", subtitle: "" }, level: "voit", trend: "En hausse", nextStep: "" },
      fiche: { person: { id: "p1", name: "Maëlys", initial: "M" }, summaryShort: "" },
    };
    const { container, unmount } = render(
      createElement(
        "div",
        null,
        createElement(BlushTitle, { busy: false, onClick: () => {}, logoRef: entete.inscrire.logo }),
        createElement(SophieButton, { contact, anneauRef: entete.inscrire.anneau, avatarRef: entete.inscrire.avatar }),
      ),
    );
    container.querySelectorAll("*").forEach((el) => voir(el, true));
    expect(entete.visible("logo")?.hasAttribute("data-blush-logo")).toBe(true);
    expect(entete.visible("anneau")?.querySelector("[data-glow-ring]")).toBeTruthy();
    expect(entete.visible("avatar")?.textContent).toBe("M");
    unmount();
    expect(entete.visible("logo")).toBeNull();
    expect(entete.visible("anneau")).toBeNull();
    expect(entete.visible("avatar")).toBeNull();
  });
});

describe("le logo du fil : un dessin par conv, repris par ses copies", () => {
  it("chaque copie reprend le dessin de sa conv, et deux convs de la même page ont chacune le leur", () => {
    const conv = () => createElement(AvecLogoDuFil, null, createElement(LogoDuFil), createElement(LogoDuFil));
    const { container } = render(createElement("div", null, createElement("section", null, conv()), createElement("section", null, conv())));
    const [a, b] = auMoins([...container.querySelectorAll("section")], 2);
    const dessinDe = (s: Element) => s.querySelector("defs g")!.id;
    expect(dessinDe(a)).not.toBe(dessinDe(b));
    for (const s of [a, b]) {
      const copies = [...s.querySelectorAll("use")].map((u) => u.getAttribute("href"));
      expect(copies).toEqual([`#${dessinDe(s)}`, `#${dessinDe(s)}`]);
      /* Le dessin, en dernier : la première ligne de la conv reste la première */
      expect(s.lastElementChild?.querySelector("defs")).toBeTruthy();
    }
  });

  it("hors d’une conv qui a son dessin, une copie ne pointe vers rien", () => {
    const { container } = render(createElement(LogoDuFil));
    expect(container.querySelector("use")).toBeNull();
  });
});

describe("9 · l’écran qui recule derrière la feuille du contact", () => {
  /** L’accueil, dans son cadre, tel que sa ref le donne. */
  function accueil() {
    const cadre = pose(document.createElement("div"));
    const el = document.createElement("div");
    cadre.append(el);
    Object.defineProperty(el, "offsetTop", { configurable: true, value: 0 });
    Object.defineProperty(el, "offsetHeight", { configurable: true, value: 3000 });
    return el;
  }

  it("mobile : il rétrécit derrière la feuille, arrondi, sur fond noir, puis revient ; « reset » remet tout en place", () => {
    page({ hauteur: 3000, y: 1200, vue: 800 });
    const el = accueil();
    recede(el, "in", { duration: 380, easing: "ease" });
    expect(el.style.clipPath).toBe("inset(1200px 0 1000px 0 round 24px)");
    expect(el.style.transformOrigin).toBe("50% 1200px");
    expect(document.body.style.background).toContain("#000");
    expect(el.parentElement?.style.background).toContain("#000");
    expect(animees).toHaveLength(1);
    expect(animees[0]).toMatchObject({ el, images: [{ transform: "none" }, { transform: "scale(0.94)" }], temps: { duration: 380, easing: "ease", fill: "forwards" } });

    recede(el, "out");
    expect(animees[1]).toMatchObject({ el, images: [{ transform: "scale(0.94)" }, { transform: "none" }], temps: { duration: 300, fill: "none" } });

    recede(el, "reset");
    expect(el.style.clipPath).toBe("");
    expect(el.style.background).toBe("");
    expect(el.parentElement?.style.background).toBe("");
    expect(document.body.style.background).toBe("");
  });

  it("l’accueil déjà parti (sa ref vide) : seul le fond noir de la page s’en va", () => {
    document.body.style.background = "#000";
    recede(null, "in");
    expect(document.body.style.background).toBe("");
    expect(animees).toHaveLength(0);
  });

  it("desktop : rien ne recule (la feuille s’ouvre au centre)", () => {
    desktop = true;
    page({ hauteur: 3000, y: 0, vue: 800 });
    const el = accueil();
    recede(el, "in");
    expect(animees).toHaveLength(0);
    expect(el.style.clipPath).toBe("");
    expect(document.body.style.background).toBe("");
  });

  it("shown cache ou remontre sans changer la mise en page", () => {
    const el = span();
    shown(el, false);
    expect(el.style.visibility).toBe("hidden");
    shown(el, true);
    expect(el.style.visibility).toBe("");
  });
});

describe("11 · la fête d’un niveau", () => {
  it("BLUSH saute, l’anneau s’allume, l’avatar rebondit, le badge se retourne, et des éclats partent puis s’en vont", () => {
    const entete = creerRegistreEntete();
    const logo = pose(span());
    const anneau = pose(span(), { boite: { left: 300, top: 20, width: 48, height: 48 } });
    const halo = span();
    halo.setAttribute("data-glow-ring", "");
    const badge = span();
    badge.setAttribute("data-badge", "");
    const avatar = span();
    voir(avatar, true);
    anneau.append(halo, avatar, badge);
    entete.inscrire.logo(logo);
    entete.inscrire.anneau(anneau);
    entete.inscrire.avatar(avatar);
    celebrate(entete);
    const de = (el: Element) => animees.filter((a) => a.el === el);
    expect(de(logo)[0]!.images).toEqual([{ translate: "0 0" }, { translate: "0 -9px", offset: 0.35 }, { translate: "0 0" }]);
    expect(de(halo)).toHaveLength(1);
    expect(de(avatar)[0]!.images).toEqual([{ scale: 1 }, { scale: 1.16, offset: 0.35 }, { scale: 1 }]);
    expect(de(badge)).toHaveLength(1);
    const eclats = [...document.querySelectorAll<HTMLElement>(".level-spark")];
    expect(eclats).toHaveLength(14);
    /* Ils partent du centre de l’anneau */
    for (const e of eclats) expect(parseFloat(e.style.left) + parseFloat(e.style.width) / 2).toBeCloseTo(324);
    for (const e of eclats) de(e)[0]!.animation.onfinish?.();
    expect(document.querySelectorAll(".level-spark")).toHaveLength(0);
  });

  it("rien d’inscrit (l’accueil parti) : rien ne bouge", () => {
    celebrate(creerRegistreEntete());
    expect(animees).toHaveLength(0);
    expect(document.querySelectorAll(".level-spark")).toHaveLength(0);
  });
});

describe("3 · 4 · 5 · les vols jusqu’à la conv", () => {
  const LOOK = { background: "#FFFFFF", radius: 999, color: "#1A66DB", size: 14, weight: 800, pad: 14 };

  /** La conv avec une bulle (`data-bubble`) dans sa ligne, et l’avatar de BLUSH de son groupe. */
  function conv(hauteur: number) {
    const box = pose(document.createElement("div"));
    box.innerHTML = `<div data-group=""><div><span data-avatar=""><svg></svg></span><div data-bubble="b1"></div></div></div>`;
    const bulle = box.querySelector<HTMLElement>("[data-bubble]")!;
    bulle.getBoundingClientRect = () => ({ left: 10, top: 500, width: 120, height: hauteur }) as DOMRect;
    return { box, bulle, avatar: box.querySelector<HTMLElement>("[data-avatar]")! };
  }

  it("ton texte vole jusqu’à sa bulle, cachée jusqu’à l’atterrissage", async () => {
    const { box, bulle } = conv(42);
    launch(box, { kind: "text", bubble: "b1", text: "salut", from: { left: 0, top: 700, width: 80, height: 42 }, start: LOOK });
    expect(bulle.parentElement?.hasAttribute("data-flown")).toBe(true);
    expect(bulle.style.visibility).toBe("hidden");
    expect(flyText).toHaveBeenCalledWith(
      "salut",
      { left: 0, top: 700, width: 80, height: 42 },
      expect.objectContaining({ top: 500, height: 42 }),
      LOOK,
      expect.anything(),
      expect.anything(),
    );
    await act(async () => {});
    expect(bulle.style.visibility).toBe("");
  });

  it("sur plusieurs lignes, la bulle monte simplement (rien ne vole)", () => {
    const { box, bulle } = conv(80);
    launch(box, { kind: "text", bubble: "b1", text: "un long message", from: { left: 0, top: 700, width: 80, height: 42 }, start: LOOK });
    expect(flyText).not.toHaveBeenCalled();
    expect(bulle.parentElement?.hasAttribute("data-flown")).toBe(false);
    expect(bulle.style.visibility).toBe("");
  });

  it("la bulle qui écrit vole jusqu’à l’avatar de la réponse", async () => {
    const { box, avatar } = conv(42);
    launch(box, { kind: "logo", bubble: "b1", from: { left: 0, top: 0, width: 30, height: 30 } });
    expect(avatar.style.visibility).toBe("hidden");
    expect(vi.mocked(flyBox).mock.calls[0]![0].tagName.toLowerCase()).toBe("svg");
    await act(async () => {});
    expect(avatar.style.visibility).toBe("");
  });

  it("la bulle n’est pas (encore) dans la conv : rien ne vole", () => {
    const { box } = conv(42);
    launch(box, { kind: "logo", bubble: "autre", from: { left: 0, top: 0, width: 30, height: 30 } });
    expect(flyBox).not.toHaveBeenCalled();
  });
});

describe("8 · l’en-tête qui se replie", () => {
  it("--c suit le défilement (0 en bas de la conv, 1 replié), à l’image suivante, et s’en va avec l’accueil", () => {
    page({ hauteur: 3000, y: 2200, vue: 800 });
    const tete = pose(document.createElement("header"));
    const ref = { current: tete };
    const { unmount } = renderHook(() => useHeaderCollapse(ref));
    expect(tete.style.getPropertyValue("--c")).toBe("0.000");
    page({ hauteur: 3000, y: 2000, vue: 800 });
    window.dispatchEvent(new Event("scroll"));
    /* Une mesure par image, pas par événement */
    expect(tete.style.getPropertyValue("--c")).toBe("0.000");
    act(() => void vi.advanceTimersByTime(20));
    expect(tete.style.getPropertyValue("--c")).toBe("1.000");
    page({ hauteur: 3000, y: 2070, vue: 800 });
    window.dispatchEvent(new Event("scroll"));
    act(() => void vi.advanceTimersByTime(20));
    expect(tete.style.getPropertyValue("--c")).toBe("0.500");
    unmount();
    expect(tete.style.getPropertyValue("--c")).toBe("");
  });

  it("moins d’animations : l’en-tête reste grand", () => {
    moinsDeMouvement = true;
    page({ hauteur: 3000, y: 0, vue: 800 });
    const tete = pose(document.createElement("header"));
    renderHook(() => useHeaderCollapse({ current: tete }));
    expect(tete.style.getPropertyValue("--c")).toBe("");
  });
});

describe("6 · 7 · les gestes de la conv", () => {
  /** La conv : son fil (`data-thread`) et une réponse de BLUSH qui se creuse (`data-quote`), avec sa flèche. */
  function fil() {
    const racine = pose(document.createElement("div"));
    racine.innerHTML = `<div data-thread=""><div><span data-dig-icon=""></span><div data-quote="Propose-lui un verre"><b>bulle</b></div></div></div>`;
    racine.setPointerCapture = () => {};
    return {
      racine,
      fil: racine.querySelector<HTMLElement>("[data-thread]")!,
      bulle: racine.querySelector<HTMLElement>("[data-quote]")!,
      fleche: racine.querySelector<HTMLElement>("[data-dig-icon]")!,
    };
  }
  const doigt = (type: string, x: number, y: number, cible: Element, pointerType = "touch") =>
    cible.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType, clientX: x, clientY: y, bubbles: true }));

  it("7 · une réponse glissée vers la droite, passé le cran : elle est creusée (un seul cran sonne)", () => {
    const { racine, bulle, fleche } = fil();
    const creuser = vi.fn();
    renderHook(() => useThreadGestures({ current: racine }, creuser));
    const b = bulle.firstElementChild!;
    doigt("pointerdown", 100, 300, b);
    doigt("pointermove", 115, 300, b);
    doigt("pointermove", 180, 302, b);
    expect(bulle.style.transform).toMatch(/^translateX\(/);
    expect(fleche.hasAttribute("data-armed")).toBe(true);
    doigt("pointermove", 185, 302, b);
    expect(espions.play).toHaveBeenCalledTimes(1);
    expect(espions.play).toHaveBeenCalledWith("cran");
    doigt("pointerup", 185, 302, b);
    expect(creuser).toHaveBeenCalledWith("Propose-lui un verre");
    /* Tout revient en place */
    expect(bulle.style.transform).toBe("");
    expect(fleche.hasAttribute("data-armed")).toBe(false);
    /* Relâcher le doigt après un glissé ne « clique » pas ce qui est dessous */
    const clic = new MouseEvent("click", { bubbles: true, cancelable: true });
    b.dispatchEvent(clic);
    expect(clic.defaultPrevented).toBe(true);
  });

  it("7 · relâchée avant le cran, ou geste annulé : rien n’est creusé", () => {
    const { racine, bulle } = fil();
    const creuser = vi.fn();
    renderHook(() => useThreadGestures({ current: racine }, creuser));
    doigt("pointerdown", 100, 300, bulle);
    doigt("pointermove", 140, 300, bulle);
    doigt("pointerup", 140, 300, bulle);
    doigt("pointerdown", 100, 300, bulle);
    doigt("pointermove", 200, 300, bulle);
    doigt("pointercancel", 200, 300, bulle);
    expect(creuser).not.toHaveBeenCalled();
  });

  it("6 · la conv glissée vers la gauche montre l’heure, puis revient en place", () => {
    const { racine, fil: f, bulle } = fil();
    renderHook(() => useThreadGestures({ current: racine }, vi.fn()));
    doigt("pointerdown", 200, 300, bulle);
    doigt("pointermove", 185, 300, bulle);
    doigt("pointermove", 120, 300, bulle);
    expect(f.style.transform).toMatch(/^translateX\(-/);
    doigt("pointerup", 120, 300, bulle);
    expect(f.style.transform).toBe("");
    expect(animees.some((a) => a.el === f)).toBe(true);
  });

  it("à la souris, ou un geste vertical : rien ne glisse (la sélection, le défilement)", () => {
    const { racine, fil: f, bulle } = fil();
    const creuser = vi.fn();
    renderHook(() => useThreadGestures({ current: racine }, creuser));
    doigt("pointerdown", 100, 300, bulle, "mouse");
    doigt("pointermove", 200, 300, bulle, "mouse");
    doigt("pointerup", 200, 300, bulle, "mouse");
    doigt("pointerdown", 100, 300, bulle);
    doigt("pointermove", 102, 360, bulle);
    doigt("pointermove", 200, 360, bulle);
    doigt("pointerup", 200, 360, bulle);
    expect(bulle.style.transform).toBe("");
    expect(f.style.transform).toBe("");
    expect(creuser).not.toHaveBeenCalled();
  });

  it("le dernier « creuser » donné est celui qui sert (l’accueil se refait sans réabonner la conv)", () => {
    const { racine, bulle } = fil();
    const premier = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ f }) => useThreadGestures({ current: racine } as RefObject<HTMLElement>, f), { initialProps: { f: premier } });
    rerender({ f: second });
    doigt("pointerdown", 100, 300, bulle);
    doigt("pointermove", 115, 300, bulle);
    doigt("pointermove", 200, 300, bulle);
    doigt("pointerup", 200, 300, bulle);
    expect(premier).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("le défilement de la conv", () => {
  /* La page et la fenêtre de la conv ne défilent pas dans le DOM simulé : on note où on les envoie */
  let vaA: ReturnType<typeof vi.fn>;
  let decale: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vaA = vi.fn();
    decale = vi.fn();
    vi.spyOn(window, "scrollTo").mockImplementation(vaA as never);
    vi.spyOn(window, "scrollBy").mockImplementation(decale as never);
  });

  /** Un message de la conv, réduit à ce que le défilement en lit (son identifiant). */
  const msg = (id: number) => ({ type: "mot", id, from: "blush", notice: "" }) as unknown as Msg;
  const vide = () => ({ current: null }) as RefObject<HTMLDivElement | null>;

  it("mesurer (par l’écran que l’accueil donne au chargement) : la hauteur d’avant, et l’ancrage du défilement coupé jusqu’au rendu qui pose les messages", () => {
    page({ hauteur: 4200, y: 0, vue: 800 });
    const { result } = renderHook(() => useDefilement(vide()));
    expect(result.current.ecran.mesurer(7)).toEqual({ desk: false, h: 4200, marque: 7 });
    expect(document.documentElement.style.overflowAnchor).toBe("none");
  });

  it("auRepos (par l’écran) : tout près du haut, tout de suite ; sinon 120 ms sans défilement", async () => {
    const { result } = renderHook(() => useDefilement(vide()));
    page({ hauteur: 4200, y: 300, vue: 800 });
    let pose = false;
    void result.current.ecran.auRepos().then(() => (pose = true));
    await act(async () => {});
    expect(pose).toBe(true);

    page({ hauteur: 4200, y: 2000, vue: 800 });
    pose = false;
    void result.current.ecran.auRepos().then(() => (pose = true));
    await act(async () => void vi.advanceTimersByTime(100));
    /* L’élan continue : l’attente repart */
    window.dispatchEvent(new Event("scroll"));
    await act(async () => void vi.advanceTimersByTime(100));
    expect(pose).toBe(false);
    await act(async () => void vi.advanceTimersByTime(30));
    expect(pose).toBe(true);
  });

  it("à l’ouverture, la conv se pose en bas ; revenu par l’historique alors qu’on lisait plus haut, elle revient à cette place", () => {
    const box = pose(document.createElement("div"));
    box.innerHTML = `<div data-thread=""></div>`;
    const threadRef = { current: box } as RefObject<HTMLDivElement | null>;
    page({ hauteur: 4200, y: 1000, vue: 800 });
    const premiere = renderHook(() => useDefilement(threadRef));
    expect(vaA).toHaveBeenCalledExactlyOnceWith({ top: 3400 });
    /* On lisait plus haut (la page ne défile pas ici : elle est restée à 1000) quand l’accueil est parti */
    premiere.unmount();
    vaA.mockClear();
    window.dispatchEvent(new PopStateEvent("popstate"));
    const retour = renderHook(() => useDefilement(threadRef));
    expect(vaA).toHaveBeenCalledExactlyOnceWith({ top: 1000 });
    retour.unmount();
    /* Une ouverture suivante, sans retour par l’historique : en bas */
    vaA.mockClear();
    renderHook(() => useDefilement(threadRef));
    expect(vaA).toHaveBeenCalledExactlyOnceWith({ top: 3400 });
  });

  /** La conv (une réponse de BLUSH et son avatar, la ligne qui glisse) et sa barre de saisie, suivies comme dans l’accueil. */
  function suivre(premiers: Msg[]) {
    const box = pose(document.createElement("div"));
    box.innerHTML = `<div data-row="r1" data-group=""><span data-avatar=""><svg></svg></span><div data-bubble="b1"></div></div>`;
    const form = pose(document.createElement("form"));
    const threadRef = { current: box } as RefObject<HTMLDivElement | null>;
    const composerRef = { current: form } as RefObject<HTMLFormElement | null>;
    const rendu = renderHook(
      ({ msgs }) => {
        const d = useDefilement(threadRef);
        useConvSuitLeBas(msgs, threadRef, composerRef, d);
        return d;
      },
      { initialProps: { msgs: premiers } },
    );
    return { ...rendu, box, form, avatar: box.querySelector<HTMLElement>("[data-avatar]")!, ligne: box.querySelector<HTMLElement>("[data-row]")! };
  }

  it("des anciens posés devant, mais un autre rendu passe avant le leur : rien ne défile, la hauteur de référence est celle de ce rendu", () => {
    page({ hauteur: 3000, y: 200, vue: 800 });
    const debut = [msg(10)];
    const { result, rerender } = suivre(debut);
    const pose = vi.fn();
    result.current.devantRef.current = { desk: false, h: 3000, marque: 3, pose };
    result.current.beforeRef.current = new Map([["r1", 100]]);
    result.current.flightRef.current = { kind: "logo", bubble: "b1", from: { left: 0, top: 0, width: 30, height: 30 } };
    page({ hauteur: 3300, y: 200, vue: 800 });
    rerender({ msgs: [...debut, msg(11)] });
    expect(vaA).not.toHaveBeenCalled();
    expect(decale).not.toHaveBeenCalled();
    expect(pose).not.toHaveBeenCalled();
    expect(flyBox).not.toHaveBeenCalled();
    expect(result.current.devantRef.current?.h).toBe(3300);
    expect(result.current.beforeRef.current).toBeNull();
    expect(result.current.flightRef.current).toBeNull();
  });

  it("le rendu qui pose les anciens : la conv reste là où on la lisait (un décalage), l’ancrage du défilement revient, le chargement est prévenu", () => {
    page({ hauteur: 3000, y: 200, vue: 800 });
    const debut = [msg(10)];
    const { result, rerender } = suivre(debut);
    const pose = vi.fn();
    result.current.ecran.mesurer(3);
    result.current.devantRef.current = { desk: false, h: 3000, marque: 3, pose };
    page({ hauteur: 3800, y: 200, vue: 800 });
    rerender({ msgs: [msg(3), ...debut] });
    expect(decale).toHaveBeenCalledExactlyOnceWith(0, 800);
    expect(vaA).not.toHaveBeenCalled();
    expect(document.documentElement.style.overflowAnchor).toBe("");
    expect(pose).toHaveBeenCalledTimes(1);
    expect(result.current.devantRef.current).toBeNull();
  });

  it("un nouveau message : la conv saute en bas, la ligne glisse depuis sa place d’avant, et la bulle en attente vole", () => {
    page({ hauteur: 3000, y: 2200, vue: 800 });
    const debut = [msg(10)];
    const { result, rerender, avatar, ligne } = suivre(debut);
    vaA.mockClear();
    ligne.getBoundingClientRect = () => ({ left: 0, top: 300, width: 300, height: 40 }) as DOMRect;
    result.current.beforeRef.current = new Map([["r1", 340]]);
    result.current.flightRef.current = { kind: "logo", bubble: "b1", from: { left: 0, top: 0, width: 30, height: 30 } };
    page({ hauteur: 3100, y: 2200, vue: 800 });
    rerender({ msgs: [...debut, msg(11)] });
    expect(vaA).toHaveBeenCalledExactlyOnceWith({ top: 2300, behavior: "auto" });
    expect(avatar.style.visibility).toBe("hidden");
    expect(flyBox).toHaveBeenCalledTimes(1);
    expect(animees.find((a) => a.el === ligne)?.images[0]).toEqual({ transform: "translateY(40px)" });
    expect(result.current.beforeRef.current).toBeNull();
    expect(result.current.flightRef.current).toBeNull();
  });

  it("moins d’animations : la conv saute en bas, rien ne vole ni ne glisse", () => {
    moinsDeMouvement = true;
    page({ hauteur: 3000, y: 2200, vue: 800 });
    const debut = [msg(10)];
    const { result, rerender, avatar } = suivre(debut);
    vaA.mockClear();
    result.current.flightRef.current = { kind: "logo", bubble: "b1", from: { left: 0, top: 0, width: 30, height: 30 } };
    rerender({ msgs: [...debut, msg(11)] });
    expect(vaA).toHaveBeenCalledExactlyOnceWith({ top: 2200, behavior: "auto" });
    expect(avatar.style.visibility).toBe("");
    expect(flyBox).not.toHaveBeenCalled();
  });

  it("la barre de saisie grandit sans nouveau message : collée en bas, la conv y reste ; lue plus haut, elle ne bouge pas", () => {
    let observe: (() => void) | null = null;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(f: () => void) {
          observe = f;
        }
        observe() {}
        disconnect() {}
      },
    );
    try {
      page({ hauteur: 3000, y: 2200, vue: 800 });
      const { form } = suivre([msg(10)]);
      vaA.mockClear();
      let hauteur = 60;
      Object.defineProperty(form, "offsetHeight", { configurable: true, get: () => hauteur });
      /* Un premier relevé à 60 (montée à 0 dans le DOM simulé) : la hauteur de référence */
      act(() => observe!());
      vaA.mockClear();
      hauteur = 100;
      page({ hauteur: 3040, y: 2200, vue: 800 });
      act(() => observe!());
      expect(vaA).toHaveBeenCalledExactlyOnceWith({ top: 2240 });
      vaA.mockClear();
      hauteur = 140;
      page({ hauteur: 3080, y: 1000, vue: 800 });
      act(() => observe!());
      expect(vaA).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("en remontant, les anciens sont demandés d’avance puis posés quand le haut approche ; un rebond en bas ne compte pas", () => {
    let voit: ((e: { isIntersecting: boolean }[]) => void) | null = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(f: (e: { isIntersecting: boolean }[]) => void) {
          voit = f;
        }
        observe() {}
        disconnect() {}
      },
    );
    try {
      page({ hauteur: 4200, y: 3400, vue: 800 });
      const box = pose(document.createElement("div"));
      const haut = pose(document.createElement("div"));
      const chargerAnciens = vi.fn(() => Promise.resolve());
      const precharger = vi.fn();
      renderHook(() => useAnciensEnRemontant({ plus: true, hautRef: { current: haut }, threadRef: { current: box }, chargerAnciens, precharger }));
      /* La fin d’un rebond, tout en bas : la position diminue, mais ce n’est pas une remontée */
      page({ hauteur: 4200, y: 3399, vue: 800 });
      window.dispatchEvent(new Event("scroll"));
      expect(precharger).not.toHaveBeenCalled();
      /* Une vraie remontée : le morceau d’avant est demandé d’avance, rien n’est posé tant que le haut est loin */
      page({ hauteur: 4200, y: 2000, vue: 800 });
      window.dispatchEvent(new Event("scroll"));
      expect(precharger).toHaveBeenCalledTimes(1);
      expect(chargerAnciens).not.toHaveBeenCalled();
      /* Le haut approche en remontant : il se pose */
      act(() => voit!([{ isIntersecting: true }]));
      expect(chargerAnciens).toHaveBeenCalledTimes(1);
      /* En redescendant, rien de plus */
      page({ hauteur: 4200, y: 2100, vue: 800 });
      window.dispatchEvent(new Event("scroll"));
      expect(precharger).toHaveBeenCalledTimes(1);
      expect(chargerAnciens).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("plus rien d’ancien : rien n’écoute la remontée", () => {
    page({ hauteur: 4200, y: 3400, vue: 800 });
    const precharger = vi.fn();
    renderHook(() =>
      useAnciensEnRemontant({
        plus: false,
        hautRef: { current: pose(document.createElement("div")) },
        threadRef: { current: pose(document.createElement("div")) },
        chargerAnciens: vi.fn(),
        precharger,
      }),
    );
    page({ hauteur: 4200, y: 1000, vue: 800 });
    window.dispatchEvent(new Event("scroll"));
    expect(precharger).not.toHaveBeenCalled();
  });

  it("le script qui pose la conv en bas : dans la page du serveur seulement", () => {
    expect(renderToString(createElement(ConvEnBas))).toMatch(/^<script>\(function\(\)\{try\{if\(matchMedia\("\(min-width: 1024px\)"\)\.matches\)/);
    const { container } = render(createElement(ConvEnBas));
    expect(container.innerHTML).toBe("");
  });
});

describe("l’en-tête au clavier (Safari décale la vue visible)", () => {
  const vue = Object.assign(new EventTarget(), { offsetTop: 0 });
  beforeEach(() => {
    vue.offsetTop = 0;
    Object.defineProperty(window, "visualViewport", { configurable: true, value: vue });
  });
  afterEach(() => {
    Object.defineProperty(window, "visualViewport", { configurable: true, value: null });
  });

  function monter() {
    const tete = pose(document.createElement("header"));
    const form = pose(document.createElement("form"));
    const champ = form.appendChild(document.createElement("input"));
    const rendu = renderHook(() => useEnteteAuClavier({ current: tete }, { current: form }));
    return { tete, champ, ...rendu };
  }

  it("le champ pris, l’en-tête suit le haut de la vue ; quitté, il la suit encore au plus 0,6 s, puis reprend sa place", () => {
    const { tete, champ } = monter();
    champ.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(tete.style.transform).toBe("");
    vue.offsetTop = 300;
    vue.dispatchEvent(new Event("resize"));
    expect(tete.style.transform).toBe("translateY(300.0px)");
    champ.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(tete.style.transform).toBe("translateY(300.0px)");
    vue.offsetTop = 120;
    vue.dispatchEvent(new Event("scroll"));
    expect(tete.style.transform).toBe("translateY(120.0px)");
    act(() => void vi.advanceTimersByTime(600));
    expect(tete.style.transform).toBe("");
    /* Plus suivie : la vue qui bouge ne le déplace plus */
    vue.offsetTop = 200;
    vue.dispatchEvent(new Event("resize"));
    expect(tete.style.transform).toBe("");
  });

  it("le clavier refermé (la vue revenue en haut) avant les 0,6 s : l’en-tête reprend sa place tout de suite ; parti, rien ne reste posé", () => {
    const { tete, champ, unmount } = monter();
    champ.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    vue.offsetTop = 300;
    vue.dispatchEvent(new Event("resize"));
    champ.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    vue.offsetTop = 0;
    vue.dispatchEvent(new Event("resize"));
    expect(tete.style.transform).toBe("");
    champ.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    vue.offsetTop = 250;
    vue.dispatchEvent(new Event("resize"));
    expect(tete.style.transform).toBe("translateY(250.0px)");
    unmount();
    expect(tete.style.transform).toBe("");
  });
});

describe("1 · l’arrivée du jour", () => {
  it("se joue une fois depuis l’ouverture de l’appli ; le premier geste pose d’un coup ce qui reste, sauf ce qui boucle", async () => {
    vi.resetModules();
    const { useArrivee } = await import("@/app/app/accueil/mouvement/arrivee");
    const accueil = pose(document.createElement("div"));
    accueil.className = "home-arrive";
    accueil.innerHTML = `<span data-a="logo"></span><span data-a="pill"></span><span></span>`;
    const finie = { effect: { getComputedTiming: () => ({ endTime: 900 }) }, finish: vi.fn() };
    const boucle = { effect: { getComputedTiming: () => ({ endTime: Infinity }) }, finish: vi.fn() };
    const horsArrivee = { effect: { getComputedTiming: () => ({ endTime: 300 }) }, finish: vi.fn() };
    const [logo, pilule, autre] = auMoins([...accueil.children], 3);
    logo.getAnimations = () => [finie, boucle] as unknown as Animation[];
    pilule.getAnimations = () => [finie] as unknown as Animation[];
    autre.getAnimations = () => [horsArrivee] as unknown as Animation[];
    const ref = createRef<HTMLDivElement>() as { current: HTMLDivElement | null };
    ref.current = accueil;
    const { result, unmount } = renderHook(() => useArrivee(true, ref));
    expect(result.current).toBe(true);
    expect(espions.markArrivalPlayed).toHaveBeenCalledTimes(1);
    expect(espions.play).toHaveBeenCalledWith("signature", 0.85, 0.11);
    act(() => void window.dispatchEvent(new Event("pointerdown")));
    expect(result.current).toBe(false);
    expect(finie.finish).toHaveBeenCalledTimes(1);
    expect(boucle.finish).not.toHaveBeenCalled();
    expect(horsArrivee.finish).not.toHaveBeenCalled();
    unmount();
    /* Revenu par l’historique avec le `arrive` d’avant : elle ne se rejoue pas */
    const again = renderHook(() => useArrivee(true, ref));
    expect(again.result.current).toBe(false);
  });

  it("un geste juste après la fin de l’arrivée (l’accueil n’a plus .home-arrive, ses écouteurs pas encore retirés) ne finit rien", async () => {
    vi.resetModules();
    const { useArrivee } = await import("@/app/app/accueil/mouvement/arrivee");
    const accueil = pose(document.createElement("div"));
    accueil.innerHTML = `<span data-a="logo"></span>`;
    const finie = { effect: { getComputedTiming: () => ({ endTime: 900 }) }, finish: vi.fn() };
    accueil.firstElementChild!.getAnimations = () => [finie] as unknown as Animation[];
    const { result } = renderHook(() => useArrivee(true, { current: accueil }));
    expect(result.current).toBe(true);
    act(() => void window.dispatchEvent(new Event("keydown")));
    expect(finie.finish).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it("sans geste, elle finit seule après 3,7 s ; sans `arrive`, rien ne se joue", async () => {
    vi.resetModules();
    const { useArrivee } = await import("@/app/app/accueil/mouvement/arrivee");
    const ref = { current: null };
    const sans = renderHook(() => useArrivee(false, ref));
    expect(sans.result.current).toBe(false);
    const { result } = renderHook(() => useArrivee(true, ref));
    expect(result.current).toBe(true);
    act(() => void vi.advanceTimersByTime(3699));
    expect(result.current).toBe(true);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });
});
