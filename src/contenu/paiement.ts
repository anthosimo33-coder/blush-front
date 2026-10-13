import { CEST_QUOI, PIECES } from "./bulles";
import { CHAPITRES_OFFERTS, NB_CHAPITRES } from "./chapitres";
import { CATALOGUE, enEuros, prixDe, RAPPORT_D_AVANCE } from "./offres";

/*
 * Les textes des écrans du paiement par Whop : le bas de l’aperçu gratuit (PiedGratuit), la feuille « Ta formule »,
 * l’offre unique ① (OffreAvantDePartir), « C’est débloqué » et l’offre ③, et la page du retour. Repris tels quels du
 * prototype validé des bulles (12 octobre) ; leurs nombres et leurs prix viennent du catalogue (src/contenu/offres.ts),
 * jamais recopiés. Les mots ne changent pas sans décision. La renonciation au délai de rétractation est dans
 * src/contenu/consentements.ts, « C’est quoi une bulle ? » dans src/contenu/bulles.ts.
 */

/** Un prix rond sans ses centimes, comme le prototype (« 5 € », « −3 € ») ; sinon avec (« 4,90 € »). */
const prixCourt = (centimes: number) => (centimes % 100 ? enEuros(centimes) : `${centimes / 100}\u00a0€`);

/** Les chapitres qu’ouvre le rapport payé, quand l’écran ne compte pas ceux du rapport écrit (un rapport écrit peut en avoir moins). */
export const CHAPITRES_A_DEBLOQUER = NB_CHAPITRES - CHAPITRES_OFFERTS;

/* Premium, comme un « 2 achetés, 1 offert » : les bulles offertes sont celles du plus petit pack, vendu à part (leur prix, barré) */
const PREMIUM = CATALOGUE.premium;
const OFFERTES_PREMIUM = CATALOGUE.pack30.bulles;
const PAYEES_PREMIUM = PREMIUM.bulles - OFFERTES_PREMIUM;
/** Ce que coûte une bulle de Premium au-delà du rapport seul : 5 € de plus pour 80 bulles de plus, au centime près. */
const BULLE_PREMIUM = Math.round((PREMIUM.centimes - CATALOGUE.rapport.centimes) / (PREMIUM.bulles - CATALOGUE.rapport.bulles));

/** Le bas de l’aperçu gratuit (PiedGratuit) : « Lire la suite », son prix, et les bulles offertes avec le rapport. */
export const PIED_GRATUIT = {
  lire: `Lire la suite · ${prixDe("rapport")}`,
  /** Le −50 % gardé (⑥) : le rapport à son prix réduit. */
  lireGarde: `Lire la suite · ${prixDe("rapport_garde")}`,
  /** Un rapport d’avance (⑤ payé) : la suite sans rien payer (la feuille dit pourquoi). */
  lireAvance: `Lire la suite · ${prixCourt(0)}`,
  offertes: `${CATALOGUE.rapport.bulles} bulles offertes avec ton rapport`,
  regle: `${CEST_QUOI.texte}, sur tout ce que tu veux`,
};

/** La feuille « Ta formule » (FeuilleFormule) : le rapport seul, ou Premium, choisie d’avance. */
export const FEUILLE_FORMULE = {
  titre: (autre?: string) => (autre ? `La suite parle de vous deux\u00a0: toi et ${autre}.` : "La suite parle de vous deux."),
  /** Le nom du groupe des deux formules, pour un lecteur d’écran. */
  groupe: "Ta formule",
  rapport: {
    titre: CATALOGUE.rapport.titre,
    note: `+ ${CATALOGUE.rapport.bulles} bulles offertes`,
    /** Ce qu’il contient, une fois choisi : les chapitres qui restent à lire. */
    contenu: (chapitres: number) => `${chapitres} chapitres, ton plan, ton vocal`,
  },
  premium: {
    badge: CATALOGUE.premium.titre,
    titre: `Rapport + ${PAYEES_PREMIUM} bulles`,
    offertes: `+${OFFERTES_PREMIUM} offertes`,
    note: `Soit ${PREMIUM.bulles} bulles en tout`,
    /** Ce qu’elle contient, ligne à ligne, une fois choisie. */
    rapport: "Le rapport",
    chapitres: (chapitres: number) => `· ${chapitres} chapitres`,
    bulles: `${PAYEES_PREMIUM} bulles`,
    plus: `+ ${OFFERTES_PREMIUM} bulles`,
    offertesMot: PIECES.offertes,
    /** Ce que coûteraient ses bulles offertes, seules (le plus petit pack), barré, puis « 0 € ». */
    barreOffertes: prixDe("pack30"),
    gratuit: PIECES.gratuit,
    economie: `Économise ${enEuros((PREMIUM.barre ?? PREMIUM.centimes) - PREMIUM.centimes)} · la bulle à ${enEuros(BULLE_PREMIUM)}`,
  },
  /** Un rapport d’avance (⑤ payé) : la suite sans rien payer, choisie d’avance. */
  avance: {
    titre: "Ton rapport d’avance",
    note: `Déjà payé · + ${RAPPORT_D_AVANCE.bulles} bulles offertes`,
    prix: prixCourt(0),
    debloquer: `Débloquer · ${prixCourt(0)}`,
  },
  /** Le −50 % gardé (⑥) : sous le rapport, à son prix réduit, jusqu’à quand. */
  garde: (jusquau: string) => `Ton −50\u00a0% · jusqu’au ${jusquau}`,
  /** Pour un lecteur d’écran, devant un prix barré : il n’entend pas le trait. */
  auLieuDe: "au lieu de ",
  payer: (prix: string) => `Débloquer · ${prix}`,
  pied: { gras: "Paiement unique, pas d’abonnement", reste: " · Apple Pay ou carte" },
  /** Sans paiement branché (ni Whop, ni le faux Whop) : rien ne s’achète encore. */
  bientot: "Le paiement arrive très vite. Pour l’instant, BLUSH est ouvert sur invitation.",
  souci: "Ça n’a pas pu se faire. Vérifie ta connexion et réessaie.",
};

/** Le prix de l’offre ①, barré : celui du rapport seul. */
const BARRE_SUITE = CATALOGUE.suite.barre ?? CATALOGUE.rapport.centimes;
/** Sa remise, en pourcentage (« −30 % »), en rose dans son titre. */
const REMISE_SUITE = `−${Math.round(100 - (100 * CATALOGUE.suite.centimes) / BARRE_SUITE)}\u00a0%`;

/** L’offre unique ① (OffreAvantDePartir) : la suite moins chère, pendant 5 minutes, la feuille fermée sans payer. */
export const OFFRE_SUITE = {
  /** Ce que BLUSH lance, dans sa bulle, au-dessus du titre. */
  attends: "attends…",
  titre: `Ta suite à ${REMISE_SUITE}`,
  /** Le titre en deux morceaux : la remise se pose en rose. */
  avant: "Ta suite à ",
  remise: REMISE_SUITE,
  sousTitre: "Rien que pour toi, et une seule fois.",
  fin: "L’offre se termine dans",
  prix: prixDe("suite"),
  barre: enEuros(BARRE_SUITE),
  economie: `−${prixCourt(BARRE_SUITE - CATALOGUE.suite.centimes)}`,
  chapitres: (chapitres: number) => `${chapitres} chapitres`,
  vocal: "Ton vocal",
  contenu: `${CATALOGUE.suite.bulles} bulles offertes`,
  prendre: `Je la prends · ${prixDe("suite")}`,
  non: "Non merci",
  /** Le compte à rebours à zéro : elle disparaît pour de bon. */
  passee: "L’offre est passée",
  souci: FEUILLE_FORMULE.souci,
};

/** L’offre unique ③ (sur « C’est débloqué ») : Premium pour 5 € de plus, juste après le rapport seul. */
export const OFFRE_PREMIUM_AJOUT = {
  badge: "Une seule fois, ici",
  titre: `Passe en Premium pour ${prixCourt(CATALOGUE.premium_ajout.centimes)} de plus`,
  texte: `${CATALOGUE.premium_ajout.bulles} bulles en plus, comme en Premium. Seules, elles coûtent ${prixDe("pack80")}.`,
  plus: `+ ${CATALOGUE.premium_ajout.bulles}`,
  carte: "Ta carte est enregistrée\u00a0: un geste et c’est fait.",
  prendre: `Ajouter ${CATALOGUE.premium_ajout.bulles} bulles · ${prixCourt(CATALOGUE.premium_ajout.centimes)}`,
  /* Refusée, son repli suit (le 2e rapport à −50 %) : « je lis la suite » n’est plus vrai */
  non: "Non merci",
  souci: FEUILLE_FORMULE.souci,
};

/** Le 2e rapport à −50 % (⑤, sur « C’est débloqué ») : un rapport d’avance, sur un billet détachable, valable un an. */
const SECOND = CATALOGUE.second;
/** Sa remise, en pourcentage (« −50 % »), en rose dans son titre. */
const REMISE_SECOND = `−${Math.round(100 - (100 * SECOND.centimes) / (SECOND.barre ?? CATALOGUE.rapport.centimes))}\u00a0%`;

export const OFFRE_SECOND = {
  badge: "Une seule fois, ici",
  /** Le titre en deux morceaux : la remise se pose en rose. */
  avant: "Ton 2e rapport à ",
  remise: REMISE_SECOND,
  texte: "Un autre crush, un ex qui revient, un pote chelou… Garde un rapport sous le coude.",
  billet: {
    titre: "Ton prochain rapport",
    sous: "L’histoire de ton choix",
    contenu: [`${NB_CHAPITRES} chapitres`, "ton vocal", `${RAPPORT_D_AVANCE.bulles} bulles`],
    prix: prixDe("second"),
    barre: enEuros(SECOND.barre ?? CATALOGUE.rapport.centimes),
    tampon: "À toi",
  },
  carte: OFFRE_PREMIUM_AJOUT.carte,
  prendre: `Je le prends · ${prixDe("second")}`,
  pris: "Ton 2e rapport t’attend.",
  non: "Non merci, je lis la suite",
  /* Rien n’est livré à l’achat : le délai de rétractation court tant qu’il n’est pas utilisé (RAPPORT_D_AVANCE, son TODO juriste) */
  pied: "Valable 1 an. Pas utilisé\u00a0? Remboursable 14 jours.",
  souci: FEUILLE_FORMULE.souci,
};

/** Le repli de ⑤ refusée (⑥) : le −50 % gardé 7 jours pour une autre conv, sans rien payer maintenant. */
export const OFFRE_GARDE = {
  /** Ce que BLUSH lance, dans sa bulle, au-dessus du titre. */
  bulle: "pas grave",
  titre: "Pas d’autre histoire en tête\u00a0?",
  texte: (jusquau: string) => `Je te garde ton ${REMISE_SECOND} jusqu’au ${jusquau}. Il se pose tout seul sur ta prochaine conv.`,
  /** Sur la souche du billet, au-dessus du jour. */
  jusquau: "jusqu’au",
  remise: REMISE_SECOND,
  garder: "Garde-le-moi",
  garde: (jusquau: string) => `Ton ${REMISE_SECOND} t’attend jusqu’au ${jusquau}.`,
  non: "Non merci",
};

/** « C’est débloqué » (EcranDebloque) : ce que l’achat vient d’ouvrir. */
export const DEBLOQUE = {
  titre: "C’est débloqué.",
  /* Sans « pour toujours » : Whop interdit de promettre un accès « à vie » (sa règle des produits ; décision du 13 octobre) */
  phrase: (chapitres: number, bulles: number) => `Les ${chapitres} chapitres sont à toi. Et ${bulles} bulles pour en parler avec BLUSH.`,
  restants: (chapitres: number) => `Les ${chapitres} chapitres qui restent`,
  reprise: (chapitre: number) => `Ta lecture reprend au chapitre ${chapitre}`,
  bulles: (bulles: number) => `${bulles} bulles pour parler à BLUSH`,
  bullesSous: "1 bulle = 1 réponse · elles n’expirent jamais",
  avance: "1 rapport d’avance",
  avanceSous: (fin: string) => `Pour l’histoire de ton choix, jusqu’au ${fin}`,
  garde: `Ton ${REMISE_SECOND} sur le prochain rapport`,
  gardeSous: (fin: string) => `Jusqu’au ${fin}, il se pose tout seul`,
  lire: "Lire la suite",
  continuer: "Continuer",
};

/**
 * La page du retour du paiement (/paiement/retour), qui attend la livraison, puis mène à « C’est débloqué » (un
 * rapport) ou dit les bulles reçues (un pack, l’offre ③). Chaque état : son titre, et sa ligne dessous.
 * TODO(produit): textes nouveaux (l’annulation, les bulles reçues, « Réessayer »), sans maquette, à valider.
 */
export const RETOUR_PAIEMENT = {
  attente: { titre: "On vérifie ton paiement…", texte: null },
  long: { titre: "Ton paiement met du temps à arriver.", texte: "S’il est passé, il arrivera tout seul\u00a0: tu peux revenir plus tard." },
  echoue: { titre: "Le paiement n’est pas passé.", texte: "Rien n’a été payé. Tu peux réessayer, avec Apple Pay ou une autre carte." },
  /** Annulé chez Whop (« Retour » sur sa page) : rien n’est parti. */
  abandon: { titre: "Paiement annulé.", texte: "Rien n’a été payé." },
  annule: { titre: "Ce paiement a été remboursé.", texte: null },
  introuvable: { titre: "Ce paiement n’existe pas, ou pas sur ce compte.", texte: null },
  /** Des bulles reçues (un pack, l’offre ③), avant de revenir là où le paiement a commencé. */
  recu: (bulles: number) => ({ titre: `+${bulles} bulles`, texte: "Elles n’expirent jamais." }),
  /** Le 2e rapport payé (⑤, après une étape de la banque) : il attend la conv de son choix, sans bulles tout de suite. */
  avance: { titre: "Ton 2e rapport t’attend.", texte: "Il débloque la conv de ton choix, dans l’année." },
  reessayer: "Réessayer",
  revenir: "Revenir au rapport",
  continuer: "Continuer",
};

/**
 * Le paiement dans la feuille (src/components/paiement/integre : les Elements de Whop, sans quitter BLUSH) : le bouton
 * du portefeuille (Apple Pay, Google Pay), la carte dans sa feuille, ce qu’on dit de la carte gardée, et chaque étape.
 * TODO(produit): textes nouveaux (le paiement dans la feuille, 13 octobre) ; la ligne de la carte gardée, à faire relire
 * par un juriste (le consentement que demande l’enregistrement d’un moyen de paiement).
 */
export const DANS_LA_FEUILLE = {
  /** Le nom du bouton du portefeuille, pour un lecteur d’écran (son dessin est celui d’Apple, ou de Google). */
  portefeuille: { apple_pay: "Payer avec Apple Pay", google_pay: "Payer avec Google Pay" },
  avecCarte: "Payer par carte",
  carte: {
    titre: "Payer par carte",
    payer: (prix: string) => `Payer ${prix}`,
    /** Le faux Whop (en local) : sa carte de test, et son refus. */
    test: "Carte de test · rien n’est débité",
    refuser: "Simuler un refus",
  },
  /* Garder le moyen de paiement (setupFutureUsage) demande de le dire avant le geste qui paie */
  garder: "Whop garde ta carte\u00a0: tes prochains achats se paient en un geste.",
  paye: { titre: "C’est payé.", rapport: "J’ouvre ton rapport…", bulles: "J’ajoute tes bulles…" },
  carteRefusee: "Ta banque a dit non. Rien n’a été débité\u00a0: essaie une autre carte.",
  /** Les Elements de Whop ne se chargent pas (le réseau, un bloqueur) : on paie sur sa page, comme avant. */
  pageDeWhop: "Payer sur la page de Whop",
};
