/*
 * Les clés du navigateur que lisent aussi les aides des tests de bout en bout et la galerie, pour préparer un état
 * (tests/e2e/aide) : une nouvelle version d’une clé ne les laisse pas sur l’ancienne. Les autres clés de l’appli
 * restent près de l’écran qui les lit (le chat ouvert, la feuille de partage, les vocaux écoutés, les sons).
 */

/** Le parcours de l’onglet (sessionStorage) : src/state/journey.tsx. */
export const CLE_PARCOURS = "blush.journey.v1";

/** Où tu t’étais arrêté dans le rapport, conv par conv (localStorage) : src/app/rapport/useReprise.ts. */
export const CLE_REPRISE = "blush.rapport.reprise.v2";
