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
 * L’élément d’identifiant `id` est-il à l’écran ? (Une pastille flottante s’efface quand ce qu’elle montre est déjà visible.)
 * Faux tant que l’élément n’existe pas.
 */
export function useEnVue(id: string): boolean {
  const [vu, setVu] = useState(false);
  useEffect(() => {
    let obs: IntersectionObserver | null = null;
    /* L’élément peut arriver après le premier rendu (le rapport se met à jour) : on le cherche à chaque passage */
    const brancher = () => {
      const el = document.getElementById(id);
      if (!el || obs) return;
      obs = new IntersectionObserver(([e]) => setVu(e.isIntersecting), { threshold: 0.15 });
      obs.observe(el);
    };
    brancher();
    const t = window.setInterval(brancher, 1000);
    return () => {
      window.clearInterval(t);
      obs?.disconnect();
    };
  }, [id]);
  return vu;
}
