import type { AriaAttributes } from "react";

/**
 * Les attributs qu’un écran peut poser sur une primitive en plus de ses props : les data-* (les ancres d’animation et les
 * contrats avec globals.css), les aria-* et l’id. Ils vont sur l’élément que la primitive rend (un lien, un bouton ou
 * une ligne), sans passer par des sélecteurs ni par des `!important` dans le className.
 */
export type AttributsLibres = AriaAttributes & { id?: string; [attribut: `data-${string}`]: string | undefined };
