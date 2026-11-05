import type { Article } from "./types";

/*
 * Le mot « love bombing » : les signes qu’on voit dans les messages, la différence avec un vrai coup de cœur, et quoi
 * faire. Requête « love bombing signes », zone orange (le bloc d’aide dans la dernière section, aucun diagnostic sur
 * l’autre, rien qui pousse à rester), lexique.
 */

/** Love bombing : les signes dans les messages, et quoi faire. */
export const LOVE_BOMBING: Article = {
  slug: "love-bombing",
  genre: "lexique",
  theme: "Les débuts",
  titre: "Love bombing\u00a0: les signes dans les messages, et quoi faire",
  surligne: { situation: "Love bombing", action: "quoi faire" },
  description:
    "Le love bombing, c’est trop d’attention, trop vite, dès le début. Les signes qu’on voit dans les messages, un exemple inventé, la différence avec un vrai coup de cœur, et quoi faire si ça va trop vite pour toi.",
  motCle: "love bombing signes",
  zone: "orange",
  publieLe: "2026-11-18",
  misAJourLe: "2026-11-18",
  changements: [{ le: "2026-11-18", quoi: "Publication" }],
  valideLe: "2026-11-05",
  sources: [
    {
      titre: "Fil Santé Jeunes, «\u00a0Parler de love en 2024… ça dit quoi\u00a0?\u00a0»",
      url: "https://www.filsantejeunes.com/parler-de-love-en-2024-ca-dit-quoi-54134",
      consulteLe: "2026-11-04",
    },
    {
      titre: "Comment on s’aime (En avant toute(s)), «\u00a0Les bases d’une relation saine\u00a0»",
      url: "https://commentonsaime.fr/mes-relations/les-bases-dune-relation-saine/",
      consulteLe: "2026-11-04",
    },
    {
      titre: "Comment on s’aime (En avant toute(s)), «\u00a0Comment savoir quand ça va trop loin\u00a0?\u00a0»",
      url: "https://commentonsaime.fr/mes-relations/comment-savoir-quand-ca-va-trop-loin/",
      consulteLe: "2026-11-04",
    },
  ],
  reponseCourte:
    "Le love bombing, c’est quand quelqu’un te couvre d’attention dès les premiers jours\u00a0: des messages du matin au soir, des déclarations, des projets, avant même de bien te connaître. Les signes tiennent au rythme\u00a0: trop, trop vite. Quoi faire\u00a0: ralentir, garder tes proches autour de toi, et te fier à ce que tu ressens.",
  sections: [
    {
      question: "Quels sont les signes du love bombing dans les messages\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte: "Le premier signe, c’est la vitesse\u00a0: des dizaines de messages par jour, des «\u00a0je t’aime\u00a0» avant un deuxième rendez-vous.",
        },
        {
          type: "liste",
          elements: [
            "Des compliments en continu, très tôt, qui parlent plus de «\u00a0nous\u00a0» que de toi",
            "Des messages du réveil au coucher, et de la déception dès que tu tardes à répondre",
            "De grands projets à deux au bout de quelques jours",
            "L’impression de ne plus avoir le temps de réfléchir, ni de voir tes potes",
          ],
        },
        {
          type: "conv",
          repliques: [
            { de: "autre", texte: "je pense qu’à toi depuis hier soir 🥰" },
            { de: "autre", texte: "t’es la personne que j’attendais, je le sais déjà" },
            { de: "autre", texte: "cet été on part à deux, c’est décidé" },
            { de: "moi", texte: "haha on s’est vus une fois 😅" },
          ],
          legende: "Trois messages avant midi, au lendemain d’un premier rendez-vous\u00a0: c’est la vitesse qui parle.",
        },
        {
          type: "paragraphe",
          texte:
            "Fil Santé Jeunes parle de «\u00a0bombardement amoureux\u00a0»\u00a0: beaucoup d’attentions, très vite, pour que l’autre s’attache. Ensuite, elles retombent souvent.",
        },
        { type: "blush", bulles: ["des «\u00a0je t’aime\u00a0» avant le deuxième rendez-vous, c’est pas une preuve, c’est une vitesse"] },
      ],
    },
    {
      question: "Love bombing ou vrai coup de cœur\u00a0: comment faire la différence\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "La différence, c’est la place qu’il te laisse\u00a0: quelqu’un qui tient à toi accepte un «\u00a0pas ce soir\u00a0» sans te faire la tête. Un vrai coup de cœur peut être intense aussi. Si chaque limite déclenche des reproches, c’est de la pression.",
        },
        {
          type: "paragraphe",
          texte: "Le mot décrit des messages, pas une personne\u00a0: certains s’emballent sincèrement. Tu n’as pas à deviner ses intentions pour décider de ralentir.",
        },
        {
          type: "regarde",
          signes: [
            "Le volume de vos messages sur les trois dernières semaines, comparé à toute la conv",
            "La longueur des messages de chacun, mois par mois",
            "Qui écrit en premier chaque jour",
            "Le délai de réponse de chacun",
            "La part des messages envoyés entre 22\u00a0h et 2\u00a0h",
          ],
        },
        {
          type: "paragraphe",
          texte:
            "BLUSH ne colle pas l’étiquette «\u00a0love bombing\u00a0» sur ta conv\u00a0: il décrit vos messages avec des mots simples. C’est une lecture, pas un conseil. Sur des captures d’écran, sans heure exacte, il ne compte ni les délais, ni qui écrit en premier, ni les messages du soir.",
        },
        { type: "blush", bulles: ["intense, ça peut être sincère", "mais s’il boude dès que tu dis «\u00a0pas ce soir\u00a0», c’est de la pression"] },
      ],
    },
    {
      question: "Quoi faire si ça va trop vite pour toi\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Ralentis, et dis-le simplement\u00a0: tu as le droit de répondre plus tard ou de refuser un plan. Garde tes potes et ta famille dans la boucle, et montre-leur vos messages si tu doutes.",
        },
        {
          type: "conv",
          repliques: [
            { de: "moi", texte: "j’aime bien te parler, mais là ça va trop vite pour moi" },
            { de: "autre", texte: "ok pas de souci, on prend notre temps 🙂" },
          ],
          legende: "Une limite dite simplement, et une réponse qui la respecte. Des reproches à la place, ce serait une information.",
        },
        {
          type: "paragraphe",
          texte:
            "Ça devient sérieux quand l’attention se change en contrôle\u00a0: il veut savoir où tu es et avec qui, se vexe quand tu vois tes proches, ou te demande de choisir entre eux et lui. Ce n’est pas de l’amour. Parles-en tout de suite à un proche, ou à l’une des lignes d’aide en bas de cette section.",
        },
        {
          type: "paragraphe",
          texte: "Tu n’as pas à rester pour voir si ça s’arrange. Si tu es mal à l’aise, c’est une raison suffisante pour t’en aller, même après un début de rêve.",
        },
        {
          type: "pieges",
          pieges: ["Voir moins tes potes parce qu’il les trouve de trop", "Accepter un grand projet pour ne pas le décevoir", "Te justifier chaque fois que tu réponds plus tard"],
        },
        { type: "blush", bulles: ["t’as le droit d’aller doucement, et même de partir"] },
        { type: "aide" },
      ],
    },
  ],
  faq: [
    {
      question: "Love bombing puis ghosting, ça arrive\u00a0?",
      reponse: "Oui\u00a0: l’attention monte très haut, puis s’arrête net. L’emballement comme le silence parlent de sa façon de faire, pas de ce que tu vaux.",
    },
    {
      question: "Combien de temps dure le love bombing\u00a0?",
      reponse:
        "Il n’y a pas de durée fixe. Ce qui compte, c’est le moment où l’attention retombe, ou devient une pression. Regarde vos messages sur plusieurs semaines, pas sur un soir.",
    },
    {
      question: "Love bombing, ça veut dire quoi en français\u00a0?",
      reponse:
        "On parle de «\u00a0bombardement amoureux\u00a0»\u00a0: une avalanche d’attention dès le début d’une relation. Le mot vient de l’anglais «\u00a0love\u00a0», l’amour, et «\u00a0bombing\u00a0», le bombardement.",
    },
  ],
  lies: ["interesse-par-message", "il-ne-repond-plus", "ghosting", "breadcrumbing"],
};
