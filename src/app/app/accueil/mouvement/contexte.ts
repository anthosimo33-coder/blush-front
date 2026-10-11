"use client";

import { createContext, use } from "react";

/**
 * L’accueil en mouvement. `arriving` : l’arrivée du jour se joue. Pas `desktop`, inconnu au rendu serveur : connu juste
 * après l’hydratation, il referait toute la conv.
 * « Réduire les animations » coupe tout ce qui bouge : globals.css pour le CSS, prefersReducedMotion() pour le reste.
 */
type HomeMotion = { arriving: boolean };

export const MotionContext = createContext<HomeMotion>({ arriving: false });

export const useHomeMotion = () => use(MotionContext);
