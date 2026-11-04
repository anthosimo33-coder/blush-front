import type { Jour } from "@/contenu/articles/types";
import { LIGNES_D_ECOUTE, LIGNES_PAR_SITUATION, NUMEROS_D_URGENCE, URGENCES } from "./aide";
import { EXEMPLE_INVENTE, SOURCES } from "./articles";
import { QUE_TES_CONVS, type Section } from "./conditions";
import { EDITEUR } from "./mentions-legales";

/*
 * Les pages de confiance (plan SEO du 3 novembre 2026, section 6.3) : /a-propos (BLUSH en bref, qui l’édite), /methode
 * (comment un guide est fait, sourcé, relu, corrigé) et /aide (tous les numéros d’aide). Ici, leurs textes à elles ; ce
 * qu’elles disent de BLUSH ou de son éditeur vient d’ailleurs, tel quel, jamais recopié : la phrase de BLUSH
 * (identite.ts), l’éditeur (mentions-legales.ts), ce que BLUSH est et n’est pas (conditions.ts), les promesses sur la
 * conv (confidentialite.ts), les numéros (aide.ts), les règles que vérifient les garde-fous des articles (articles/).
 * Les garde-fous des articles (tests/aide/articles.ts) relisent tout leur texte affiché (tests/unit/pages-de-confiance.test.ts).
 * Chaque page a le jour de son dernier changement de fond (`misAJourLe`) : elle l’affiche (« Mis à jour le … », comme
 * sous un guide), le plan du site aussi (src/lib/referencement.ts). À changer avec un changement de fond de ses textes, pas pour une virgule.
 */

/** Le jour où les trois pages ont été écrites. */
const ECRITES_LE: Jour = "2026-11-03";

/**
 * L’expression d’un titre de page de confiance que son h1 met dans une bulle, comme le titre de la landing : BLUSH en
 * rose, toi (ce que tu fais) en bleu. Un morceau exact du titre, une seule fois, en mots entiers
 * (tests/unit/pages-de-confiance.test.ts) : le h1 garde le texte du titre, la bulle ne fait que l’habiller.
 */
type Surligne = { mots: string; ton: "rose" | "bleu" };

/** /a-propos : ses titres et ses phrases à elle (le reste vient des autres pages, voir l’en-tête). */
export const A_PROPOS = {
  /* Le nom court de la page : l’onglet, la barre du haut, les liens vers elle */
  court: "À propos",
  titre: "À propos de BLUSH",
  surligne: { mots: "BLUSH", ton: "rose" } satisfies Surligne,
  sous: "Ce que fait BLUSH, ce qu’il n’est pas, qui l’édite, et où nous écrire.",
  description: "BLUSH en bref\u00a0: ce qu’il fait de ta conv, ce qu’il n’est pas, qui l’édite et où nous écrire.",
  enBref: "BLUSH en bref",
  conv: "Ta conv",
  /* Les lignes sous les titres des blocs, comme sur une fiche produit : ce que le bloc montre */
  convSous: "Ce qu’elle devient, une fois importée.",
  confidentialite: "Tout le détail, sur la page Confidentialité",
  editeur: "Qui édite BLUSH",
  editeurSous: "Tiré de nos mentions légales.",
  mentions: "Les mentions légales",
  contact: "Nous écrire",
  contactSous: "Par email, ou sur notre compte officiel.",
  ecrire: "Une question, une erreur\u00a0? Écris-nous",
  plusLoin: "Pour aller plus loin",
  plusLoinSous: "Comment on écrit nos guides, et où trouver de l’aide.",
  misAJourLe: ECRITES_LE,
} as const;

/*
 * TODO(produit): /methode, à faire relire par l’avocat (plan SEO, section 6), avant sa mise en ligne. Fusionner cette
 * page sur main, c’est la publier au déploiement suivant (le plan du site, /llms.txt, le pied de la landing, la
 * signature des articles, et `publishingPrinciples` de l’éditeur sur toutes les pages) : pas de fusion avant son oui.
 * TODO(produit): les avis (la note et le nombre d’avis de testeurs) n’y sont pas, tant qu’on ne sait pas comment les
 * décrire juridiquement (comment ils ont été recueillis) ; la charte (règle 22) veut un lien vers cette page à côté d’eux.
 */
/**
 * /methode : comment un guide de BLUSH est fait, d’après la charte éditoriale et ce que vérifient ses garde-fous
 * (tests/aide/articles.ts) et le gabarit (src/components/article). Rien sur la façon dont les textes sont préparés,
 * aucun outil nommé : seulement ce que chacun peut vérifier sur une page de guide. Ce qui vient du code (le nombre de
 * sources et la pastille des exemples, que tiennent les garde-fous ; la règle des convs importées, des conditions) y est
 * lu, jamais recopié. Chaque guide est relu et validé avant d’être publié, sous la responsabilité du directeur de la
 * publication (src/contenu/mentions-legales.ts), que la page ne nomme pas : elle renvoie aux mentions légales (sa
 * ligne « Les mentions légales », sous les règles).
 * tests/unit/pages-de-confiance.test.ts vérifie que chaque article du registre a sa validation datée, sans nom de
 * relecteur, pour que la page reste vraie. Les entrées du lexique ont le même gabarit et les mêmes garde-fous : la page
 * le dit.
 */
export const METHODE = {
  court: "Notre méthode",
  titre: "Comment on écrit nos guides",
  surligne: { mots: "nos guides", ton: "rose" } satisfies Surligne,
  sous: "D’où partent les sujets, d’où viennent les exemples et les sources, comment chaque guide est relu et validé, et comment nous signaler une erreur.",
  description:
    "Comment sont faits les guides et le lexique de BLUSH\u00a0: des sujets tirés de ce que les gens cherchent, des exemples inventés, des sources datées, une relecture et une validation avant publication, et des corrections datées.",
  sections: [
    {
      id: "sujets",
      titre: "Les sujets",
      blocs: [
        "Chaque guide part d’une question que les gens tapent vraiment dans un moteur de recherche, écrite comme ils l’écrivent.",
        "Un seul terrain\u00a0: ce qui se passe dans les messages d’un crush ou d’un couple. Une réponse qui tarde, un «\u00a0vu\u00a0», un ghosting, une rupture. Ni horoscope, ni test de compatibilité.",
        "Les entrées du lexique, qui définissent les mots des convs, suivent les mêmes règles que les guides.",
      ],
    },
    {
      id: "exemples",
      titre: "Des exemples inventés",
      blocs: [
        "Les convs d’exemple de nos guides sont inventées, prénoms compris. Aucune ne vient d’une vraie personne, ni d’une conv importée sur BLUSH.",
        `Chacune porte la mention «\u00a0${EXEMPLE_INVENTE}\u00a0», et la page le redit sous ses sources.`,
      ],
    },
    {
      id: "sources",
      titre: "Des sources datées",
      blocs: [
        `Chaque guide cite de ${SOURCES.min} à ${SOURCES.max} sources, avec le jour où on les a lues\u00a0: des institutions, des études, des services d’aide, des dictionnaires.`,
        "Jamais un forum, ni le site d’un concurrent. Un chiffre sans source n’est pas publié.",
      ],
    },
    {
      id: "relecture",
      titre: "Relu et validé",
      blocs: [
        "Aucun guide n’est publié, ni changé sur le fond, sans avoir été relu puis validé, sous la responsabilité du directeur de la publication de BLUSH, nommé dans nos mentions légales.",
        "Chaque changement de fond, une fois validé, donne au guide sa date de mise à jour, sous le titre, et s’ajoute à l’historique des changements, en bas du guide.",
        "Un guide sur un sujet grave n’est publié qu’avec un expert nommé qui le relit aussi\u00a0: un psychologue ou une association.",
      ],
    },
    {
      id: "dates",
      titre: "Des dates qui disent vrai",
      blocs: [
        "Sous le titre, «\u00a0mis à jour le\u00a0» donne le jour du dernier changement de fond. Une virgule corrigée ne change pas la date.",
        "Chaque changement de fond s’ajoute, avec son jour, à l’historique en bas du guide.",
      ],
    },
    {
      id: "sensibles",
      titre: "Les sujets sensibles",
      blocs: [
        "Quand un guide touche à ce qui peut faire mal, comme une rupture ou la jalousie, il donne des numéros d’aide, tirés de la même liste que notre page d’aide.",
        "Un guide décrit des messages, jamais une personne\u00a0: aucun diagnostic, et aucune promesse sur ce que l’autre va faire.",
      ],
    },
    {
      id: "jamais",
      titre: "Ce qu’on n’écrit jamais",
      blocs: [
        [
          "Comment faire revenir quelqu’un qui est parti.",
          /* Une règle des conditions, telle quelle (QUE_TES_CONVS) : une obligation de qui importe, jamais une garantie
             technique que BLUSH donnerait */
          `Comment surveiller quelqu’un. Nos conditions te le disent\u00a0: «\u00a0${QUE_TES_CONVS}\u00a0»`,
          "Comment se venger, ou faire payer quelqu’un.",
          "Un diagnostic sur quelqu’un, d’après ses messages.",
        ],
      ],
    },
    {
      id: "blush",
      titre: "BLUSH, dans ses guides",
      blocs: ["Les guides sont publiés par BLUSH, qui vend la lecture d’une conv. Après son texte, chaque guide te propose d’importer la tienne."],
    },
    {
      id: "erreur",
      titre: "Une erreur\u00a0? Écris-nous",
      blocs: [
        `Si tu vois une erreur dans un guide, écris-nous à ${EDITEUR.email}, avec l’adresse de la page.`,
        "Si on corrige le fond, la date «\u00a0mis à jour le\u00a0» change, et la correction s’ajoute à l’historique du guide, avec son jour.",
      ],
    },
  ] satisfies readonly Section[],
  signaler: "Signaler une erreur",
  /* La ligne vers les mentions légales, où le directeur de la publication est nommé (la section « Relu et validé » y renvoie) */
  mentions: "Les mentions légales",
  mentionsSous: "L’éditeur de BLUSH et son directeur de la publication",
  misAJourLe: ECRITES_LE,
} as const;

/**
 * /aide : ses titres et ses phrases à elle. Les numéros, eux, viennent tous de src/contenu/aide.ts (GROUPES_D_AIDE), et
 * valent en France (le TODO(produit) des promesses valables en France, src/contenu/aide.ts) : la page le dit.
 */
export const PAGE_AIDE = {
  /* Le nom de la page dans tous les liens qui y mènent (les pieds de page, /a-propos, /methode) */
  court: "Numéros d’aide",
  titre: "Besoin d’en parler\u00a0?",
  surligne: { mots: "en parler", ton: "bleu" } satisfies Surligne,
  sous: "Des numéros à joindre d’un toucher, en France, si tu te sens en danger, si tu vas mal, ou selon ta situation.",
  description:
    "Les numéros à joindre en France si tu te sens en danger ou si tu vas mal\u00a0: les urgences, des lignes d’écoute et des lignes selon ta situation, chacune d’un toucher.",
  misAJourLe: ECRITES_LE,
} as const;

/**
 * Une ligne d’aide de /aide : son nom, pour qui (s’il le faut), ce qu’elle promet, son lien (tel:, sms: ou https:) et ce
 * qu’on lit. Une ligne qui s’appelle ou s’écrit (le 3018) a un second geste, la page de son tchat (`tchat`) : seul un
 * appel en a un, pour que son premier geste soit toujours « Appeler ».
 */
export type LigneDAide = { nom: string; pour?: string; detail?: string; label: string } & (
  { lien: `${"tel" | "sms" | "https"}:${string}`; tchat?: never } | { lien: `tel:${string}`; tchat: `https:${string}` }
);

/** Un groupe de /aide : son ancre, son titre, sa phrase (ce que le groupe montre), ses lignes. */
type GroupeDAide = { id: string; titre: string; texte: string; lignes: readonly LigneDAide[] };

/** Une ligne par situation de src/contenu/aide.ts, en ligne de /aide (son nom, pour qui, ce qu’elle promet, ses gestes). */
const enLigne = (l: (typeof LIGNES_PAR_SITUATION)[number]): LigneDAide => {
  const ligne = { nom: l.name, pour: l.pour, detail: l.detail, label: l.label };
  return "tchat" in l ? { ...ligne, lien: l.lien, tchat: l.tchat } : { ...ligne, lien: l.lien };
};

/**
 * Une ligne par situation qui est une urgence : la seule qui s’écrit par SMS, le 114, qui fait venir les secours
 * (src/contenu/aide.ts). /aide la montre avec les numéros d’urgence, pas avec les autres situations.
 */
const urgente = (l: (typeof LIGNES_PAR_SITUATION)[number]) => l.lien.startsWith("sms:");

/**
 * Les groupes de /aide, du plus urgent au moins urgent, chacun tiré tel quel de src/contenu/aide.ts : en danger tout de
 * suite (la phrase URGENCES, un bouton par numéro de NUMEROS_D_URGENCE, dont elle est écrite, puis le 114 par SMS, pour
 * qui ne peut pas parler à voix haute), pour parler (LIGNES_D_ECOUTE), selon ta situation (les autres
 * LIGNES_PAR_SITUATION, le 3018 avec son tchat). Une nouvelle liste d’aide.ts n’y demande qu’un groupe de plus :
 * tests/unit/pages-de-confiance.test.ts échoue tant que la page ne montre pas chacun de ses liens, une fois.
 */
export const GROUPES_D_AIDE: readonly GroupeDAide[] = [
  {
    id: "urgence",
    titre: "En danger, tout de suite",
    texte: URGENCES,
    lignes: [
      ...Object.values(NUMEROS_D_URGENCE).map((n): LigneDAide => ({ nom: `Appeler le ${n}`, lien: `tel:${n}`, label: n })),
      ...LIGNES_PAR_SITUATION.filter(urgente).map(enLigne),
    ],
  },
  {
    id: "ecoute",
    titre: "Pour parler à quelqu’un",
    texte: "Des lignes d’écoute, à appeler quand ça ne va pas.",
    lignes: LIGNES_D_ECOUTE.map((l) => ({ nom: l.name, detail: l.detail, lien: `tel:${l.tel}`, label: l.label })),
  },
  {
    id: "situation",
    titre: "Selon ta situation",
    texte: "Des lignes pour un cas précis\u00a0: chacune dit pour qui elle est.",
    lignes: LIGNES_PAR_SITUATION.filter((l) => !urgente(l)).map(enLigne),
  },
];
