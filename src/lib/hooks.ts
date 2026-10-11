"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Repere } from "@/lib/repere";
import { play } from "@/lib/sound";

const RM = "(prefers-reduced-motion: reduce)";

/** Vrai si l’appareil demande moins de mouvement. */
export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(RM);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(RM).matches,
    () => false,
  );
}

export type Device = "ios" | "android" | "other";

const appareil = (): Device => {
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /Android/i.test(ua) ? "android" : /iPhone|iPad|iPod/.test(ua) || iPadOS ? "ios" : "other";
};

/**
 * iPhone, Android ou autre (pour adapter les étapes d’export). Le serveur ne le sait pas (« autre ») : seule une page
 * chargée en entier corrige après l’hydratation. Ouvert depuis une autre page, l’écran le sait dès son premier rendu, sans
 * texte qui change sous les yeux.
 */
export function useDevice(): Device {
  return useSyncExternalStore(
    () => () => {},
    appareil,
    () => "other",
  );
}

/** Ouvre le sélecteur de fichiers natif depuis n’importe quel bouton. */
export function useFilePicker() {
  const ref = useRef<HTMLInputElement>(null);
  return { ref, open: () => ref.current?.click() };
}

/** Copie un texte dans le presse-papier (avec repli si l’API n’est pas disponible). Un clic et un toucher confirment, partout pareil. */
export async function copyText(text: string) {
  const ok = await writeClipboard(text);
  if (ok) play("copier");
  return ok;
}

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** L’élément d’un repère, et l’écran se re-rend quand il arrive ou s’en va (null côté serveur). */
const useElement = (repere: Repere) => useSyncExternalStore(repere.abonner, repere.lire, () => null);

/**
 * L’élément du repère est-il à l’écran ? (Une pastille flottante s’efface quand ce qu’elle montre est déjà visible.)
 * Faux tant que l’élément n’existe pas.
 */
export function useEnVue(repere: Repere): boolean {
  const el = useElement(repere);
  const [vu, setVu] = useState(false);
  useEffect(() => {
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => e && setVu(e.isIntersecting), { threshold: 0.15 });
    obs.observe(el);
    return () => {
      obs.disconnect();
      setVu(false);
    };
  }, [el]);
  return !!el && vu;
}

/**
 * La hauteur de l’élément du repère, en px (suivie quand elle change) ; 0 tant qu’il n’existe pas. Mesurée avant que
 * l’écran se peigne : ce qui se pose au-dessus de lui y est dès sa première image, sans sauter à la suivante.
 */
export function useHauteur(repere: Repere): number {
  const el = useElement(repere);
  const [hauteur, setHauteur] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- une mesure du DOM, avant que l’écran se peigne
    setHauteur(el.getBoundingClientRect().height);
    const obs = new ResizeObserver(([e]) => e && setHauteur(e.borderBoxSize[0]?.blockSize ?? el.offsetHeight));
    obs.observe(el);
    return () => {
      obs.disconnect();
      setHauteur(0);
    };
  }, [el]);
  return el ? hauteur : 0;
}
