"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/*
 * La page d’avant, dans l’appli (son chemin, sans la requête). Sert aux boutons « Retour » : quand la page visée est
 * celle d’où l’on vient, ils reviennent en arrière au lieu de l’ouvrir à nouveau (sinon, le retour suivant ramène
 * sur la page qu’on vient de quitter, en boucle).
 */
let courante: string | null = null;
let precedente: string | null = null;

export const pagePrecedente = () => precedente;

/** Le chemin d’une adresse de l’appli, sans la requête ni l’ancre. */
export const cheminDe = (adresse: string) => adresse.split(/[?#]/)[0] || "/";

/** Monté une fois (le layout) : retient la page d’avant à chaque changement de page. */
export function SuiviNavigation() {
  const chemin = usePathname();
  useEffect(() => {
    if (chemin === courante) return;
    precedente = courante;
    courante = chemin;
  }, [chemin]);
  return null;
}
