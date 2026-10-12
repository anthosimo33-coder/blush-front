import { CATALOGUE, enEuros, prixDe } from "./offres";

/*
 * Les textes du paiement par Whop qui ne sont pas des formules : la page du retour, les offres uniques ① et ③ (reprises
 * du prototype validé des bulles, 12 octobre). Les écrans de la vague 2 les mettront au dessin du prototype ; leurs mots
 * ne changent pas sans décision. La case de renonciation au droit de rétractation est dans src/contenu/consentements.ts.
 */

/** La page du retour du paiement (/paiement/retour), qui attend la livraison. TODO(produit): textes nouveaux, la vague 2 la met au dessin. */
export const RETOUR_PAIEMENT = {
  attente: "On vérifie ton paiement…",
  long: "Ton paiement met du temps à arriver. S’il est passé, il arrivera tout seul\u00a0: tu peux revenir plus tard.",
  echoue: "Le paiement n’est pas passé. Rien n’a été payé.",
  annule: "Ce paiement a été remboursé.",
  introuvable: "Ce paiement n’existe pas, ou pas sur ce compte.",
  revenir: "Revenir au rapport",
};

/** Le prix de l’offre ①, barré : celui du rapport seul. */
const BARRE_SUITE = CATALOGUE.suite.barre ?? CATALOGUE.rapport.centimes;

/** L’offre unique ① (le prototype des bulles, « OffreAvantDePartir ») : la suite moins chère, pendant 5 minutes. */
export const OFFRE_SUITE = {
  titre: `Ta suite à −${Math.round(100 - (100 * CATALOGUE.suite.centimes) / BARRE_SUITE)}\u00a0%`,
  sousTitre: "Rien que pour toi, et une seule fois.",
  fin: "L’offre se termine dans",
  prix: prixDe("suite"),
  barre: enEuros(BARRE_SUITE),
  contenu: `${CATALOGUE.suite.bulles} bulles offertes`,
  prendre: `Je la prends · ${prixDe("suite")}`,
  non: "Non merci",
};

/** Un prix rond sans ses centimes, comme le prototype (« 5 € ») ; sinon avec (« 4,90 € »). */
const prixCourt = (centimes: number) => (centimes % 100 ? enEuros(centimes) : `${centimes / 100}\u00a0€`);

/** L’offre unique ③ (le prototype des bulles, sur « C’est débloqué ») : Premium pour 5 € de plus, juste après le rapport seul. */
export const OFFRE_PREMIUM_AJOUT = {
  badge: "Une seule fois, ici",
  titre: `Passe en Premium pour ${prixCourt(CATALOGUE.premium_ajout.centimes)} de plus`,
  texte: `${CATALOGUE.premium_ajout.bulles} bulles en plus, comme en Premium. Seules, elles coûtent ${prixDe("pack80")}.`,
  carte: "Ta carte est enregistrée\u00a0: un geste et c’est fait.",
  prendre: `Ajouter ${CATALOGUE.premium_ajout.bulles} bulles · ${prixCourt(CATALOGUE.premium_ajout.centimes)}`,
  non: "Non merci, je lis la suite",
};
