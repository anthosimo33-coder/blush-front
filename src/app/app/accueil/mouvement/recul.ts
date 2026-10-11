"use client";

import { estDesktop, type Spring } from "@/lib/motion";

/**
 * 9 · L’écran recule derrière la feuille du contact, comme sur iPhone (mobile seulement) : il rétrécit un peu,
 * s’arrondit, et le noir apparaît autour. `page` : l’accueil, que sa ref donne (null : déjà parti).
 * « reset » remet tout en place sans animation (fermeture, départ vers une autre page).
 */
export function recede(page: HTMLElement | null, state: "in" | "out" | "reset", timing?: Spring) {
  /* Le fond noir vit sur <body> : on l’enlève toujours, même quand l’accueil a déjà disparu
     (depuis la feuille, on part vers le rapport ou sa fiche : l’accueil est retiré avant ce nettoyage) */
  if (state === "reset" || !page || estDesktop()) {
    document.body.style.removeProperty("background");
    if (!page) return;
    page.getAnimations().forEach((a) => a.cancel());
    page.parentElement?.style.removeProperty("background");
    page.style.removeProperty("background");
    page.style.removeProperty("background-color");
    page.style.removeProperty("clip-path");
    return;
  }
  page.getAnimations().forEach((a) => a.cancel());
  const y = window.scrollY - page.offsetTop;
  const vh = window.innerHeight;
  const below = Math.max(0, page.offsetHeight - y - vh);
  /* Accroché en haut : la carte touche la barre d’état de Safari (qui garde sa couleur), le noir n’apparaît que sur les côtés.
     La découpe arrondie est posée d’un coup, seule l’échelle s’anime : le compositeur la joue seul, même sur une longue conv */
  page.style.transformOrigin = `50% ${y}px`;
  page.style.background = "var(--paper-light)";
  page.style.backgroundColor = "var(--paper)";
  page.style.clipPath = `inset(${y}px 0 ${below}px 0 round 24px)`;
  const rest: Keyframe = { transform: "none" };
  const back: Keyframe = { transform: "scale(0.94)" };
  page.animate(state === "in" ? [rest, back] : [back, rest], { duration: timing?.duration ?? 300, easing: timing?.easing, fill: state === "in" ? "forwards" : "none" });
  /* Le noir autour : sur la page et sur son cadre (qui a son propre fond pour le glissé vers la fiche) */
  if (state === "in") {
    document.body.style.background = "#000";
    page.parentElement?.style.setProperty("background", "#000");
  }
}

/** Cache ou remontre un élément sans changer la mise en page (pendant qu’un double vole à sa place). */
export function shown(el: HTMLElement | SVGElement, on: boolean) {
  el.style.visibility = on ? "" : "hidden";
}
