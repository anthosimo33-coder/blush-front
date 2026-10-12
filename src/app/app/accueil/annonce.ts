"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Ce que les lecteurs d’écran entendent de la conv : le texte d’une région role="status" (HomeScreen). Une région live
 * ne se relit que si son contenu change : la même annonce deux fois de suite (« 40 messages plus anciens chargés » à
 * chaque morceau de l’historique, deux coupures, deux « Je n’ai rien entendu… ») resterait muette la seconde fois.
 * Chaque annonce vide donc la région, puis la remplit un peu après : le lecteur d’écran voit les deux changements.
 */

/* Le temps entre la région vidée et son nouveau texte : assez pour que les lecteurs d’écran voient la région vide */
export const DELAI_ANNONCE_MS = 100;

/** Le texte de la région role="status", et la fonction qui annonce (même un texte identique au précédent). */
export function useAnnonce(): [string, (texte: string) => void] {
  const [texte, setTexte] = useState("");
  const minuteur = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(minuteur.current), []);
  const annoncer = useCallback((suivant: string) => {
    window.clearTimeout(minuteur.current);
    setTexte("");
    minuteur.current = window.setTimeout(() => setTexte(suivant), DELAI_ANNONCE_MS);
  }, []);
  return [texte, annoncer];
}
