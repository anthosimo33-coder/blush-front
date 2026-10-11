"use client";

import { flyBox, flyText, spring, type BubbleLook, type Box } from "@/lib/motion";

/*
 * 3 · 4 · Une bulle qui vole jusqu’à sa place : depuis la pastille touchée, ou depuis le champ.
 * 5 · La bulle qui écrit vole jusqu’à l’avatar de la réponse.
 */
export type Flight = { kind: "text"; bubble: string; text: string; from: Box; start: BubbleLook } | { kind: "logo"; bubble: string; from: Box };

export const CHIP_LOOK: BubbleLook = { background: "#FFFFFF", ring: "inset 0 0 0 1.5px rgba(26, 102, 219, 0.28)", radius: 999, color: "#1A66DB", size: 14, weight: 800, pad: 14 };
export const FIELD_LOOK: BubbleLook = { background: "rgba(26, 102, 219, 0)", radius: 20, color: "#121214", size: 16, weight: 800, pad: 16 };
const BUBBLE_LOOK: BubbleLook = { background: "#1A66DB", radius: 20, color: "#FFFFFF", size: 16, weight: 700, pad: 16 };

/** 3 · 4 · 5 · Le vol, juste après le rendu : la vraie bulle (ou l’avatar) reste cachée jusqu’à l’atterrissage. */
export function launch(box: HTMLElement, f: Flight) {
  const target = box.querySelector<HTMLElement>(`[data-bubble="${f.bubble}"]`);
  if (!target) return;
  if (f.kind === "text") {
    const row = target.parentElement;
    row?.setAttribute("data-flown", "");
    const to = target.getBoundingClientRect();
    /* Sur plusieurs lignes, la bulle monte simplement */
    if (to.height > 48) {
      row?.removeAttribute("data-flown");
      return;
    }
    target.style.visibility = "hidden";
    void flyText(f.text, f.from, to, f.start, BUBBLE_LOOK, { spring: spring("soft") }).then(() => {
      target.style.visibility = "";
    });
    return;
  }
  const avatar = target.closest("[data-group]")?.querySelector<HTMLElement>("[data-avatar]");
  const logo = avatar?.querySelector("svg");
  if (!avatar || !logo) return;
  const to = avatar.getBoundingClientRect();
  avatar.style.visibility = "hidden";
  const el = logo.cloneNode(true) as SVGSVGElement;
  void flyBox(el, f.from, to, { spring: spring("pop") }).then(() => {
    avatar.style.visibility = "";
  });
}
