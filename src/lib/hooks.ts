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

/** iPhone, Android ou autre (pour adapter les étapes d’export). */
export function useDevice(): Device {
  const [d, setD] = useState<Device>("other");
  useEffect(() => {
    const ua = navigator.userAgent;
    const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture du navigateur après hydratation
    setD(/Android/i.test(ua) ? "android" : /iPhone|iPad|iPod/.test(ua) || iPadOS ? "ios" : "other");
  }, []);
  return d;
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
