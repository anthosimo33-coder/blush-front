"use client";

import { useEffect, useEffectEvent } from "react";

/** Ce qu’un tour du sondage décide : un délai (ms) avant le prochain tour, `false` pour s’arrêter, rien pour l’intervalle. */
export type SuiteDuSondage = number | false | void;

/**
 * Relit quelque chose du serveur à intervalles, tant que `actif` : le rapport qui s’écrit, son vocal qui s’enregistre,
 * la lecture d’une conv. Un tour attend la fin du précédent (jamais deux lectures en même temps), et décide du suivant
 * par ce qu’il rend (SuiteDuSondage) : un repli après une erreur, un arrêt une fois fini. Un tour qui lève ne casse pas
 * le sondage : le suivant part à l’intervalle. Le premier part après `intervalle`, ou tout de suite avec `immediat`.
 * Démonté, ou `actif` qui repasse à faux : plus aucun tour, même celui qui attendait sa réponse.
 * `tour` peut changer à chaque rendu : c’est toujours le dernier qui sert, sans relancer l’attente.
 */
export function useSondage(tour: () => SuiteDuSondage | Promise<SuiteDuSondage>, { actif = true, intervalle, immediat = false }: { actif?: boolean; intervalle: number; immediat?: boolean }) {
  const faire = useEffectEvent(tour);
  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    const tourner = async () => {
      let suite: SuiteDuSondage;
      try {
        suite = await faire();
      } catch {
        suite = undefined;
      }
      if (!vivant || suite === false) return;
      minuteur = setTimeout(tourner, typeof suite === "number" ? suite : intervalle);
    };
    minuteur = setTimeout(tourner, immediat ? 0 : intervalle);
    return () => {
      vivant = false;
      clearTimeout(minuteur);
    };
  }, [actif, intervalle, immediat]);
}
