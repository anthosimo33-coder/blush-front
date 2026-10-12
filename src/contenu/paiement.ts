import { CATALOGUE, enEuros, prixDe } from "./offres";

/*
 * Les textes du paiement par Whop qui ne sont pas des formules : la case de renonciation au droit de rétractation, la
 * page du retour, les offres uniques ① et ③ (reprises du prototype validé des bulles, 12 octobre). Les écrans de la
 * vague 2 les mettront au dessin du prototype ; leurs mots ne changent pas sans décision.
 * TODO(produit): à relire par un juriste (la renonciation : Code de la consommation, L221-28 13°).
 */

/**
 * La case à cocher avant de payer, sans laquelle le paiement ne part pas (le serveur le refuse aussi : 422
 * « renonciation »). Le rapport : le texte décidé ; des bulles seules (③, une recharge) : TODO(produit) texte nouveau.
 */
export const RENONCIATION = {
  rapport: "Je veux mon rapport tout de suite et je renonce à mon droit de rétractation",
  bulles: "Je veux mes bulles tout de suite et je renonce à mon droit de rétractation",
  /* TODO(produit): texte nouveau, dit quand on appuie sur le bouton sans avoir coché */
  manque: "Coche la case pour payer.",
};

/** La page du retour du paiement (/paiement/retour), qui attend la livraison. TODO(produit): textes nouveaux, la vague 2 la met au dessin. */
export const RETOUR_PAIEMENT = {
  attente: "On vérifie ton paiement…",
  long: "Ton paiement met du temps à arriver. S’il est passé, il arrivera tout seul : tu peux revenir plus tard.",
  echoue: "Le paiement n’est pas passé. Rien n’a été payé.",
  annule: "Ce paiement a été remboursé.",
  introuvable: "Ce paiement n’existe pas, ou pas sur ce compte.",
  revenir: "Revenir au rapport",
};

/** Le prix de l’offre ①, barré : celui du rapport seul. */
const BARRE_SUITE = CATALOGUE.suite.barre ?? CATALOGUE.rapport.centimes;

/** L’offre unique ① (le prototype des bulles, « OffreAvantDePartir ») : la suite moins chère, pendant 5 minutes. */
export const OFFRE_SUITE = {
  titre: `Ta suite à −${Math.round(100 - (100 * CATALOGUE.suite.centimes) / BARRE_SUITE)} %`,
  sousTitre: "Rien que pour toi, et une seule fois.",
  fin: "L’offre se termine dans",
  prix: prixDe("suite"),
  barre: enEuros(BARRE_SUITE),
  contenu: `${CATALOGUE.suite.bulles} bulles offertes`,
  prendre: `Je la prends · ${prixDe("suite")}`,
  non: "Non merci",
};

/** L’offre unique ③ (le prototype des bulles, sur « C’est débloqué ») : Premium pour 5 € de plus, juste après le rapport seul. */
export const OFFRE_PREMIUM_AJOUT = {
  badge: "Une seule fois, ici",
  titre: `Passe en Premium pour ${prixDe("premium_ajout")} de plus`,
  texte: `${CATALOGUE.premium_ajout.bulles} bulles en plus, comme en Premium. Seules, elles coûtent ${prixDe("pack80")}.`,
  carte: "Ta carte est enregistrée : un geste et c’est fait.",
  prendre: `Ajouter ${CATALOGUE.premium_ajout.bulles} bulles · ${prixDe("premium_ajout")}`,
  non: "Non merci, je lis la suite",
};
