"use client";

import { useEffect, type RefObject } from "react";
import { envoyerJalon } from "@/services/api";
import type { AppKind, Jalon } from "@/types";
import { mesurer } from "./analytique";
import { etapeDe } from "./presence";

/*
 * Les jalons du tunnel, pour /admin (« L’import, écran par écran », « Le paywall, jusqu’au paiement ») : ce que le
 * visiteur vient de faire, un fichier choisi, le paywall vu jusqu’aux avis, le formulaire de Whop affiché. Le nom du
 * jalon, seul, et pour ceux de l’import (JALONS_PAR_APPLI) l’appli de l’écran : ni contenu, ni cookie, ni rien de gardé
 * dans le navigateur. Envoyé une fois par page chargée (un jalon de l’import, une fois par appli : l’écran de l’export
 * passe de WhatsApp à Instagram) ; le serveur, lui, ne le compte qu’une fois par jour et par personne
 * (src/server/visites.ts, noterJalon). Jamais depuis les outils de l’équipe (/admin, /apercu, /styleguide). Un jalon
 * raté ne se voit pas. Le même part chez PostHog (« jalon_<nom> », src/lib/analytique.ts), une fois par page et sans
 * l’appli, quand sa clé est là.
 */

/* Ce que cette page a déjà envoyé : chaque jalon, et ceux de l’import pour chaque appli (« fichier:whatsapp ») */
const envoyes = new Set<string>();

/** Marque un jalon, une fois par page chargée ; un jalon de l’import, avec l’appli de son écran, une fois par appli. */
export function marquerJalon(jalon: Jalon, appli?: AppKind): void {
  const cle = appli ? `${jalon}:${appli}` : jalon;
  if (typeof window === "undefined" || envoyes.has(cle) || etapeDe(window.location.pathname) === null) return;
  const premiere = !envoyes.has(jalon);
  envoyes.add(cle).add(jalon);
  envoyerJalon(jalon, appli);
  if (premiere) mesurer(`jalon_${jalon}`);
}

/** Marque un jalon à l’arrivée de l’écran qui le pose (null : pas ici), et à chaque appli qu’il montre. */
export function useJalon(jalon: Jalon | null, appli?: AppKind): void {
  useEffect(() => {
    if (jalon) marquerJalon(jalon, appli);
  }, [jalon, appli]);
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
