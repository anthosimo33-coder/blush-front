/*
 * Les clés de ce que l’appli garde dans le navigateur. Les aides des tests de bout en bout et la galerie les lisent ici
 * pour préparer un état (tests/e2e/aide) : une nouvelle version d’une clé ne les laisse pas sur l’ancienne.
 */

/** Le parcours de l’onglet (sessionStorage) : src/state/journey.tsx. */
export const CLE_PARCOURS = "blush.journey.v1";

/** Où tu t’étais arrêté dans le rapport, conv par conv (localStorage) : src/app/rapport/ReportScreen.tsx. */
export const CLE_REPRISE = "blush.rapport.reprise.v2";
