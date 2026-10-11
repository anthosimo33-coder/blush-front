/*
 * Le mouvement de l’accueil : les ressorts (définis dans globals.css), un élément qui vole d’un endroit à un autre,
 * et le FLIP (ce qui bouge à cause d’un ajout glisse jusqu’à sa nouvelle place au lieu de sauter).
 * Tout passe par Web Animations et n’anime que transform et opacity : le compositeur les joue seul,
 * fluides même quand le téléphone est occupé (rendu de la réponse, chargement). « Réduire les animations » coupe tout.
 */
import type { CSSProperties } from "react";

export type Spring = { easing: string; duration: number };
export type Box = { left: number; top: number; width: number; height: number };

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** L’ordinateur : la même borne que `lg:` (1024 px). Les feuilles s’y ouvrent au centre, l’accueil y a sa fenêtre de conv. */
export const DESKTOP = "(min-width: 1024px)";

/** Sur ordinateur maintenant (DESKTOP) ? Faux hors du navigateur. */
export const estDesktop = () => typeof window !== "undefined" && window.matchMedia(DESKTOP).matches;

/**
 * Le délai d’une entrée de globals.css (`data-rise`, `data-popin`…), en secondes : la variable `--d` de son `style`.
 * La seule façon de l’écrire, seule (`style={delai(0.2)}`) ou avec d’autres (`{ ...delai(i * 0.05), "--i": i }`).
 */
export const delai = (s: number) => ({ "--d": `${s}s` }) satisfies CSSProperties;

/** Un ressort de globals.css : « soft » se pose sans rebond, « pop » dépasse un peu, « bounce » rebondit franchement. */
export function spring(name: "soft" | "pop" | "bounce"): Spring {
  const css = getComputedStyle(document.documentElement);
  return {
    easing: css.getPropertyValue(`--spring-${name}`).trim() || "cubic-bezier(0.2, 0.8, 0.2, 1)",
    duration: toMs(css.getPropertyValue(`--spring-${name}-d`)) || 500,
  };
}

/** Une durée CSS en millisecondes (la feuille minifiée écrit « 600ms » en « .6s »). */
function toMs(value: string) {
  const v = value.trim();
  const n = parseFloat(v);
  return v.endsWith("ms") ? n : v.endsWith("s") ? n * 1000 : n;
}

const px = (n: number) => `${Math.round(n * 10) / 10}px`;

/** Le déplacement d’un rectangle vers un autre, en transform (l’origine en haut à gauche). */
function boxTransform(b: Box, base: Box) {
  return `translate(${px(b.left - base.left)}, ${px(b.top - base.top)}) scale(${b.width / base.width}, ${b.height / base.height})`;
}

/** Retire l’élément quand le ressort ne bouge presque plus : la vraie bulle reprend la main. */
function landed(el: Element, sp: Spring, settle: number) {
  return new Promise<void>((resolve) =>
    window.setTimeout(
      () => {
        el.remove();
        resolve();
      },
      Math.round(sp.duration * settle),
    ),
  );
}

/**
 * Fait voler `el` (un double, posé en position fixe dans `host`) du rectangle `from` au rectangle `to`, rien qu’en transform.
 * Le double garde la taille du plus grand des deux rectangles : il rétrécit sans flou au lieu de grossir pixelisé.
 */
export function flyBox(el: HTMLElement | SVGElement, from: Box, to: Box, opts: { spring: Spring; host?: Element; settle?: number }) {
  const { spring: sp, host = document.body, settle = 0.82 } = opts;
  const base = from.width * from.height >= to.width * to.height ? from : to;
  el.classList.add("flight");
  Object.assign(el.style, { left: px(base.left), top: px(base.top), width: px(base.width), height: px(base.height), transformOrigin: "0 0" });
  host.append(el);
  el.animate([{ transform: boxTransform(from, base) }, { transform: boxTransform(to, base) }], { duration: sp.duration, easing: sp.easing, fill: "both" });
  return landed(el, sp, settle);
}

/** Un look de bulle de texte : son fond, son texte, et où commence le texte (marge gauche). */
export type BubbleLook = { background: string; ring?: string; radius: number; color: string; size: number; weight: number; pad: number };

/**
 * Une bulle de texte qui vole d’un look à un autre (la pastille ou le champ → ta bulle bleue).
 * Deux fonds et deux textes superposés : chacun ne fait que glisser, changer d’échelle et de transparence,
 * donc tout se joue sur le compositeur (animer la taille, la couleur ou la police repeindrait chaque image).
 */
export function flyText(text: string, from: Box, to: Box, a: BubbleLook, b: BubbleLook, opts: { spring: Spring; settle?: number }) {
  const { spring: sp, settle = 0.82 } = opts;
  const frame = { duration: sp.duration, easing: sp.easing, fill: "both" as const };
  const fade = { duration: Math.round(sp.duration * 0.45), easing: "ease-out", fill: "both" as const };
  const root = document.createElement("span");
  root.className = "flight";
  Object.assign(root.style, { left: "0px", top: "0px", width: "0px", height: "0px" });
  const layer = (look: BubbleLook, on: boolean) => {
    const bg = document.createElement("span");
    Object.assign(bg.style, {
      position: "absolute",
      left: px(to.left),
      top: px(to.top),
      width: px(to.width),
      height: px(to.height),
      borderRadius: px(look.radius),
      background: look.background,
      boxShadow: look.ring ?? "none",
      transformOrigin: "0 0",
    });
    root.append(bg);
    bg.animate([{ transform: boxTransform(from, to) }, { transform: "none" }], frame);
    bg.animate([{ opacity: on ? 0 : 1 }, { opacity: on ? 1 : 0 }], fade);
    /* Le texte, posé à sa place d’arrivée dans la taille d’arrivée : au départ, il est à la place et à la taille du départ */
    const t = document.createElement("span");
    t.textContent = text;
    Object.assign(t.style, {
      position: "absolute",
      left: px(to.left + b.pad),
      top: px(to.top + to.height / 2),
      translate: "0 -50%",
      whiteSpace: "nowrap",
      fontFamily: "var(--font-nunito), system-ui, sans-serif",
      fontSize: px(b.size),
      lineHeight: "1.4",
      fontWeight: String(look.weight),
      color: look.color,
      transformOrigin: "0 50%",
    });
    root.append(t);
    const scale = a.size / b.size;
    const dx = from.left + a.pad - (to.left + b.pad);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    t.animate([{ transform: `translate(${px(dx)}, ${px(dy)}) scale(${scale})` }, { transform: "none" }], frame);
    t.animate([{ opacity: on ? 0 : 1 }, { opacity: on ? 1 : 0 }], fade);
  };
  layer(a, false);
  layer(b, true);
  document.body.append(root);
  return landed(root, sp, settle);
}

/** Où chaque élément est à l’écran, avant un changement. */
export function snapshotTops(els: Iterable<HTMLElement>, key: (el: HTMLElement) => string | undefined) {
  const tops = new Map<string, number>();
  for (const el of els) {
    const k = key(el);
    if (k) tops.set(k, el.getBoundingClientRect().top);
  }
  return tops;
}

/**
 * FLIP : chaque élément déjà là repart de son ancienne place et rejoint la nouvelle sur un ressort.
 * Seulement ce qui est (ou était) à l’écran : le reste de l’historique saute sans qu’on le voie.
 * Mode « replace » (le seul que le compositeur sait jouer) : ces lignes n’ont pas d’autre transform animé.
 */
export function flipFrom(before: Map<string, number>, els: Iterable<HTMLElement>, key: (el: HTMLElement) => string | undefined, sp: Spring) {
  const vh = window.innerHeight;
  const seen = (top: number, height: number) => top + height > -80 && top < vh + 80;
  for (const el of els) {
    const k = key(el);
    const top = k === undefined ? undefined : before.get(k);
    if (top === undefined) continue;
    const r = el.getBoundingClientRect();
    const dy = top - r.top;
    if (Math.abs(dy) < 0.5 || (!seen(r.top, r.height) && !seen(top, r.height))) continue;
    el.animate([{ transform: `translateY(${px(dy)})` }, { transform: "translateY(0)" }], { duration: sp.duration, easing: sp.easing });
  }
}

/**
 * Le rectangle qu’un élément aura une fois son panneau arrivé : on additionne les décalages de mise en page
 * (qui ignorent les transformations en cours) jusqu’à un ancêtre immobile.
 */
export function restingBox(el: HTMLElement, still: HTMLElement): Box {
  let left = 0;
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== still) {
    left += node.offsetLeft;
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  const r = still.getBoundingClientRect();
  return { left: r.left + left, top: r.top + top, width: el.offsetWidth, height: el.offsetHeight };
}

/** Les perles du logo et leurs ombres, dans l’ordre (nacre, nacre, opale). */
export function pearlsOf(logo: Element) {
  return {
    pearls: [...logo.querySelectorAll<HTMLElement | SVGElement>("[data-pearl]")],
    shades: [...logo.querySelectorAll<HTMLElement | SVGElement>("[data-shade]")],
  };
}

/** Une perle saute (une lettre tapée) ; `soft` : plus discret (une lettre effacée). */
export function bumpPearl(logo: Element, i: number, soft = false) {
  const { pearls, shades } = pearlsOf(logo);
  const ease = "cubic-bezier(0.3, 0.7, 0.4, 1)";
  pearls[i]?.animate([{ transform: "none" }, { transform: `translateY(${soft ? -10 : -26}%) scale(${soft ? 1.08 : 1.24})`, offset: 0.35 }, { transform: "none" }], {
    duration: 360,
    easing: ease,
  });
  shades[i]?.animate(
    [
      { transform: "none", opacity: 1 },
      { transform: "scale(0.6)", opacity: 0.4, offset: 0.35 },
      { transform: "none", opacity: 1 },
    ],
    { duration: 360, easing: ease },
  );
}

/** Un « coucou » : les trois perles sautent une fois, l’une après l’autre. */
export function wavePearls(logo: Element) {
  const { pearls, shades } = pearlsOf(logo);
  const ease = "cubic-bezier(0.45, 0, 0.55, 1)";
  pearls.forEach((p, i) =>
    p.animate([{ transform: "none" }, { transform: "translateY(-24%) scale(1.22)", offset: 0.38 }, { transform: "none" }], { duration: 720, delay: i * 110, easing: ease }),
  );
  shades.forEach((s, i) =>
    s.animate(
      [
        { transform: "none", opacity: 1 },
        { transform: "scale(0.55)", opacity: 0.35, offset: 0.38 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 720, delay: i * 110, easing: ease },
    ),
  );
}

/** La largeur d’un texte dans la police d’un champ. */
export function textWidth(text: string, field: HTMLElement) {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * 8;
  const s = getComputedStyle(field);
  ctx.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  return ctx.measureText(text).width;
}
