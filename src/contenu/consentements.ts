/*
 * Les accords que la loi demande : à l’import (données sensibles, RGPD article 9), et avant de payer (la renonciation
 * au droit de rétractation, Code de la consommation L221-28 13°). Plus aucune case : une ligne dit chacun près du bouton,
 * et son geste le donne. Chaque texte a sa version : le serveur garde la version de l’accord donné et l’heure (stories
 * pour l’import, achats pour le paiement), et refuse une version qui n’est plus la sienne. Changer un texte, c’est changer
 * sa version (tests/unit/juridique.test.ts le rappelle).
 * TODO(produit): à relire par un juriste.
 */

/**
 * L’accord de l’import (son nom date de la case à cocher qu’il était) : les conditions, et que BLUSH lise toute la conv
 * (ce qu’elle dit d’intime compris). Une ligne le dit au-dessus du bouton, sur l’écran de l’export et sur celui des captures ;
 * le geste du bouton le donne (choisir le fichier, « Continuer », l’enregistrement d’écran), et l’import porte sa
 * version. Le lien des conditions s’ouvre dans un autre onglet (les captures choisies restent là).
 * Sa version change avec son texte, et avec les conditions qu’il fait accepter (src/contenu/conditions.ts).
 * Le 13 octobre, la case « J’ai 18 ans ou plus… » est retirée (trop de friction, et BLUSH est ouvert dès 15 ans).
 * TODO(produit): à relire par un juriste (le consentement explicite que demande le RGPD, article 9, pour ce qui est intime).
 */
export const CASE_IMPORT = {
  /*
   * Le 16 octobre : les conditions disent la lecture payée avant d’être écrite (plus de verdict offert), et la grille de
   * prix du jour ; puis (« .2 ») le règlement de la roue. Le 21 octobre : la grille redescend (le rapport à 9,90 €,
   * Premium à 14,90 €)
   */
  version: "2026-10-21.1",
  avant: "En continuant, tu acceptes les ",
  lien: "conditions",
  apres: " et que BLUSH lise toute ta conv.",
  /**
   * Le serveur a refusé l’accord : BLUSH a changé son texte depuis l’ouverture de la page. L’onglet porte encore l’ancien
   * texte et l’ancienne version (le code du navigateur date de son ouverture) : réessayer renverrait la même version,
   * refusée de nouveau. Il faut recharger la page pour lire le nouveau texte.
   * TODO(produit): texte nouveau (il remplace « Coche de nouveau la case pour continuer. »), à valider.
   */
  perimee: "Ce texte a changé depuis l’ouverture de la page. Recharge-la pour lire le nouveau.",
  /** Le bouton sous `perimee`. TODO(produit): texte nouveau, à valider. */
  recharger: "Recharger la page",
} as const;

/** Le texte entier de l’accord de l’import, tel qu’il se lit. */
export const texteCaseImport = () => `${CASE_IMPORT.avant}${CASE_IMPORT.lien}${CASE_IMPORT.apres}`;

/**
 * La renonciation au droit de rétractation (son nom date de la case à cocher qu’elle était) : le contenu numérique livré
 * tout de suite, et le délai de rétractation auquel on renonce pour l’avoir. Une ligne discrète la dit juste sous le
 * bouton qui paie, et le geste de payer la donne : le paiement porte sa version, que l’achat garde avec l’heure. `rapport`
 * dans la feuille « Ta formule » et l’offre ①, `bulles` dans la recharge et l’offre ③. « délai de rétractation » mène à
 * la section des conditions qui l’explique (`ancre`).
 * Le 13 octobre, la case « Je veux mon rapport tout de suite et je renonce à mon droit de rétractation » est retirée (elle
 * coûtait des paiements).
 * TODO(produit): à relire par un juriste (le renoncement exprès que demande l’article L221-28, 13°, donné par le geste de payer).
 */
export const CASE_RENONCIATION = {
  /* Le 13 octobre, deuxième version : la ligne du rapport d’avance (le 2e rapport), utilisé pour une conv */
  version: "2026-10-13.2",
  avant: {
    rapport: "En payant, tu as ton rapport tout de suite et tu renonces au ",
    bulles: "En payant, tu as tes bulles tout de suite et tu renonces au ",
    avance: "En débloquant, tu as ton rapport tout de suite et tu renonces au ",
  },
  lien: "délai de rétractation",
  apres: ".",
  /** La section des conditions qui explique la rétractation et la livraison tout de suite (src/contenu/conditions.ts). */
  ancre: "/conditions#livraison",
} as const;

/** Ce qu’on reçoit, pour la renonciation : le rapport (« Ta formule », l’offre ①), des bulles (la recharge, l’offre ③), ou le rapport d’un rapport d’avance utilisé. */
export type AchatImmediat = keyof typeof CASE_RENONCIATION.avant;

/** Le texte entier de la renonciation, tel qu’il se lit sous le bouton. */
export const texteRenonciation = (quoi: AchatImmediat) => `${CASE_RENONCIATION.avant[quoi]}${CASE_RENONCIATION.lien}${CASE_RENONCIATION.apres}`;
