"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { play } from "@/lib/sound";
import { markArrivalPlayed } from "@/services/session";

/*
 * L’arrivée du jour s’est jouée depuis l’ouverture de l’appli. Revenu par l’historique (le geste retour, « Retour » sur sa
 * fiche), l’accueil remonte depuis le cache de Next, avec le `arrive` d’avant le cookie : sans ce drapeau, l’arrivée et
 * sa signature se rejoueraient. Rien au rendu serveur ni à l’hydratation (le module est neuf) : pas d’écart.
 */
let arriveeJouee = false;

/**
 * 1 · L’arrivée, une fois par jour (le serveur le sait par un cookie, `arrive`), et une seule fois depuis l’ouverture de
 * l’appli : vrai tant qu’elle se joue (globals.css, `.home-arrive`). `page` : l’accueil, dont les entrées (`data-a`) se
 * posent d’un coup au premier geste.
 */
export function useArrivee(arrive: boolean, page: RefObject<HTMLElement | null>) {
  const [arriving, setArriving] = useState(() => arrive && !arriveeJouee);
  const signed = useRef(false);

  useEffect(() => {
    if (!arriving) return;
    arriveeJouee = true;
    markArrivalPlayed();
    /* La signature tombe avec le « coucou » des perles (0,85 s, une perle toutes les 0,11 s). Ouverte à froid, Safari la garde muette */
    if (!signed.current) play("signature", 0.85, 0.11);
    signed.current = true;
    const t = window.setTimeout(() => setArriving(false), 3700);
    /* Le premier geste (un toucher, la molette, une touche) coupe l’arrivée : ce qui reste à jouer se pose d’un coup, rien ne fait attendre */
    const couper = () => {
      const restantes = new Set<Animation>();
      page.current?.querySelectorAll("[data-a]").forEach((el) => el.getAnimations({ subtree: true }).forEach((a) => restantes.add(a)));
      restantes.forEach((a) => {
        /* Seulement ce qui a une fin : une boucle (le logo qui flotte) continue */
        const fin = a.effect?.getComputedTiming().endTime;
        if (typeof fin === "number" && Number.isFinite(fin)) a.finish();
      });
      setArriving(false);
    };
    const gestes = ["pointerdown", "wheel", "keydown"] as const;
    gestes.forEach((g) => window.addEventListener(g, couper, { capture: true, passive: true }));
    return () => {
      window.clearTimeout(t);
      gestes.forEach((g) => window.removeEventListener(g, couper, { capture: true }));
    };
  }, [arriving, page]);

  return arriving;
}
