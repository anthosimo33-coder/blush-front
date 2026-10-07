/**
 * Le vrai back-end s’active avec NEXT_PUBLIC_BLUSH_BACKEND=1. Sans elle, l’appli garde ses données de démo
 * (le site de démo, la galerie des écrans, les captures) : rien ne change tant qu’on ne l’allume pas.
 */
export const BACKEND = process.env.NEXT_PUBLIC_BLUSH_BACKEND === "1";
