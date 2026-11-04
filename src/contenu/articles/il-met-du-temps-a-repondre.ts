import type { Article } from "./types";

/* Le délai de réponse d’un crush : à partir de quand il dit quelque chose, et quoi faire. Requête visée « il met du temps à répondre que faire », zone verte. */

/** Il met du temps à répondre : à partir de quand ça veut dire quelque chose, et que faire. */
export const IL_MET_DU_TEMPS_A_REPONDRE: Article = {
  slug: "il-met-du-temps-a-repondre",
  genre: "guide",
  theme: "Les délais",
  titre: "Il met du temps à répondre\u00a0: à partir de quand ça veut dire quelque chose, et que faire",
  surligne: { situation: "met du temps", action: "que faire" },
  description:
    "Vingt minutes ou une journée\u00a0: son délai se lit face à son propre rythme, pas face à une règle. Les signes qui comptent, des exemples inventés, et quoi faire sans courir après.",
  motCle: "il met du temps à répondre que faire",
  zone: "verte",
  publieLe: "2026-11-04",
  misAJourLe: "2026-11-04",
  changements: [{ le: "2026-11-04", quoi: "Publication" }],
  valideLe: "2026-11-04",
  sources: [
    {
      titre: "Kalman, Ravid, Raban et Rafaeli, «\u00a0Are you still waiting for an answer? The Chronemics of Asynchronous Written CMC\u00a0» (Open University of Israel)",
      url: "https://www.openu.ac.il/personal_sites/download/yoram-kalman/Are-you-still-waiting-for-an-answer.pdf",
      consulteLe: "2026-11-03",
    },
    {
      titre:
        "Teichmann et al., «\u00a0How the timing of texting triggers romantic interest after the first date\u00a0», Journal of Social and Personal Relationships, 2026 (université Leuphana de Lunebourg)",
      url: "https://fis.leuphana.de/en/publications/how-the-timing-of-texting-triggers-romantic-interest-after-the-fi/",
      consulteLe: "2026-11-03",
    },
    { titre: "Le Robert, «\u00a0ghoster\u00a0»", url: "https://dictionnaire.lerobert.com/definition/ghoster", consulteLe: "2026-11-03" },
  ],
  reponseCourte:
    "Quand il met du temps à répondre, compare ce délai à son rythme à lui, pas à une règle\u00a0: chacun répond selon sa journée. Ça compte quand ses réponses ralentissent par rapport à ce rythme, raccourcissent, ou quand c’est toujours toi qui relances. Que faire\u00a0: pas de message pour combler, une seule proposition précise, puis de l’espace.",
  sections: [
    {
      question: "Combien de temps pour répondre, c’est normal\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Il n’existe pas de délai normal. Par SMS ou sur Insta, certains répondent en trente secondes, d’autres le soir en rentrant, d’autres le lendemain. Ça ne dit rien de ce qu’ils ressentent.",
        },
        {
          type: "paragraphe",
          texte:
            "Le seul repère qui tienne, c’est son habitude à lui. Une étude sur plus de 150\u00a0000 réponses en ligne le montre bien. Presque chacun y envoyait au moins 70\u00a0% de ses réponses dans son délai moyen, et presque toutes avant dix fois ce délai.",
        },
        {
          type: "paragraphe",
          texte:
            "Les chercheurs proposent même d’appeler «\u00a0silence\u00a0» une réponse qui n’arrive pas après dix fois le délai moyen. C’étaient des mails, des forums et un site de questions, d’avant les smartphones. Pas des convs de crush\u00a0: prends-le comme un ordre d’idée, pas comme une règle.",
        },
        {
          type: "paragraphe",
          texte:
            "Concrètement, s’il te répond d’habitude en vingt minutes, deux heures, c’est plus long que d’habitude sans être rare. Une journée entière, alors que vous vous écriviez tous les jours, c’est bien au-delà.",
        },
        { type: "blush", bulles: ["compare-le à lui, pas à ta pote qui répond en quatre secondes"] },
      ],
    },
    {
      question: "Pourquoi il met du temps à te répondre\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Le plus souvent, pour des raisons qui n’ont rien à voir avec toi. Il est en cours, au boulot, à l’entraînement, ou il a lu ton message entre deux choses et attend d’être posé pour répondre.",
        },
        {
          type: "paragraphe",
          texte:
            "Certains attendent d’avoir le temps de répondre vraiment, plutôt qu’en deux mots. D’autres écrivent peu, avec tout le monde\u00a0: leur lenteur est une habitude, pas un message.",
        },
        {
          type: "paragraphe",
          texte: "Et parfois, oui, il a moins envie, ou moins de place pour toi en ce moment. L’heure d’envoi ne tranche pas\u00a0; ce qu’il écrit en dit bien plus.",
        },
        {
          type: "conv",
          repliques: [
            { de: "autre", texte: "désolé je sors juste du boulot 😩" },
            { de: "autre", texte: "j’ai vu ta photo du chat ce midi, j’ai rigolé tout seul dans le métro" },
            { de: "autre", texte: "et du coup ton expo samedi, ça tient toujours\u00a0?" },
          ],
          legende: "Quatre heures plus tard, mais une vraie réponse, un détail retenu et une question\u00a0: ici, le délai vient de sa journée.",
        },
        { type: "blush", bulles: ["il répond tard mais il te pose une question\u00a0? il est dans la conv", "regarde ce qu’il y a dedans, pas l’heure d’envoi"] },
      ],
    },
    {
      question: "À partir de quand le délai veut dire quelque chose\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Le délai devient un signe quand il change. S’il répondait dans l’heure pendant vos premières semaines et qu’il met maintenant une journée, sans raison connue, c’est une information.",
        },
        {
          type: "paragraphe",
          texte:
            "Il pèse plus quand d’autres choses changent avec lui\u00a0: des messages plus courts, plus aucune question, des projets qui restent vagues. Et c’est toujours toi qui relances après un silence.",
        },
        {
          type: "conv",
          repliques: [
            { de: "moi", texte: "alors ce partiel, tu l’as eu\u00a0?" },
            { de: "moi", texte: "allô 😅" },
            { de: "autre", texte: "ouais ça va" },
          ],
          legende: "Une question, une relance, puis deux mots le lendemain, sans rien en retour\u00a0: ce n’est pas l’heure qui parle, c’est tout le reste.",
        },
        {
          type: "paragraphe",
          texte:
            "Quand plus rien ne revient du tout, ce n’est plus un délai. Le Robert a un mot pour ça, «\u00a0ghoster\u00a0»\u00a0: rompre tout contact du jour au lendemain, sans un mot d’explication.",
        },
        {
          type: "regarde",
          signes: [
            "Son délai de réponse habituel, et le tien, sur toute la conv",
            "Ce même délai sur les trois dernières semaines, face à toute la conv",
            "La semaine où ses messages ont nettement baissé, et s’il répond plus lentement depuis",
            "Qui relance quand un message reste plusieurs heures sans réponse",
            "La part de vos messages envoyés entre 22\u00a0h et 2\u00a0h du matin",
          ],
        },
        {
          type: "paragraphe",
          texte:
            "Sur des captures d’écran, les heures se lisent mal. BLUSH n’en tire alors ni délai, ni relance, ni heure du soir\u00a0: il lit ce que disent les messages, et leur longueur. Un export Instagram ou WhatsApp, lui, garde l’heure exacte de chaque message.",
        },
        { type: "blush", bulles: ["deux mots le lendemain après des semaines de longs messages, ça raconte plus que l’heure d’envoi"] },
      ],
    },
    {
      question: "Que faire quand il met du temps à répondre\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte: "D’abord, n’ajoute rien. Ton message est parti\u00a0; un deuxième ou un troisième ne le fera pas arriver plus vite, et ils changent le ton de la conv.",
        },
        {
          type: "paragraphe",
          texte:
            "Ensuite, écris une seule fois\u00a0: quand il a répondu, ou si son silence dure bien plus que d’habitude. Propose alors quelque chose de précis. Un plan avec un jour et une heure appelle un oui, un non ou une autre date, et chacune de ces réponses t’apprend quelque chose.",
        },
        {
          type: "conv",
          repliques: [
            { de: "moi", texte: "jeudi 19\u00a0h, ramen près de la fac\u00a0? 🍜" },
            { de: "autre", texte: "jeudi je peux pas, vendredi même heure\u00a0?" },
          ],
          legende: "Une proposition précise\u00a0: il en fait une autre, et tu sais où tu en es.",
        },
        {
          type: "paragraphe",
          texte:
            "Si son rythme te pèse et que vous vous connaissez assez, dis-le en parlant de toi. «\u00a0J’aime bien quand on s’écrit le soir\u00a0» passe mieux qu’un reproche sur ses minutes, et ouvre une vraie discussion.",
        },
        {
          type: "paragraphe",
          texte: "Et si rien ne revient, ce silence est une réponse aussi. Tu n’as pas à courir après quelqu’un pour qu’il te parle.",
        },
        {
          type: "pieges",
          pieges: [
            "Envoyer trois messages d’affilée pour combler le silence",
            "Le faire attendre à ton tour pour qu’il sente ce que ça fait",
            "Te repasser ton dernier message en boucle, à chercher la faute",
          ],
        },
        { type: "blush", bulles: ["un plan avec un jour et une heure, ça s’accepte ou ça se refuse", "dans les deux cas t’as ta réponse"] },
      ],
    },
  ],
  faq: [
    {
      question: "Il met des heures à répondre à mes messages, c’est mauvais signe\u00a0?",
      reponse:
        "Pas en soi. Si c’est son rythme depuis le début, ce sont ses habitudes. Regarde plutôt si ce rythme a changé, et si ses réponses ont encore quelque chose dedans\u00a0: une question, un détail, une envie de se voir.",
    },
    {
      question: "Il met plusieurs jours à répondre, ça veut dire quoi\u00a0?",
      reponse:
        "Plusieurs jours, c’est long quand vous vous écriviez tous les jours\u00a0: regarde ce qui a changé. S’il revient chaque fois avec de vraies réponses, c’est sans doute sa façon d’écrire. Si ses messages se font rares et courts, c’est un vrai changement dans la conv, et tu as le droit de ralentir aussi.",
    },
    {
      question: "Combien de temps attendre avant de répondre à un message\u00a0?",
      reponse:
        "Pas de chrono à tenir\u00a0: réponds quand tu as quelque chose à dire. Une expérience publiée en 2026 auprès de 543 personnes a comparé trois moments pour écrire après un premier rendez-vous\u00a0: le lendemain matin donnait plus envie de continuer que tout de suite ou deux jours après. D’après les chercheurs, ce qui jouait, c’était l’impression d’un intérêt réciproque et d’une personne fiable.",
    },
    {
      question: "Elle met du temps à répondre, c’est pareil\u00a0?",
      reponse:
        "Oui, ça vaut quel que soit le genre de la personne. On compare son délai à son habitude, on regarde ce qu’il y a dans ses messages, et on propose quelque chose de précis.",
    },
  ],
  lies: ["il-ne-repond-plus"],
};
