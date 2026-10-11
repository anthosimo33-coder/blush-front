"use client";

import { useEffect, type RefObject } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/** 8 · L’en-tête se replie quand tu remontes dans l’historique (--c : 0 en bas de la conv, 1 replié). Mobile seulement. */
export function useHeaderCollapse(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      /* Les 60 premiers pixels ne comptent pas : une conv à peine plus haute que l’écran garde son grand en-tête */
      const d = document.documentElement;
      const c = Math.max(0, Math.min(1, (d.scrollHeight - window.scrollY - window.innerHeight - 60) / 140));
      el.style.setProperty("--c", c.toFixed(3));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    measure();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
      el.style.removeProperty("--c");
    };
  }, [ref]);
}

/**
 * Clavier ouvert, Safari ne réduit pas la page : il décale la vue visible vers le bas pour montrer le champ, et l’en-tête
 * (collé en haut de la page) sortait par le haut pendant toute la frappe. Tant que la barre de saisie a le focus,
 * l’en-tête suit le haut de la vue visible (un décalage posé à l’image suivante), puis reprend sa place quand le
 * clavier se ferme. L’accueil ne passe pas pour autant en défilement interne : les vols, le repli de l’en-tête, le
 * chargement de l’historique et le repli de la barre de Safari suivent tous la page.
 */
export function useEnteteAuClavier(head: RefObject<HTMLElement | null>, form: RefObject<HTMLFormElement | null>) {
  useEffect(() => {
    const el = head.current;
    const barre = form.current;
    const vue = window.visualViewport;
    if (!el || !barre || !vue) return;
    let suivi = false;
    /* Le champ quitté : le délai au-delà duquel on cesse de suivre la vue, même si elle n’est pas revenue en haut */
    let fin = 0;
    /* Posé dans l’événement de la vue même, pas à l’image suivante : à l’ouverture du clavier, l’en-tête ne sort pas une image */
    const poser = () => {
      const y = Math.max(0, vue.offsetTop);
      el.style.transform = y > 0.5 ? `translateY(${y.toFixed(1)}px)` : "";
      /* Le clavier refermé : la vue est revenue en haut, l’en-tête aussi */
      if (fin && y <= 0.5) arreter();
    };
    const arreter = () => {
      window.clearTimeout(fin);
      fin = 0;
      if (!suivi) return;
      suivi = false;
      vue.removeEventListener("resize", poser);
      vue.removeEventListener("scroll", poser);
      el.style.transform = "";
    };
    const entrer = () => {
      window.clearTimeout(fin);
      fin = 0;
      if (!suivi) {
        suivi = true;
        vue.addEventListener("resize", poser);
        vue.addEventListener("scroll", poser);
      }
      poser();
    };
    /*
     * Le champ quitté, le clavier redescend encore un instant, et la vue avec lui : l’en-tête la suit jusqu’en haut (au
     * plus 0,6 s). Retiré tout de suite, il disparaissait le temps que la vue revienne, puis redescendait avec le clavier.
     */
    const sortir = () => {
      if (!suivi) return;
      window.clearTimeout(fin);
      fin = window.setTimeout(arreter, 600);
      poser();
    };
    /* De retour dans Safari (l’écran d’accueil, un autre onglet), le champ encore actif : la vue a changé entre-temps */
    const revenir = () => {
      if (suivi && document.visibilityState === "visible") poser();
    };
    barre.addEventListener("focusin", entrer);
    barre.addEventListener("focusout", sortir);
    document.addEventListener("visibilitychange", revenir);
    window.addEventListener("pageshow", revenir);
    return () => {
      barre.removeEventListener("focusin", entrer);
      barre.removeEventListener("focusout", sortir);
      document.removeEventListener("visibilitychange", revenir);
      window.removeEventListener("pageshow", revenir);
      arreter();
    };
  }, [head, form]);
}
