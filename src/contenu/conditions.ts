import { URGENCES } from "./aide";
import { CASE_RENONCIATION } from "./consentements";
import { CATALOGUE, COUT_EN_BULLES, prixDe } from "./offres";

/*
 * Les conditions de BLUSH (la page /conditions) : les conditions d’utilisation, puis celles de la vente. Elles suivent
 * les décisions du lot « prêt à lancer » : un achat une fois (pas d’abonnement), Whop vendeur en titre, des prix TTC,
 * les bulles du chat, le contenu livré tout de suite et la renonciation au droit de rétractation, 18 ans et plus, et
 * jamais un service de conseil ni de thérapie (Whop les interdit, et BLUSH n’en est pas un).
 * Les prix, les bulles de chaque offre et le coût d’une réponse sont lus dans le catalogue (src/contenu/offres.ts), celui
 * que le serveur fait payer : jamais recopiés ici. Un prix changé là change donc ce texte, et son empreinte (plus bas).
 * La case de l’import fait accepter ces conditions : un changement ici change aussi la version de CASE_IMPORT
 * (src/contenu/consentements.ts) : tests/unit/juridique.test.ts fige leur empreinte avec cette version.
 * TODO(produit): à relire par un juriste.
 * TODO(produit): textes nouveaux, à valider (dont les bulles perdues quand on efface son compte, le préavis si BLUSH
 * fermait, et les numéros d’urgence).
 */

/** « 1 bulle », « 10 bulles ». */
const bulles = (n: number) => `${n} bulle${n > 1 ? "s" : ""}`;

const { rapport, premium, pack30, pack80, pack200 } = CATALOGUE;

/** Un morceau d’une section : un paragraphe, ou une liste à puces. */
export type Bloc = string | readonly string[];

/** Une section de la page : son ancre, son titre, ses paragraphes. */
export type Section = { id: string; titre: string; blocs: readonly Bloc[] };

/** L’en-tête de la page, et sa dernière ligne. */
export const CONDITIONS = {
  titre: "Conditions",
  sous: "Les règles entre toi et BLUSH, sans jargon\u00a0: ce que fait BLUSH, ce que tu peux acheter, et ce qui se passe si ça coince.",
  maj: "Dernière mise à jour\u00a0: 12 octobre 2026.",
} as const;

/** Utiliser BLUSH : les conditions d’utilisation. */
const UTILISATION: readonly Section[] = [
  {
    id: "blush",
    titre: "Ce qu’est BLUSH",
    blocs: [
      "BLUSH lit une conv que tu importes (un export ou des captures) et t’en donne une lecture\u00a0: un verdict, un rapport en chapitres, et un chat pour en parler.",
      "En important une conv ou en achetant, tu acceptes ces conditions. BLUSH est édité par la société présentée dans les mentions légales.",
    ],
  },
  {
    id: "conseil",
    titre: "Une lecture, pas un conseil",
    blocs: [
      "BLUSH t’aide à y voir plus clair, avec un peu d’humour. Ce n’est ni un service de conseil, ni une thérapie, ni un avis médical, psychologique ou juridique. Une IA peut se tromper\u00a0: ce que tu décides reste ta décision.",
      URGENCES,
    ],
  },
  {
    id: "age",
    titre: "18 ans et plus",
    blocs: [
      "BLUSH est réservé aux personnes de 18 ans ou plus\u00a0: avant chaque import, tu le confirmes en cochant une case. Une conv avec une personne mineure ne s’analyse pas ici.",
    ],
  },
  {
    id: "conv",
    titre: "Ta conv, et ce qu’elle dit d’intime",
    blocs: [
      "Tu n’importes qu’une conv à laquelle tu as pris part.",
      "Une conv peut dire des choses intimes, sur toi comme sur l’autre personne\u00a0: sa santé, sa vie amoureuse, sa sexualité. Avant chaque import, tu acceptes, en cochant une case, que BLUSH les lise pour écrire ton analyse. BLUSH garde la date de cet accord, et la version du texte que tu as coché.",
      "La personne avec qui tu parles n’est jamais contactée. Ce que tu lis ici ne sert pas à la surveiller, la harceler ou l’exposer.",
      "Ce que BLUSH fait de ta conv, combien de temps il la garde et comment tout effacer\u00a0: la page Confidentialité.",
    ],
  },
  {
    id: "compte",
    titre: "Ton compte",
    blocs: [
      "Ton compte tient à ton email\u00a0: pas de mot de passe, un code sur chaque nouvel appareil. Il est à toi seul.",
      "Tu peux tout effacer à tout moment, dans «\u00a0Mon compte\u00a0». Les bulles qui te restent partent avec lui.",
      "BLUSH peut fermer un compte qui ne respecte pas ces conditions\u00a0: une conv qui n’est pas la tienne, des envois automatisés, un usage pour nuire à quelqu’un.",
    ],
  },
];

/** Acheter : les conditions de vente. */
const VENTE: readonly Section[] = [
  {
    id: "offres",
    titre: "Ce que tu peux acheter",
    blocs: [
      "Ton verdict et le premier chapitre de ton rapport sont gratuits. Le reste s’achète une fois\u00a0: pas d’abonnement.",
      [
        `Le rapport d’une conv, ${prixDe("rapport")}\u00a0: tous ses chapitres, et ${bulles(rapport.bulles)}.`,
        `Premium, ${prixDe("premium")}\u00a0: le rapport de cette conv, et ${bulles(premium.bulles)}.`,
        `Une recharge de bulles\u00a0: ${bulles(pack30.bulles)} pour ${prixDe("pack30")}, ${pack80.bulles} pour ${prixDe("pack80")}, ${pack200.bulles} pour ${prixDe("pack200")}.`,
      ],
      "Un rapport, c’est la lecture d’une conv\u00a0: une autre conv a son propre rapport.",
      "BLUSH te propose parfois une offre, une seule fois\u00a0: la suite d’un rapport moins chère pendant quelques minutes, ou des bulles en plus après un achat ou à ta première recharge. Son prix et ce qu’elle donne sont affichés avant que tu paies.",
      "Les prix sont en euros, toutes taxes comprises. Celui qui compte est le prix affiché au moment de payer.",
    ],
  },
  {
    id: "bulles",
    titre: "Les bulles",
    blocs: [
      "Une bulle, c’est une réponse de BLUSH, quoi que tu lui dises\u00a0: dans le chat, comme à «\u00a0Ta question\u00a0» sous ton rapport.",
      [
        `Une réponse écrite\u00a0: ${bulles(COUT_EN_BULLES.reponse)}.`,
        `Une réponse en vocal\u00a0: ${bulles(COUT_EN_BULLES.vocal)}.`,
        `Une réponse à un message avec des captures ou un export\u00a0: ${bulles(COUT_EN_BULLES.ajout)}.`,
      ],
      "Sans bulle\u00a0: ton verdict, ton rapport, sa fiche, et les alertes quand BLUSH s’inquiète pour toi (une réponse du chat qui en devient une t’est rendue).",
      "Tes bulles n’ont pas de date de fin. Elles ne s’échangent pas contre de l’argent et ne passent pas d’un compte à un autre.",
      "À zéro bulle, BLUSH écrit quand même sa réponse\u00a0: elle t’attend, et se lit après une recharge.",
    ],
  },
  {
    id: "vendeur",
    titre: "Qui te vend\u00a0: Whop",
    blocs: [
      "Le paiement passe par Whop, qui vend en son nom (le vendeur en titre)\u00a0: il encaisse, collecte la TVA et t’envoie ton reçu. Ce qu’il vend, c’est BLUSH qui te le livre.",
      "Whop reçoit ton email, le montant et un numéro de commande\u00a0: jamais ta conv, ni un prénom. Ta carte, BLUSH ne la voit jamais. Sur ton relevé, le paiement porte le nom de Whop.",
    ],
  },
  {
    id: "livraison",
    titre: "Livré tout de suite, sans rétractation",
    blocs: [
      "Ce que tu achètes est un contenu numérique, livré dès le paiement\u00a0: ton rapport se débloque, tes bulles arrivent sur ton compte.",
      `Pour l’avoir tout de suite, tu renonces à ton droit de rétractation de 14 jours (Code de la consommation, article L221-28, 13°)\u00a0: avant de payer, tu coches la case «\u00a0${CASE_RENONCIATION.textes.rapport}\u00a0». Sans elle, le paiement ne part pas.`,
    ],
  },
  {
    id: "remboursement",
    titre: "Un souci, un remboursement",
    blocs: [
      "Si un problème technique t’empêche d’avoir ce que tu as payé (ton rapport ne s’écrit pas, tes bulles n’arrivent pas), écris-nous à bonjour@askblush.com\u00a0: on le répare, ou on te rembourse. Un remboursement passe par Whop, sur le moyen de paiement utilisé.",
      "Quand un achat est remboursé, ou contesté auprès de ta banque, ce qu’il a donné est repris\u00a0: le rapport de la conv se referme, et ses bulles sont retirées de ton solde. Ton solde peut alors passer sous zéro, et le chat te demande une recharge.",
      "Tu gardes les garanties que la loi te donne sur un contenu numérique, dont sa conformité à ce qui t’a été annoncé.",
    ],
  },
  {
    id: "service",
    titre: "Si BLUSH change",
    blocs: [
      "On fait tout pour que BLUSH reste disponible, sans pouvoir promettre qu’il ne tombe jamais en panne. Il évolue\u00a0: des écrans changent, d’autres arrivent. S’il devait fermer, on te préviendrait à l’avance.",
    ],
  },
  {
    id: "desaccord",
    titre: "Un désaccord",
    blocs: [
      "Écris-nous d’abord à bonjour@askblush.com. Si on ne trouve pas de solution, tu peux saisir gratuitement le médiateur de la consommation présenté dans les mentions légales.",
      "Ces conditions suivent le droit français.",
    ],
  },
  {
    id: "changements",
    titre: "Quand ces conditions changent",
    blocs: ["Elles peuvent évoluer. Un achat suit les conditions du jour où tu l’as fait, et on te prévient avant un changement qui compte."],
  },
];

/** Les deux parties de la page : utiliser BLUSH, puis acheter. */
export const PARTIES_CONDITIONS: readonly { titre: string; sections: readonly Section[] }[] = [
  { titre: "Utiliser BLUSH", sections: UTILISATION },
  { titre: "Acheter", sections: VENTE },
];
