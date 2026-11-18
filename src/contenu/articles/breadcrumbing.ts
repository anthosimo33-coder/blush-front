import type { Article } from "./types";

/* Le mot « breadcrumbing » : les miettes, ce qu’elles donnent dans une conv, et comment réagir. Requête « breadcrumbing c’est quoi », zone verte, lexique. */

/** Breadcrumbing : c’est quoi, ces miettes qu’il te laisse, et comment réagir. */
export const BREADCRUMBING: Article = {
  slug: "breadcrumbing",
  genre: "lexique",
  theme: "Les miettes",
  titre: "Breadcrumbing\u00a0: c’est quoi, ces miettes qu’il te laisse, et comment réagir",
  surligne: { situation: "Breadcrumbing", action: "comment réagir" },
  description:
    "Le breadcrumbing, ce sont les miettes\u00a0: des messages espacés, juste assez pour que tu attendes, jamais assez pour avancer. La définition, un exemple inventé, la différence avec le ghosting, et comment réagir.",
  motCle: "breadcrumbing c’est quoi",
  zone: "verte",
  publieLe: "2026-11-18",
  misAJourLe: "2026-11-18",
  changements: [{ le: "2026-11-18", quoi: "Publication" }],
  valideLe: "2026-11-18",
  sources: [
    {
      titre: "Fil Santé Jeunes, «\u00a0Parler de love en 2024… ça dit quoi\u00a0?\u00a0»",
      url: "https://www.filsantejeunes.com/parler-de-love-en-2024-ca-dit-quoi-54134",
      consulteLe: "2026-11-04",
    },
    {
      titre:
        "Navarro, Larrañaga, Yubero et Víllora, «\u00a0Ghosting and breadcrumbing: prevalence and relations with online dating behaviors among young adults\u00a0», Escritos de Psicología, 2020",
      url: "https://revistas.uma.es/index.php/espsi/article/view/9960",
      consulteLe: "2026-11-04",
    },
    {
      titre:
        "Navarro, Larrañaga, Yubero et Víllora, «\u00a0Psychological Correlates of Ghosting and Breadcrumbing Experiences: A Preliminary Study among Adults\u00a0», International Journal of Environmental Research and Public Health, 2020",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7037474/",
      consulteLe: "2026-11-04",
    },
  ],
  reponseCourte:
    "Le breadcrumbing, c’est quand quelqu’un te laisse des miettes\u00a0: un «\u00a0coucou\u00a0» après trois semaines, un cœur sur ta story, un «\u00a0on se voit bientôt\u00a0», sans jamais rien de concret. Juste assez pour que tu l’attendes, jamais assez pour avancer. Le mot vient de l’anglais «\u00a0breadcrumb\u00a0», la miette de pain. Pour réagir\u00a0: demande-lui quand, et regarde s’il pose un jour.",
  sections: [
    {
      question: "À quoi ressemblent les miettes dans une conv\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "À des messages qui reviennent par petites touches, souvent après des jours de silence, comme si de rien n’était. Il relance la conv, parfois tard le soir, puis disparaît de nouveau.",
        },
        {
          type: "paragraphe",
          texte: "Le signe le plus net\u00a0: rien ne se concrétise. Il parle de se voir, mais ne pose jamais de date, même quand tu lui renvoies la balle.",
        },
        {
          type: "conv",
          repliques: [
            { de: "autre", texte: "hey toi 👀 ça fait longtemps" },
            { de: "moi", texte: "hello\u00a0! ça va, et toi\u00a0?" },
            { de: "autre", texte: "trop bien, faut qu’on se voie un de ces jours" },
          ],
          legende: "Il revient après trois semaines de silence, avec un «\u00a0un de ces jours\u00a0» sans date. Puis plus rien, jusqu’à la prochaine fois.",
        },
        { type: "blush", bulles: ["«\u00a0faut qu’on se voie\u00a0» sans date, c’est une miette, pas un plan"] },
      ],
    },
    {
      question: "Quelle différence entre le breadcrumbing et le ghosting\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Celui qui ghoste disparaît pour de bon. Celui qui laisse des miettes ne part jamais tout à fait\u00a0: il garde le lien ouvert, sans rien y mettre. C’est ce qui les rend si dures à lâcher, il y a toujours un prochain message possible.",
        },
        {
          type: "paragraphe",
          texte:
            "Le mot est peu connu, la chose courante. Une étude espagnole publiée en 2020 a interrogé 626 adultes de 18 à 40 ans\u00a0: 86\u00a0% ne connaissaient pas le mot. Une fois la définition lue, 36\u00a0% disaient en avoir reçu au moins une fois dans l’année, et à peu près autant en avoir laissé à quelqu’un.",
        },
        {
          type: "paragraphe",
          texte:
            "La même équipe a comparé leur moral. Ceux qui en avaient reçu au moins trois fois dans l’année se déclaraient moins contents de leur vie, plus seuls et plus impuissants. C’est un lien observé, pas la preuve que les miettes en sont la cause.",
        },
      ],
    },
    {
      question: "Comment réagir au breadcrumbing\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Change de question\u00a0: au lieu de te demander ce qu’il ressent, regarde s’il passe aux actes. Quand il parle de se voir, renvoie-lui la balle\u00a0: c’est à lui de poser un jour. Si vous êtes deux garçons, propose toi-même, avec un jour et une heure\u00a0: une miette tient mal face à un vrai plan.",
        },
        {
          type: "conv",
          repliques: [
            { de: "autre", texte: "on se capte bientôt promis 😘" },
            { de: "moi", texte: "bientôt c’est quand\u00a0? 😏" },
            { de: "autre", texte: "ah cette semaine c’est chaud, je te redis" },
          ],
          legende: "La balle renvoyée, une réponse floue\u00a0: une fois, ça arrive. Deux fois de suite, c’est une réponse.",
        },
        {
          type: "paragraphe",
          texte:
            "S’il pose un jour et qu’il vient, tant mieux. S’il esquive, ne choisis pas la date pour lui. S’il revient encore sans date, tu n’as pas à rester disponible pour la prochaine miette.",
        },
        {
          type: "regarde",
          signes: [
            "Qui écrit en premier, jour après jour",
            "Qui relance la conv quand elle s’était tue depuis douze heures",
            "Qui propose de se voir, et qui ne fait que répondre",
            "La part de ses messages envoyés entre 22\u00a0h et 2\u00a0h",
            "Les mots qui reviennent le plus souvent dans la conv",
          ],
        },
        {
          type: "paragraphe",
          texte:
            "Sur des captures d’écran, BLUSH ne garde pas l’heure exacte de chaque message. Il les lit en entier, mais sans compter qui ouvre la journée, qui reprend la conv ni la part du soir. Ces trois mesures demandent un export Instagram ou WhatsApp.",
        },
        {
          type: "pieges",
          pieges: ["Répondre dans la seconde à chaque miette", "Accepter des «\u00a0on verra\u00a0» à la place d’un plan", "Rendre la pareille en soufflant le chaud et le froid"],
        },
        { type: "blush", bulles: ["«\u00a0bientôt\u00a0» c’est quand\u00a0? s’il trouve jamais de jour, c’est ta réponse"] },
      ],
    },
  ],
  faq: [
    {
      question: "Pourquoi il fait du breadcrumbing\u00a0?",
      reponse:
        "Souvent parce qu’il aime l’attention sans vouloir s’engager, ou qu’il te garde de côté au cas où. Tu ne peux pas lire dans sa tête, mais tu peux lire ce qu’il fait, et ce qu’il ne fait pas.",
    },
    {
      question: "Breadcrumbing, ça se dit comment en français\u00a0?",
      reponse:
        "On parle de «\u00a0miettes\u00a0», d’après l’anglais «\u00a0breadcrumbs\u00a0», les miettes de pain qu’on sème derrière soi. Fil Santé Jeunes propose aussi «\u00a0émiettage\u00a0».",
    },
    {
      question: "Comment faire la différence entre des miettes et de la timidité\u00a0?",
      reponse:
        "Quelqu’un de timide finit par poser un jour, même maladroitement, et il vient. Celui qui laisse des miettes reste dans le flou, une fois, puis deux. Lui renvoyer la balle, sans lui courir après, reste le moyen le plus simple de savoir.",
    },
  ],
  lies: ["il-ne-repond-plus", "interesse-par-message", "ghosting", "love-bombing"],
};
