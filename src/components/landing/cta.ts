/* Le bouton principal de la landing, d’après qui la lit : une règle pure, lue par les parties serveur et par les îlots. */

import type { Route } from "next";

const CTA: Route = "/commencer";

/**
 * Qui revient, connecté (src/app/retour). Avec une conv, la landing l’envoie vers son accueil plutôt que vers le
 * parcours, sans dire avec qui (qui tient l’appareil le lirait sans rien toucher). `destination` : la page où sa conv en
 * est (« Qui es-tu ? », la lecture, ou l’accueil), sans passer par les redirections de l’accueil. Sans conv (`sansConv`,
 * il a effacé la seule qu’il avait) : le bouton de qui découvre, mais « Mon compte » à la place de « Se connecter ».
 */
export type Retour = { destination: Route } | { sansConv: true } | null;

/** Pour qui revient, sous le bouton : en analyser une autre (le parcours, sans liste d’attente pour qui a une session). */
const UNE_AUTRE = { href: CTA, label: "Analyser une autre conv" } as const;

/**
 * Le bouton principal de la landing, et ce qu’il y a dessous : analyser sa conv (et la ligne qui rassure), ou la
 * retrouver (et le lien pour en analyser une autre, `autre`).
 * Vers l’accueil : préchargé en entier (il n’a pas d’écran de chargement, qui casserait le glissé vers sa fiche), et
 * sans remise en haut de page, qui défaisait l’arrivée sur le dernier échange (`scroll`).
 */
export function ctaDe(retour: Retour) {
  if (!retour || !("destination" in retour))
    return { href: CTA, label: "Analyser ma conv", note: "Paiement unique · Ta\u00a0conv\u00a0reste\u00a0confidentielle", autre: null, header: "Commencer", prefetch: undefined, scroll: true };
  const href = retour.destination;
  return { href, label: "Retrouver ma conv", note: null, autre: UNE_AUTRE, header: "Ouvrir BLUSH", prefetch: href === "/app" ? true : undefined, scroll: href !== "/app" };
}
