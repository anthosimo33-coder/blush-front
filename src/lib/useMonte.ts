"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * L’écran est-il toujours là ? Un drapeau, vrai tant que le composant est monté : après une attente (une lecture de 10
 * à 40 s, un envoi), on ne met plus à jour, et on n’envoie pas vers la suite, quelqu’un qui est parti. Remis à vrai
 * à chaque montage (le double montage du mode strict de React le repasse à vrai).
 */
export function useMonte(): RefObject<boolean> {
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);
  return monte;
}
