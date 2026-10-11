"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

/**
 * Un élément de la page que d’autres écrans suivent, sans le chercher dans le DOM : celui qui le montre lui passe le
 * repère en `ref` (il rend de quoi l’oublier quand React l’enlève), ceux qui le suivent le lisent (useEnVue,
 * useHauteur) et sont prévenus quand il arrive ou s’en va.
 */
export type Repere = ((el: HTMLElement | null) => () => void) & {
  lire: () => HTMLElement | null;
  abonner: (f: () => void) => () => void;
};

/** Un repère (voir Repere), créé une fois pour toute la page (au niveau du module). */
export function creerRepere(): Repere {
  let el: HTMLElement | null = null;
  const abonnes = new Set<() => void>();
  const poser = (nouveau: HTMLElement | null) => {
    if (nouveau === el) return;
    el = nouveau;
    abonnes.forEach((f) => f());
  };
  /* Un élément qui s’en va n’efface pas celui qui l’a déjà remplacé */
  const attacher = (nouveau: HTMLElement | null) => {
    poser(nouveau);
    return () => {
      if (el === nouveau) poser(null);
    };
  };
  return Object.assign(attacher, {
    lire: () => el,
    abonner: (f: () => void) => {
      abonnes.add(f);
      return () => void abonnes.delete(f);
    },
  });
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
    const obs = new IntersectionObserver(([e]) => setVu(e.isIntersecting), { threshold: 0.15 });
    obs.observe(el);
    return () => {
      obs.disconnect();
      setVu(false);
    };
  }, [el]);
  return !!el && vu;
}

/** La hauteur de l’élément du repère, en px (suivie quand elle change) ; 0 tant qu’il n’existe pas. */
export function useHauteur(repere: Repere): number {
  const el = useElement(repere);
  const [hauteur, setHauteur] = useState(0);
  useEffect(() => {
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setHauteur(e.borderBoxSize[0]?.blockSize ?? el.offsetHeight));
    obs.observe(el);
    return () => {
      obs.disconnect();
      setHauteur(0);
    };
  }, [el]);
  return el ? hauteur : 0;
}
