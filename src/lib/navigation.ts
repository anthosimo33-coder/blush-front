"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
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

/** L’API Navigation, là où le navigateur l’a (pas encore partout : sans elle, on s’en tient à la page d’avant). */
type HistoriqueNavigation = { currentEntry: { index: number } | null };

/**
 * L’entrée d’avant dans l’historique est-elle à BLUSH ? `pagePrecedente` est la dernière page de BLUSH vue, pas l’entrée
 * d’avant : arrivé par un lien, un « Retour » (le repli, poussé) puis le retour du système ramènent sur la page avec une
 * page d’avant, alors que l’entrée d’avant est le site d’où l’on vient. L’API Navigation ne liste que les entrées de
 * BLUSH (même origine) : un index au-dessus de 0 dit qu’en arrière, on reste chez nous. Sans l’API (WebKit, des
 * navigateurs plus anciens), cette limite reste : le repli ne protège que la première arrivée.
 */
function entreeDAvantDansBlush() {
  const historique = (window as Window & { navigation?: HistoriqueNavigation }).navigation;
  const entree = historique?.currentEntry;
  return entree ? entree.index > 0 : true;
}

/** Revenir en arrière reste-t-il dans BLUSH ? Une page d’avant dans l’appli, et l’entrée d’avant de l’historique à nous. */
const retourDansBlush = () => pagePrecedente() !== null && entreeDAvantDansBlush();

/**
 * Un « Retour » vers une adresse fixe peut-il revenir en arrière ? Seulement si la page d’avant est cette adresse, et
 * que l’entrée d’avant de l’historique est à BLUSH : ouvert par le lien d’un mail, un « Retour » puis le retour du
 * système laissent `href` en page d’avant alors qu’en arrière, c’est la messagerie (ou rien, dans un onglet neuf). Sinon,
 * le lien s’ouvre.
 */
export const revenirVers = (href: string) => pagePrecedente() === cheminDe(href) && entreeDAvantDansBlush();

/**
 * La règle unique des « Retour » vers la page d’avant : en arrière quand on reste dans BLUSH (retourDansBlush), sinon
 * `repli` (ouvert directement par un lien, un nouvel onglet, ou après un retour du système qui a ramené ici : revenir
 * en arrière quitterait BLUSH, ou ne ferait rien). Rend la fonction du toucher. `scroll` : celui de router.push (false
 * vers l’accueil, qui se pose lui-même en bas de la conv).
 */
export function useRetourSinon(repli: Route, { scroll }: { scroll?: boolean } = {}) {
  const router = useRouter();
  return () => (retourDansBlush() ? router.back() : router.push(repli, { scroll }));
}
