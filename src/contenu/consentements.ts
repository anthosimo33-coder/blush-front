/*
 * Les cases à cocher que la loi demande : à l’import (données sensibles, RGPD article 9, et les 18 ans), et avant de
 * payer (la renonciation au droit de rétractation, Code de la consommation L221-28 13°). Une case n’est jamais cochée
 * d’avance. Chaque texte a sa version : le serveur garde la version de la case cochée et l’heure (stories pour l’import),
 * et refuse une version qui n’est plus la sienne. Changer un texte, c’est changer sa version (tests/unit/juridique.test.ts
 * le rappelle).
 * TODO(produit): à relire par un juriste.
 */

/**
 * La case de l’import : 18 ans ou plus, les conditions, et l’accord explicite pour ce que la conv dit d’intime. Elle
 * se coche sur l’écran de l’export et sur celui des captures, avant que rien ne parte. Le lien des conditions s’ouvre
 * dans un autre onglet (les captures choisies restent là).
 * Sa version change avec son texte, et avec les conditions qu’elle fait accepter (src/contenu/conditions.ts).
 * TODO(produit): texte nouveau, à valider.
 */
export const CASE_IMPORT = {
  version: "2026-10-12",
  avant: "J’ai 18 ans ou plus. J’accepte les ",
  lien: "conditions",
  apres: ", et que BLUSH analyse cette conv, même ce qu’elle dit d’intime (santé, vie sexuelle).",
  /** Un envoi tenté sans la case. */
  manquante: "Coche la case pour continuer.",
  /**
   * Le serveur a refusé la case : BLUSH a changé son texte depuis l’ouverture de la page. L’onglet porte encore l’ancien
   * texte et l’ancienne version (le code du navigateur date de son ouverture) : la recocher renverrait la même version,
   * refusée de nouveau. Il faut recharger la page pour lire le nouveau texte, puis le cocher.
   * TODO(produit): texte nouveau (il remplace « Coche de nouveau la case pour continuer. »), à valider.
   */
  perimee: "Ce texte a changé depuis l’ouverture de la page. Recharge-la pour lire le nouveau.",
  /** Le bouton sous `perimee`. TODO(produit): texte nouveau, à valider. */
  recharger: "Recharger la page",
} as const;

/** Le texte entier de la case de l’import, tel qu’il se lit. */
export const texteCaseImport = () => `${CASE_IMPORT.avant}${CASE_IMPORT.lien}${CASE_IMPORT.apres}`;

/**
 * La case de la feuille du paiement : le contenu numérique livré tout de suite, et la renonciation au droit de
 * rétractation qui va avec (sans elle, le bouton ne paie pas). `rapport` dans la feuille « Ta formule », `bulles` dans
 * la recharge. Le texte du rapport est celui de la spécification du lot « prêt à lancer ».
 * TODO(produit): le texte des bulles est nouveau, à valider.
 */
export const CASE_RENONCIATION = {
  version: "2026-10-12",
  textes: {
    rapport: "Je veux mon rapport tout de suite et je renonce à mon droit de rétractation",
    bulles: "Je veux mes bulles tout de suite et je renonce à mon droit de rétractation",
  },
  manquante: "Coche la case pour payer.",
} as const;

/** Ce qu’on achète, pour la case de la renonciation : le rapport (la feuille « Ta formule »), ou des bulles (la recharge). */
export type AchatImmediat = keyof typeof CASE_RENONCIATION.textes;
