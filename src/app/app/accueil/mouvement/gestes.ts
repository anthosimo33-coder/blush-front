"use client";

import { useEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion, spring } from "@/lib/motion";
import { play } from "@/lib/sound";

/** Passé sa butée, le glissé résiste : il n’avance plus qu’au cinquième. */
const rubber = (d: number, max: number) => (d <= max ? d : max + (d - max) * 0.2);

/**
 * 6 · Glisse la conv vers la gauche : l’heure de chaque bulle apparaît, puis tout revient en place (comme dans Messages).
 * 7 · Glisse une réponse de BLUSH vers la droite : passé le cran, elle se cale au-dessus du champ.
 * Au doigt seulement : à la souris, on garde la sélection du texte. Un geste vertical reste un défilement normal.
 */
export function useThreadGestures(ref: RefObject<HTMLElement | null>, onDig: (quote: string) => void) {
  const dig = useRef(onDig);
  useEffect(() => {
    dig.current = onDig;
  });
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const ARMED = 56;
    type Drag = { id: number; x: number; y: number; mode: "?" | "time" | "dig" | "off"; el?: HTMLElement; icon?: HTMLElement | null; v: number; armed: boolean };
    let g: Drag | null = null;
    let swiped = 0;
    const settle = (el: HTMLElement, v: number) => {
      el.style.transform = "";
      if (v && !prefersReducedMotion()) el.animate([{ transform: `translateX(${v}px)` }, { transform: "translateX(0)" }], spring("pop"));
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || g) return;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: "?", v: 0, armed: false };
    };
    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id || g.mode === "off") return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (g.mode === "?") {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          g.mode = "off";
          return;
        }
        if (Math.abs(dx) < 10) return;
        const bubble = dx > 0 ? (e.target as Element | null)?.closest<HTMLElement>("[data-quote]") : null;
        if (dx > 0 && !bubble) {
          g.mode = "off";
          return;
        }
        g.mode = dx < 0 ? "time" : "dig";
        g.el = (dx < 0 ? root.querySelector<HTMLElement>("[data-thread]") : bubble) ?? undefined;
        g.icon = bubble?.parentElement?.querySelector<HTMLElement>("[data-dig-icon]");
        g.x += Math.sign(dx) * 10;
        try {
          root.setPointerCapture(e.pointerId);
        } catch {
          /* Pas de capture : le geste suit quand même tant que le doigt reste sur la conv */
        }
      }
      const d = e.clientX - g.x;
      if (!g.el) return;
      if (g.mode === "time") {
        g.v = -rubber(Math.max(0, -d), 64);
        g.el.style.transform = `translateX(${g.v}px)`;
        return;
      }
      g.v = rubber(Math.max(0, d), 76);
      g.el.style.transform = `translateX(${g.v}px)`;
      const p = Math.min(1, g.v / ARMED);
      if (g.icon) {
        g.icon.style.opacity = String(p);
        g.icon.style.transform = `translateY(-50%) scale(${0.4 + 0.6 * p})`;
      }
      const armed = g.v >= ARMED;
      if (armed !== g.armed) {
        g.armed = armed;
        g.icon?.toggleAttribute("data-armed", armed);
        if (armed) {
          g.icon?.animate([{ scale: 1 }, { scale: 1.3 }, { scale: 1 }], { duration: 260 });
          play("cran");
        }
      }
    };
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!g || e.pointerId !== g.id) return;
      const done = g;
      g = null;
      if (done.mode !== "time" && done.mode !== "dig") return;
      swiped = performance.now();
      if (done.el) settle(done.el, done.v);
      if (done.icon) {
        done.icon.style.opacity = "";
        done.icon.style.transform = "";
        done.icon.removeAttribute("data-armed");
      }
      const quote = done.el?.dataset.quote;
      if (done.mode === "dig" && done.armed && !cancelled && quote) dig.current(quote);
    };
    const up = (e: PointerEvent) => end(e, false);
    const cancel = (e: PointerEvent) => end(e, true);
    /* Après un glissé, relâcher le doigt ne « clique » pas ce qui est dessous */
    const click = (e: MouseEvent) => {
      if (performance.now() - swiped < 400) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", cancel);
    root.addEventListener("click", click, true);
    return () => {
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up);
      root.removeEventListener("pointercancel", cancel);
      root.removeEventListener("click", click, true);
    };
  }, [ref]);
}
