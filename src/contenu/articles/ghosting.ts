import type { Article } from "./types";

/* Le mot « ghosting » : ce qu’il veut dire, à partir de quand on peut l’employer, et quoi faire. Requête « ghosting c’est quoi », zone verte, lexique. */

/** Ghosting : c’est quoi, et quoi faire quand ça t’arrive. */
export const GHOSTING: Article = {
  slug: "ghosting",
  genre: "lexique",
  theme: "Les silences",
  titre: "Ghosting\u00a0: c’est quoi, et quoi faire quand ça t’arrive",
  surligne: { situation: "Ghosting", action: "quoi faire" },
  description:
    "Le ghosting, c’est quand quelqu’un disparaît de la conv du jour au lendemain, sans un mot. La définition, un exemple inventé, la différence avec un silence ou avec les miettes, et quoi faire.",
  motCle: "ghosting c’est quoi",
  zone: "verte",
  publieLe: "2026-11-05",
  misAJourLe: "2026-11-05",
  changements: [{ le: "2026-11-05", quoi: "Publication" }],
  valideLe: "2026-11-05",
  sources: [
    { titre: "Le Robert, définition de «\u00a0ghoster\u00a0»", url: "https://dictionnaire.lerobert.com/definition/ghoster", consulteLe: "2026-11-04" },
    { titre: "Fil Santé Jeunes, «\u00a0Le ghosting\u00a0»", url: "https://www.filsantejeunes.com/le-ghosting-20830", consulteLe: "2026-11-04" },
    {
      titre:
        "Navarro, Larrañaga, Yubero et Víllora, «\u00a0Ghosting and breadcrumbing: prevalence and relations with online dating behaviors among young adults\u00a0», Escritos de Psicología, 2020",
      url: "https://revistas.uma.es/index.php/espsi/article/view/9960",
      consulteLe: "2026-11-04",
    },
  ],
  reponseCourte:
    "Le ghosting, c’est quand quelqu’un disparaît de la conv du jour au lendemain, sans un mot d’explication, alors que vous vous écriviez. «\u00a0Ghost\u00a0», en anglais, c’est le fantôme. Un soir sans réponse n’en est pas un, un silence qui dure, si. Quoi faire quand ça t’arrive\u00a0: pas de relance de plus, puis tu passes à autre chose.",
  sections: [
    {
      question: "À partir de quand on peut parler de ghosting\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Quand le silence dure bien au-delà de son rythme habituel, et que rien ne l’annonçait. Un jour sans nouvelles, c’est un trou. Deux semaines de rien après des jours d’échanges, c’est autre chose.",
        },
        {
          type: "conv",
          repliques: [
            { de: "autre", texte: "grave, on refait ça vite 😄" },
            { de: "moi", texte: "ça marche, mais cette fois c’est toi qui organises 😌" },
          ],
          legende: "Sa dernière réponse est enthousiaste, et tu lui laisses l’organisation. Ensuite, plus rien pendant deux semaines, alors que vous vous écriviez chaque jour.",
        },
        {
          type: "paragraphe",
          texte:
            "Pour parler de fin, BLUSH compte les jours. Il lui faut au moins dix jours sans un mot de sa part, alors que tu lui as écrit deux fois ou plus. Dans le doute, il ne tranche pas\u00a0: sa lecture porte «\u00a0À vérifier\u00a0».",
        },
        {
          type: "regarde",
          signes: [
            "Le jour de son dernier message, et le nombre de jours écoulés depuis",
            "Tes messages restés sans réponse depuis qu’il s’est tu",
            "Ses trois dernières semaines, comparées à toute la conv",
            "La longueur de ses messages avant le silence, mois par mois",
          ],
        },
        {
          type: "paragraphe",
          texte: "Sur des captures d’écran qui ne montrent aucune date, BLUSH ne peut pas compter les jours de silence\u00a0: il le dit, au lieu de deviner.",
        },
        { type: "blush", bulles: ["un soir sans réponse, c’est un trou, pas un fantôme", "deux semaines de rien après des messages tous les jours\u00a0? là on peut en parler"] },
      ],
    },
    {
      question: "Ghosting, simple silence ou miettes\u00a0: quelle différence\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Un silence a une fin\u00a0: il était pris, puis il revient sans en faire une histoire. Le ghosting n’en a pas. La conv s’arrête là, et l’absence de réponse sert de réponse.",
        },
        {
          type: "paragraphe",
          texte: "Couper le contact pour se protéger, ce n’est pas du ghosting. Quand quelqu’un a déjà dit non et que l’autre insiste, son silence est une limite, pas une fuite.",
        },
        {
          type: "paragraphe",
          texte:
            "Les miettes, ou breadcrumbing, c’est presque l’inverse du ghosting\u00a0: il ne part jamais tout à fait. Il réapparaît par moments, avec un like ou un «\u00a0ça va toi\u00a0?\u00a0», sans jamais rien proposer.",
        },
        {
          type: "paragraphe",
          texte:
            "Le mot «\u00a0ghosting\u00a0» reste mal connu. Une étude espagnole publiée en 2020 a interrogé 626 adultes de 18 à 40 ans, et près de deux sur trois ne le connaissaient pas. Définition en main, 19\u00a0% disaient l’avoir vécu au moins une fois dans l’année.",
        },
      ],
    },
    {
      question: "Quoi faire quand quelqu’un te ghoste\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte: "Tu arrêtes de relancer. Si ton dernier message est resté sans réponse, tu as déjà posé ta question. Tu peux tourner la page sans connaître ses raisons.",
        },
        {
          type: "conv",
          repliques: [{ de: "moi", texte: "j’ai toujours pas trouvé quelqu’un capable de me battre au baby-foot 😏" }],
          legende: "Une perche simple, restée sans réponse depuis une semaine. Elle suffit\u00a0: un message de plus ne t’apprendrait rien.",
        },
        {
          type: "paragraphe",
          texte:
            "Ghoster, c’est souvent fuir une conversation gênante. Son silence parle de sa façon de gérer le malaise, pas de ce que tu vaux. Si ça te pèse trop, parles-en à quelqu’un de confiance.",
        },
        {
          type: "paragraphe",
          texte: "BLUSH suit la même ligne\u00a0: face à quelqu’un qui ne répond plus, il ne t’aidera pas à insister. Pas de relance en plus, mais de quoi passer à la suite.",
        },
        {
          type: "pieges",
          pieges: ["Lui écrire chaque jour pour arracher une réponse", "Demander à ses potes ce qui se passe", "Passer tes soirées sur son profil pour comprendre"],
        },
        { type: "blush", bulles: ["pas de relance de plus\u00a0: tu poses le téléphone et tu passes à autre chose", "son silence parle de lui, pas de toi"] },
      ],
    },
  ],
  faq: [
    {
      question: "Pourquoi il m’a ghostée\u00a0?",
      reponse:
        "Le plus souvent pour éviter une discussion qui le gêne\u00a0: dire non en face, ou dire qu’il n’a plus envie. Sans un mot de sa part, tu ne le sauras pas, et tu n’en as pas besoin pour avancer.",
    },
    {
      question: "Le ghosting en amitié, ça existe\u00a0?",
      reponse:
        "Oui\u00a0: une amie qui ne répond plus du tout, du jour au lendemain, sans dispute ni explication. Ça peut faire aussi mal qu’en amour, et la même règle vaut\u00a0: pas de relance de plus, et tu cesses d’attendre.",
    },
    {
      question: "Ghoster, ça se dit comment en français\u00a0?",
      reponse:
        "En français, on dit «\u00a0faire le mort\u00a0». Le Robert donne aussi «\u00a0ghoster\u00a0», un anglicisme familier, avec l’exemple «\u00a0Je me suis fait ghoster\u00a0».",
    },
  ],
  lies: ["il-ne-repond-plus", "il-voit-mes-messages", "il-met-du-temps-a-repondre"],
};
