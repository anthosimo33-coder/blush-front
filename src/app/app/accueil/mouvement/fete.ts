"use client";

import { wavePearls } from "@/lib/motion";
import type { RegistreEntete } from "./registre";

/** 11 · Les éclats qui partent de l’anneau de l’autre quand un niveau tombe. */
const SPARKS = ["#FF7DBA", "#3D8BFF", "#12C08A", "#FFC49B", "#E4B2FF", "#E8358A"];

/** 11 · Sophie rebondit dans son anneau, son badge se retourne, des éclats partent ; BLUSH saute de joie (ceux de l’en-tête qu’on voit). */
export function celebrate(entete: RegistreEntete) {
  const logo = entete.visible("logo");
  if (logo) {
    wavePearls(logo);
    logo.animate([{ translate: "0 0" }, { translate: "0 -9px", offset: 0.35 }, { translate: "0 0" }], { duration: 640, easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" });
  }
  const sophie = entete.visible("anneau");
  if (!sophie) return;
  sophie
    .querySelector("[data-glow-ring]")
    ?.animate([{ opacity: 0, transform: "scale(0.9)" }, { opacity: 1, transform: "scale(1.05)", offset: 0.4 }, { opacity: 0, transform: "scale(1.18)" }], { duration: 1300, easing: "ease-out" });
  entete.visible("avatar")?.animate([{ scale: 1 }, { scale: 1.16, offset: 0.35 }, { scale: 1 }], { duration: 620, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" });
  sophie
    .querySelector("[data-badge]")
    ?.animate([{ transform: "rotateY(0deg) scale(1)" }, { transform: "rotateY(180deg) scale(1.35)", offset: 0.5 }, { transform: "rotateY(360deg) scale(1)" }], { duration: 760, easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" });
  const r = sophie.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (let i = 0; i < 14; i++) {
    const p = document.createElement("span");
    const size = 4 + Math.random() * 5;
    p.className = "level-spark";
    Object.assign(p.style, { left: `${cx - size / 2}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size}px`, background: SPARKS[i % SPARKS.length] });
    document.body.append(p);
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
    const d = 34 + Math.random() * 34;
    p.animate(
      [
        { transform: "translate(0, 0) scale(0.4)", opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(1)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${Math.cos(a) * d * 1.15}px, ${Math.sin(a) * d * 1.15 + 8}px) scale(0.6)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 300, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)", fill: "forwards" },
    ).onfinish = () => p.remove();
  }
}
