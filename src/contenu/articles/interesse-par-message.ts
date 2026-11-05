import type { Article } from "./types";

/* La page pilier : les signes d’intérêt qui se lisent dans une conv, ceux qui comptent moins, et quoi faire. Requête « comment savoir si un mec est intéressé par message », zone verte. */

/** Comment savoir s’il est intéressé par message : les signes qu’on voit dans une conv. */
export const INTERESSE_PAR_MESSAGE: Article = {
  slug: "interesse-par-message",
  genre: "guide",
  theme: "Les signes",
  titre: "Comment savoir s’il est intéressé par message\u00a0: les signes qu’on voit dans une conv",
  surligne: { situation: "intéressé", action: "Comment savoir" },
  description:
    "Qui écrit en premier, qui pose des questions, qui parle de se voir\u00a0: les signes d’intérêt qui se lisent vraiment dans une conv, ceux qui comptent moins qu’on ne le croit, et quoi faire. Avec des convs d’exemple inventées.",
  motCle: "comment savoir si un mec est intéressé par message",
  zone: "verte",
  publieLe: "2026-11-05",
  misAJourLe: "2026-11-05",
  changements: [{ le: "2026-11-05", quoi: "Publication" }],
  valideLe: "2026-11-05",
  sources: [
    {
      titre:
        "Association for Psychological Science, «\u00a0Asking Questions Increases Likability\u00a0», 14 juillet 2017 (sur l’étude de Huang, Yeomans, Brooks, Minson et Gino, Journal of Personality and Social Psychology, 2017)",
      url: "https://www.psychologicalscience.org/news/minds-business/asking-questions-increases-likability.html",
      consulteLe: "2026-11-04",
    },
    {
      titre: "Kalman, Ravid, Raban et Rafaeli, «\u00a0Are you still waiting for an answer? The Chronemics of Asynchronous Written CMC\u00a0» (Open University of Israel)",
      url: "https://www.openu.ac.il/personal_sites/download/yoram-kalman/Are-you-still-waiting-for-an-answer.pdf",
      consulteLe: "2026-11-04",
    },
  ],
  reponseCourte:
    "Pour savoir s’il est intéressé par message, regarde ce qu’il fait sans que tu le lui demandes. S’il l’est, il écrit en premier, pose des questions, rebondit sur tes réponses, retient tes détails et parle de se voir. Un signe seul ne prouve rien\u00a0: c’est leur somme, semaine après semaine, qui parle.",
  sections: [
    {
      question: "Quels sont les signes qu’il est intéressé par message\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Les signes qui comptent lui demandent un effort\u00a0: écrire en premier, relancer, rebondir, proposer de se voir. Répondre, tout le monde le fait, ne serait-ce que par politesse.",
        },
        {
          type: "liste",
          elements: [
            "Il écrit en premier, sans attendre ton message pour se manifester.",
            "Il relance la conv quand elle s’endort, même après une journée de calme.",
            "Il pose des questions sur toi, et rebondit sur tes réponses.",
            "Il se souvient de tes détails\u00a0: ton entretien, le prénom de ta pote, ta série du moment.",
            "Il parle aussi de lui\u00a0: sa journée, ses galères, ce qui le fait rire.",
            "Il parle de se voir, ou il saisit l’occasion quand tu en glisses une.",
          ],
        },
        {
          type: "paragraphe",
          texte:
            "Les questions qui rebondissent valent plus qu’un «\u00a0et toi\u00a0?\u00a0» de réflexe. En 2017, des chercheurs de Harvard ont fait discuter 430 personnes par chat, quinze minutes, pour faire connaissance. Celles qui devaient poser beaucoup de questions semblaient plus à l’écoute, et leur partenaire les appréciait davantage.",
        },
        {
          type: "paragraphe",
          texte: "Ce n’étaient pas des crushs, mais l’idée tient\u00a0: une question de suivi montre qu’il a lu ta réponse jusqu’au bout.",
        },
        {
          type: "conv",
          repliques: [
            { de: "autre", texte: "alors, cet entretien pour le job\u00a0?" },
            { de: "moi", texte: "on m’a demandé mon pire défaut, j’ai dit perfectionniste 😅" },
            { de: "autre", texte: "perfectionniste, le grand classique 😂 ils te rappellent quand\u00a0?" },
          ],
          legende: "Il se souvient de ton entretien, rebondit sur ta réponse, puis relance avec une question\u00a0: trois signes en trois messages.",
        },
        { type: "blush", bulles: ["il se souvient de ton entretien et il rebondit\u00a0? il fait plus que répondre, là"] },
      ],
    },
    {
      question: "Comment savoir s’il est intéressé ou juste gentil\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Un garçon gentil répond, un garçon intéressé fait avancer la conv. La politesse, ce sont des réponses correctes qui ne mènent nulle part\u00a0: il répond, puis la conv s’arrête là.",
        },
        {
          type: "paragraphe",
          texte:
            "L’intérêt se voit à ce qu’il ajoute\u00a0: une question de plus, une blague qui prolonge la tienne, une idée pour la suite. Il te laisse toujours une raison de lui répondre.",
        },
        {
          type: "paragraphe",
          texte:
            "Un pote aussi peut écrire en premier et poser des questions. Avec un crush, le ton change\u00a0: il te taquine, il te fait des compliments. Et il cherche à te voir à deux, pas seulement en groupe.",
        },
        {
          type: "conv",
          repliques: [
            { de: "moi", texte: "j’ai enfin regardé le film dont tu m’avais parlé" },
            { de: "autre", texte: "ah cool, il t’a plu\u00a0?" },
            { de: "moi", texte: "trop\u00a0! la fin m’a complètement retournée" },
            { de: "autre", texte: "ouais elle est bien 👍" },
          ],
          legende: "Une question polie, puis plus rien à quoi répondre. Un soir, ça ne dit rien\u00a0; si toute la conv ressemble à ça, c’est plutôt de la politesse.",
        },
        {
          type: "paragraphe",
          texte:
            "Regarde surtout qui porte la conv sur plusieurs semaines. Si c’est toujours toi qui écris en premier, qui relances et qui poses les questions, il suit plus qu’il ne participe.",
        },
        {
          type: "paragraphe",
          texte:
            "Certains timides répondent court au début, puis s’ouvrent peu à peu. Ce qui compte, c’est la direction\u00a0: des messages qui s’allongent, des questions qui arrivent.",
        },
        { type: "blush", bulles: ["il répond toujours mais il relance jamais\u00a0? c’est poli, pas encore de l’intérêt"] },
      ],
    },
    {
      question: "Quels signes veulent dire moins qu’on ne le croit\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Sa vitesse de réponse, ses emojis, un like ou ses messages tard le soir rassurent sans rien prouver. Ils dépendent de sa façon d’écrire avec tout le monde, pas de ce qu’il ressent pour toi.",
        },
        {
          type: "liste",
          elements: [
            "Sa vitesse de réponse\u00a0: certains répondent dans la minute à tout le monde, d’autres seulement le soir.",
            "Les emojis et les cœurs\u00a0: certains en mettent partout, d’autres jamais, même quand ils sont à fond.",
            "Un like ou une story vue\u00a0: un geste d’une seconde, qui ne demande pas de t’écrire.",
            "Les messages tard le soir\u00a0: ils disent surtout à quelle heure il a du temps.",
            "Un surnom ou un «\u00a0haha\u00a0»\u00a0: ça donne le ton, pas la suite.",
          ],
        },
        {
          type: "paragraphe",
          texte:
            "Pour la vitesse, compare-le à lui-même, pas aux autres. Une étude sur des mails et des forums des années 2000 va dans ce sens. Au moins 70\u00a0% des réponses y arrivaient dans le délai moyen de leur auteur. Ce n’étaient pas des crushs\u00a0: c’est un repère, pas une preuve.",
        },
        {
          type: "paragraphe",
          texte:
            "Et s’il t’écrit tous les jours sans jamais parler de se voir\u00a0? Il aime parler avec toi, c’est déjà ça. Pour savoir s’il veut plus, regarde ce qu’il fait quand une occasion se présente.",
        },
        { type: "blush", bulles: ["un cœur rouge à minuit, c’est mignon", "un «\u00a0samedi 16h\u00a0?\u00a0», ça c’est une info"] },
      ],
    },
    {
      question: "Comment BLUSH lit l’intérêt dans une conv\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "BLUSH regarde qui fait les efforts, de ton côté et du sien. Quand les messages sont datés, il compare aussi les trois dernières semaines au reste de la conv. Il voit ainsi si l’intérêt monte ou retombe.",
        },
        {
          type: "regarde",
          signes: [
            "Qui ouvre la journée le plus souvent, toi ou lui",
            "Qui reprend la conv quand elle s’est tue douze heures ou plus",
            "Qui écrit à nouveau quand son message attend depuis trois heures",
            "Qui répond le plus vite, d’après le délai médian de chacun",
            "Combien de mots chacun met dans ses messages, de mois en mois",
            "Qui propose, qui pose des questions, qui se livre, lu dans les messages eux-mêmes",
          ],
        },
        {
          type: "paragraphe",
          texte:
            "Sur un export Instagram ou WhatsApp, chaque message garde son heure exacte, et les quatre premiers signes se comptent. Le rapport les montre en scores, comme «\u00a0Qui ouvre la journée\u00a0» ou «\u00a0Qui relance sans réponse\u00a0».",
        },
        {
          type: "paragraphe",
          texte:
            "Sur des captures d’écran, l’heure de chaque message n’est qu’approchée. BLUSH ne compte alors ni qui ouvre, ni qui relance, ni les délais. Il s’en tient aux mots échangés et à leur longueur.",
        },
        {
          type: "paragraphe",
          texte:
            "Le verdict de BLUSH dit si c’est réciproque, s’il ne manque qu’un pas, s’il hésite ou si ça s’éteint. Une étiquette donne sa confiance dans cette lecture\u00a0: «\u00a0Sûr\u00a0», «\u00a0Probable\u00a0» ou «\u00a0À vérifier\u00a0».",
        },
        { type: "blush", bulles: ["sur un export, je compte qui fait le premier pas, jour après jour", "sur des captures, je lis les mots, pas les heures"] },
      ],
    },
    {
      question: "Comment savoir où il en est, sans lui courir après\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Donne-lui une occasion simple de montrer son intérêt, puis regarde ce qu’il en fait. Une perche marche bien\u00a0: tu parles d’un endroit, d’un film ou d’une expo, sans rien lui demander.",
        },
        {
          type: "paragraphe",
          texte:
            "S’il est intéressé, il la saisit souvent de lui-même, et c’est lui qui fixe le jour. S’il répond «\u00a0ah trop bien\u00a0» et change de sujet, une fois ne dit rien\u00a0; trois fois, si.",
        },
        {
          type: "conv",
          repliques: [
            { de: "moi", texte: "la patinoire rouvre samedi, trop envie d’y retourner ⛸️" },
            { de: "autre", texte: "moi je tiens pas debout sur des patins 😂" },
            { de: "autre", texte: "samedi 16h, tu m’apprends\u00a0?" },
          ],
          legende: "Une perche, pas une invitation\u00a0: il la saisit, et c’est lui qui pose le jour et l’heure.",
        },
        {
          type: "paragraphe",
          texte:
            "Évite aussi de lui demander où il en est, ou de te déclarer la première. Tant qu’il n’a fait aucun pas, ça te met à découvert pour rien\u00a0: s’il est intéressé, la perche lui suffit.",
        },
        {
          type: "paragraphe",
          texte:
            "Et si rien ne vient, ni plan, ni question, ni premier message\u00a0? Ce silence te dit déjà quelque chose. Tu as mieux à faire que de décrypter quelqu’un qui ne fait aucun pas vers toi.",
        },
        {
          type: "pieges",
          pieges: [
            "Le faire attendre exprès pour tester son intérêt",
            "Chercher à le rendre jaloux pour voir s’il réagit",
            "Passer chaque message à la loupe pour y trouver un sens caché",
          ],
        },
        { type: "blush", bulles: ["tu tends une perche, et tu regardes s’il l’attrape", "s’il pose lui-même le jour et l’heure, t’as ta réponse"] },
      ],
    },
  ],
  faq: [
    {
      question: "Il me pose peu de questions, ça veut dire qu’il n’est pas intéressé\u00a0?",
      reponse:
        "Pas forcément\u00a0: certains sont timides, ou mal à l’aise à l’écrit. Regarde s’il montre son intérêt autrement, en écrivant en premier ou en parlant de se voir. S’il ne fait rien de tout ça, la conv repose sur toi.",
    },
    {
      question: "Comment savoir s’il est amoureux par message\u00a0?",
      reponse:
        "Par message, on voit surtout de l’intérêt\u00a0; l’amour se lit plutôt dans la durée. Un garçon très attaché revient vers toi, tient ce qu’il propose et veut te voir. Les mots doux comptent moins que cette constance.",
    },
    {
      question: "Comment savoir si un mec est sincère par SMS\u00a0?",
      reponse:
        "Compare ce qu’il écrit à ce qu’il fait. S’il parle de se voir et que le jour finit par arriver, ses messages sont fiables. S’il promet souvent sans jamais rien fixer, crois les actes plutôt que les mots.",
    },
    {
      question: "Comment savoir si je lui plais par message, sans s’être encore vus\u00a0?",
      reponse:
        "Les mêmes signes comptent, plus un\u00a0: il a envie de sortir du chat, pour un appel ou un café. S’il garde tout dans les messages pendant des semaines, ça lui suffit peut-être. Pour une première fois, mieux vaut un appel vidéo d’abord, un endroit avec du monde, et une amie prévenue.",
    },
  ],
  lies: ["il-met-du-temps-a-repondre", "il-ne-repond-plus", "il-voit-mes-messages"],
};
