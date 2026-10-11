"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

/*
 * Les aperçus des fichiers choisis (une capture, sa vignette, un enregistrement) : des URL d’objet, que le navigateur
 * garde en mémoire tant qu’on ne les libère pas. Une vingtaine de captures, c’est des dizaines de Mo : chacune est
 * libérée dès qu’elle ne sert plus (une capture retirée, un choix remplacé), et toutes au départ de l’écran.
 */

/** Ce que rend useApercusFichiers : de quoi créer l’aperçu d’un fichier, et le libérer. */
type ApercusFichiers = {
  /** L’URL d’aperçu d’un fichier (ou de sa vignette), libérée au plus tard au départ de l’écran. */
  creer: (fichier: Blob) => string;
  /** Libère un aperçu qui ne sert plus (sans URL, ou déjà libéré : rien). */
  liberer: (url: string | null | undefined) => void;
};

/**
 * Les URL d’aperçu d’un écran, créées et libérées ici. Un aperçu créé après le départ de l’écran (une vignette qui
 * arrive trop tard) est libéré aussitôt : l’URL rendue ne s’affichera plus nulle part.
 */
export function useApercusFichiers(): ApercusFichiers {
  const urls = useRef(new Set<string>());
  /* L’écran est parti (pas « pas encore là » : un aperçu créé avant le premier effet est bien gardé) */
  const parti = useRef(false);
  useEffect(() => {
    parti.current = false;
    const ouvertes = urls.current;
    return () => {
      parti.current = true;
      ouvertes.forEach((u) => URL.revokeObjectURL(u));
      ouvertes.clear();
    };
  }, []);

  const creer = useCallback((fichier: Blob) => {
    const url = URL.createObjectURL(fichier);
    if (parti.current) URL.revokeObjectURL(url);
    else urls.current.add(url);
    return url;
  }, []);

  const liberer = useCallback((url: string | null | undefined) => {
    if (url && urls.current.delete(url)) URL.revokeObjectURL(url);
  }, []);

  return useMemo(() => ({ creer, liberer }), [creer, liberer]);
}
