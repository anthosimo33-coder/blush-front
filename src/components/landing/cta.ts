/* Le bouton principal de la landing, d’après qui la lit : une règle pure, lue par les parties serveur et par les îlots. */

import type { Route } from "next";

const CTA: Route = "/commencer";

/**
 * Qui revient : connecté, avec une conv déjà lue (src/app/retour). La landing l’envoie alors vers son accueil plutôt
 * que vers le parcours, sans dire avec qui (qui tient l’appareil le lirait sans rien toucher). `destination` : la page où
 * sa conv en est (« Qui es-tu ? », la lecture, ou l’accueil), sans passer par les redirections de l’accueil.
 */
export type Retour = { destination?: Route } | null;

/**
 * Le bouton principal de la landing, et la ligne dessous : analyser sa conv, ou la retrouver.
 * Vers l’accueil : préchargé en entier (il n’a pas d’écran de chargement, qui casserait le glissé vers sa fiche), et
 * sans remise en haut de page, qui défaisait l’arrivée sur le dernier échange (`scroll`).
 */
export function ctaDe(retour: Retour) {
  if (!retour) return { href: CTA, label: "Analyser ma conv", note: "Aperçu gratuit · Sans mot de passe", header: "Commencer", prefetch: undefined, scroll: true };
  const href: Route = retour.destination ?? "/app";
  return { href, label: "Retrouver ma conv", note: "Ta conv t’attend", header: "Ouvrir BLUSH", prefetch: href === "/app" ? true : undefined, scroll: href !== "/app" };
}
