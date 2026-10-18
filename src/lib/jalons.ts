"use client";

import { useEffect, type RefObject } from "react";
import { envoyerJalon } from "@/services/api";
import type { Jalon } from "@/types";
import { etapeDe } from "./presence";

/*
 * Les jalons du tunnel, pour /admin (« L’import, écran par écran », « Le paywall, jusqu’au paiement ») : ce que le
 * visiteur vient de faire, un fichier choisi, le paywall vu jusqu’aux avis, le formulaire de Whop affiché. Le nom du
 * jalon, seul : ni contenu, ni cookie, ni rien de gardé dans le navigateur. Envoyé une fois par page chargée ; le
 * serveur, lui, ne le compte qu’une fois par jour et par personne (src/server/visites.ts, noterJalon). Jamais depuis
 * les outils de l’équipe (/admin, /apercu, /styleguide). Un jalon raté ne se voit pas.
 */

/* Les jalons déjà envoyés par cette page */
const envoyes = new Set<Jalon>();

/** Marque un jalon, une fois par page chargée. */
export function marquerJalon(jalon: Jalon): void {
  if (typeof window === "undefined" || envoyes.has(jalon) || etapeDe(window.location.pathname) === null) return;
  envoyes.add(jalon);
  envoyerJalon(jalon);
}

/** Marque un jalon à l’arrivée de l’écran qui le pose (null : pas ici). */
export function useJalon(jalon: Jalon | null): void {
  useEffect(() => {
    if (jalon) marquerJalon(jalon);
  }, [jalon]);
}

/**
 * Marque un jalon quand l’élément arrive à l’écran : par défaut, son haut passé au-dessus du dernier cinquième de la
 * fenêtre (une section plus haute que l’écran compte dès qu’on la voit commencer) ; `marge` "0px" : dès qu’il paraît
 * (le bas d’une page, qui n’atteint jamais le haut de l’écran).
 */
export function useJalonEnVue(ref: RefObject<Element | null>, jalon: Jalon, marge = "0px 0px -20% 0px"): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || envoyes.has(jalon) || typeof IntersectionObserver === "undefined") return;
    const o = new IntersectionObserver(
      (entrees) => {
        if (!entrees.some((e) => e.isIntersecting)) return;
        marquerJalon(jalon);
        o.disconnect();
      },
      { rootMargin: marge },
    );
    o.observe(el);
    return () => o.disconnect();
  }, [ref, jalon, marge]);
}
