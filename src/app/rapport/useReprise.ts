"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ecrireJson, lireJson } from "@/lib/stockage";
import { CLE_REPRISE } from "@/state/cles";
import { sectionDuChapitre } from "./ancres";

/*
 * La lecture suivie du rapport : le chapitre à l’écran, la progression (posée sur les barres, hors de React), et la
 * reprise (où tu t’étais arrêté, conv par conv, sur ce navigateur), proposée à l’arrivée sans jamais sauter toute seule.
 */

/** Où tu t’étais arrêté, conv par conv (ce navigateur seulement, sous CLE_REPRISE) : le numéro du chapitre. */
type Reprises = Record<string, unknown>;
const estReprises = (v: unknown): v is Reprises => !!v && typeof v === "object" && !Array.isArray(v);
const lireReprises = () => lireJson(CLE_REPRISE, estReprises, {});
/** Le chapitre gardé pour cette conv, s’il est encore ouvert (sinon null). */
function chapitreGarde(storyId: string, ouverts: number[]): number | null {
  const n = Number(lireReprises()[storyId]);
  return ouverts.includes(n) ? n : null;
}

/*
 * Un retour par l’historique (bouton, geste) : Next rend la position de défilement quelques images après l’affichage.
 * Retenu ici pour ne pas lire le haut de la page entre-temps (l’en-tête « Ton rapport complet », la reprise qui clignote).
 * React rend ce retour tout de suite, dans l’écouteur popstate de Next : seul l’événement navigate (API Navigation)
 * l’annonce avant. Sans elle (ancien Safari), popstate arrive après le premier rendu : la reprise, décidée un instant
 * plus tard, ne clignote plus, mais l’en-tête part encore du haut.
 */
type Navigation = EventTarget & { addEventListener(type: "navigate", f: (e: Event & { navigationType: string; destination: { url: string } }) => void): void };
let traversee: { adresse: string; t: number } | null = null;
const noterTraversee = (adresse: string) => (traversee = { adresse, t: Date.now() });
if (typeof window !== "undefined") {
  (window as unknown as { navigation?: Navigation }).navigation?.addEventListener("navigate", (e) => e.navigationType === "traverse" && noterTraversee(e.destination.url));
  window.addEventListener("popstate", () => noterTraversee(window.location.href));
}
const parTraversee = () => !!traversee && traversee.adresse === window.location.href && Date.now() - traversee.t < 3000;

/*
 * La progression de lecture ne passe pas par React : à chaque image de défilement, seules les barres (en-tête, sommaire,
 * feuille) changent d’échelle, sans re-rendre tout le rapport. Le pourcentage annoncé ne change que quand l’entier change.
 */
const barres = new Set<HTMLElement>();
let lu = 0;
const poserLu = (barre: HTMLElement) => {
  (barre.firstElementChild as HTMLElement | null)?.style.setProperty("transform", `scaleX(${lu})`);
  const pct = String(Math.round(lu * 100));
  if (barre.getAttribute("aria-valuenow") !== pct) barre.setAttribute("aria-valuenow", pct);
};
const suivreLu = (p: number) => {
  lu = p;
  barres.forEach(poserLu);
};
/** Le `ref` d’une barre de progression (ReadingBar) : une barre qui apparaît (la feuille du sommaire) prend tout de suite la valeur du moment. */
export const brancherBarre = (el: HTMLDivElement | null) => {
  if (!el) return;
  barres.add(el);
  poserLu(el);
  return () => void barres.delete(el);
};

/**
 * Suit la lecture : le chapitre à l’écran (celui dont le haut a passé le tiers de l’écran)
 * et la progression, du début du chapitre 1 à la fin du dernier chapitre ouvert (posée sur les barres, hors de React).
 * `retour` : arrivé par l’historique, on part du chapitre gardé et on attend que la position soit rendue pour mesurer.
 */
function useLecture(openKey: string, depart: number | null, retour: boolean) {
  const [current, setCurrent] = useState<number | null>(depart);
  const attendre = useRef(retour);
  useEffect(() => {
    const numbers = openKey.split(",").map(Number);
    let raf = 0;
    const measure = () => {
      raf = 0;
      const line = window.innerHeight * 0.33;
      let now: number | null = null;
      for (const n of numbers) {
        const el = sectionDuChapitre(n);
        if (el && el.getBoundingClientRect().top <= line) now = n;
      }
      /* Une valeur identique ne re-rend pas : le rapport ne se re-rend qu’au changement de chapitre */
      setCurrent(now);
      const premier = numbers[0];
      const dernier = numbers.at(-1);
      const first = premier === undefined ? null : sectionDuChapitre(premier);
      const last = dernier === undefined ? null : sectionDuChapitre(dernier);
      if (first && last) {
        const start = first.getBoundingClientRect().top + window.scrollY - line;
        const end = last.getBoundingClientRect().bottom + window.scrollY - window.innerHeight;
        suivreLu(Math.min(1, Math.max(0, (window.scrollY - start) / Math.max(1, end - start))));
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    /* Un retour par l’historique : le défilement qui rend la position déclenche la mesure ; au plus tard dans un instant */
    let plusTard = 0;
    if (attendre.current) {
      attendre.current = false;
      plusTard = window.setTimeout(measure, 700);
    } else measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(plusTard);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [openKey]);
  return current;
}

/**
 * La lecture suivie d’un rapport, et sa reprise. `openKey` : les chapitres ouverts, en clé stable (« 1,2,3 ») ; la mesure
 * ne se relance que s’ils changent. Rend :
 * - `retour` : arrivé par l’historique (retour de « Ta question ») ; la position revient seule, sans proposer de reprise ;
 * - `current` : le chapitre à l’écran (null avant le premier) ;
 * - `resume` : le chapitre où reprendre, proposé à l’arrivée si tu t’étais arrêté plus loin (null sinon) ;
 * - `allerAuChapitre` : y aller (en douceur, sauf mouvement réduit), la proposition de reprise oubliée ;
 * - `oublierReprise` : « Ne pas reprendre ».
 */
export function useReprise(storyId: string, openKey: string) {
  const [resume, setResume] = useState<number | null>(null);
  const [retour] = useState(() => typeof window !== "undefined" && parTraversee());
  /* Le chapitre où l’on était (gardé à chaque chapitre lu), pour l’en-tête d’un retour par l’historique */
  const [depart] = useState(() => (retour ? chapitreGarde(storyId, openKey.split(",").map(Number)) : null));
  const current = useLecture(openKey, depart, retour);

  /* À l’arrivée : si tu t’étais arrêté plus loin, on propose d’y reprendre (sans sauter tout seul). Décidé un instant
     plus tard : un retour par l’historique (popstate, sans API Navigation) se sait alors, et ne propose rien */
  useEffect(() => {
    if (retour) return;
    const t = setTimeout(() => {
      if (parTraversee() || window.location.hash || window.scrollY > 200) return;
      const saved = chapitreGarde(storyId, openKey.split(",").map(Number));
      if (saved !== null && saved >= 2) setResume(saved);
    }, 0);
    return () => clearTimeout(t);
  }, [openKey, storyId, retour]);

  /* On garde le chapitre en cours ; la proposition de reprise s’efface dès qu’on lit plus loin */
  useEffect(() => {
    if (!current) return;
    ecrireJson(CLE_REPRISE, { ...lireReprises(), [storyId]: current });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la reprise devient inutile une fois la lecture repartie
    if (current >= 2) setResume(null);
  }, [current, storyId]);

  const allerAuChapitre = useCallback((n: number) => {
    setResume(null);
    requestAnimationFrame(() => {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      sectionDuChapitre(n)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    });
  }, []);
  const oublierReprise = useCallback(() => setResume(null), []);

  return { retour, current, resume, allerAuChapitre, oublierReprise };
}
