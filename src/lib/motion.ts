/*
 * Le mouvement de l’accueil : les ressorts (définis dans globals.css), un élément qui vole d’un endroit à un autre,
 * et le FLIP (ce qui bouge à cause d’un ajout glisse jusqu’à sa nouvelle place au lieu de sauter).
 * Tout passe par Web Animations : rien ne bloque, et « Réduire les animations » coupe tout.
 */

export type Spring = { easing: string; duration: number };
export type Box = { left: number; top: number; width: number; height: number };

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

/**
 * Fait voler `el` (posé en position fixe dans `host`) du rectangle `from` au rectangle `to`, puis le retire.
 * `start` et `end` ajoutent des propriétés animées (couleur, rayon, taille du texte…).
 * La promesse se résout un peu avant la fin du ressort, quand il ne bouge presque plus : la vraie bulle reprend la main.
 */
export function fly(el: HTMLElement | SVGElement, from: Box, to: Box, opts: { spring: Spring; host?: Element; start?: Keyframe; end?: Keyframe; settle?: number }) {
  const { spring: sp, host = document.body, start = {}, end = {}, settle = 0.82 } = opts;
  el.classList.add("flight");
  host.append(el);
  el.animate(
    [
      { left: px(from.left), top: px(from.top), width: px(from.width), height: px(from.height), ...start },
      { left: px(to.left), top: px(to.top), width: px(to.width), height: px(to.height), ...end },
    ],
    { duration: sp.duration, easing: sp.easing, fill: "both" },
  );
  return new Promise<void>((resolve) =>
    window.setTimeout(() => {
      el.remove();
      resolve();
    }, Math.round(sp.duration * settle)),
  );
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

/** FLIP : chaque élément déjà là repart de son ancienne place et rejoint la nouvelle sur un ressort. */
export function flipFrom(before: Map<string, number>, els: Iterable<HTMLElement>, key: (el: HTMLElement) => string | undefined, sp: Spring) {
  for (const el of els) {
    const k = key(el);
    const top = k === undefined ? undefined : before.get(k);
    if (top === undefined) continue;
    const dy = top - el.getBoundingClientRect().top;
    if (Math.abs(dy) < 0.5) continue;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: sp.duration, easing: sp.easing, composite: "add" });
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

/** Le premier élément visible (le même composant existe en version mobile et desktop, l’une est masquée). */
export function visible<T extends Element>(selector: string, root: ParentNode = document) {
  return [...root.querySelectorAll<T>(selector)].find((el) => el.getClientRects().length > 0) ?? null;
}

/** Les perles du logo et leurs ombres, dans l’ordre (nacre, nacre, opale). */
export function pearlsOf(logo: Element) {
  return {
    pearls: [...logo.querySelectorAll<SVGGElement>("[data-pearl]")],
    shades: [...logo.querySelectorAll<SVGEllipseElement>("[data-shade]")],
  };
}

/** Une perle saute (une lettre tapée) ; `soft` : plus discret (une lettre effacée). */
export function bumpPearl(logo: Element, i: number, soft = false) {
  const { pearls, shades } = pearlsOf(logo);
  const ease = "cubic-bezier(0.3, 0.7, 0.4, 1)";
  pearls[i]?.animate([{ transform: "none" }, { transform: `translateY(${soft ? -10 : -26}%) scale(${soft ? 1.08 : 1.24})`, offset: 0.35 }, { transform: "none" }], { duration: 360, easing: ease });
  shades[i]?.animate([{ transform: "none", opacity: 1 }, { transform: "scale(0.6)", opacity: 0.4, offset: 0.35 }, { transform: "none", opacity: 1 }], { duration: 360, easing: ease });
}

/** Un « coucou » : les trois perles sautent une fois, l’une après l’autre. */
export function wavePearls(logo: Element) {
  const { pearls, shades } = pearlsOf(logo);
  const ease = "cubic-bezier(0.45, 0, 0.55, 1)";
  pearls.forEach((p, i) => p.animate([{ transform: "none" }, { transform: "translateY(-24%) scale(1.22)", offset: 0.38 }, { transform: "none" }], { duration: 720, delay: i * 110, easing: ease }));
  shades.forEach((s, i) => s.animate([{ transform: "none", opacity: 1 }, { transform: "scale(0.55)", opacity: 0.35, offset: 0.38 }, { transform: "none", opacity: 1 }], { duration: 720, delay: i * 110, easing: ease }));
}

/** La largeur d’un texte dans la police d’un champ. */
export function textWidth(text: string, field: HTMLElement) {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * 8;
  const s = getComputedStyle(field);
  ctx.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  return ctx.measureText(text).width;
}
