"use client";

import { loadWhop, type Appearance, type WhopLoad } from "@whop/elements";

/*
 * Les Elements de Whop, côté navigateur : leur script hébergé (cdn.whop.com, chargé une fois, à la première feuille qui
 * paie : jamais sur une page qui ne fait pas payer) et leur apparence, aux couleurs de BLUSH. Ce qu’ils montrent (la
 * carte, Apple Pay) vit dans leurs cadres : aucun numéro de carte ne passe par nos pages ni par notre serveur, qui ne
 * reçoit qu’un jeton de confirmation (ctok_…), à usage unique.
 */

let chargement: WhopLoad | null = null;

/** Le script des Elements, chargé une seule fois pour toute la page (loadWhop le garde aussi). */
export function chargerWhop(): WhopLoad {
  return (chargement ??= loadWhop());
}

/** L’apparence des Elements : le clair de l’appli, le rose de BLUSH, les gris chauds, des coins arrondis comme nos cartes. */
export const APPARENCE: Appearance = {
  theme: { appearance: "light", accentColor: "pink", grayColor: "sand", dangerColor: "red", successColor: "jade" },
  variables: { "--radius": "14px" },
};
