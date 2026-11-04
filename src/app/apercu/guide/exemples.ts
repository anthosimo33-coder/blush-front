import type { Article, Jour } from "@/contenu/articles/types";

/*
 * Deux articles d’exemple pour les aperçus de l’équipe (/apercu/guide, /apercu/lexique, hors de Vercel seulement) : le
 * vrai gabarit sur un texte INVENTÉ, jamais publié (il n’est pas dans le registre, src/contenu/articles). Ni validé (un
 * jour de validation qui n’existe pas), ni sourcé (des adresses d’exemple, example.com) : un vrai article a sa validation
 * datée et ses sources, et les garde-fous de tests/unit/articles.test.ts le refuseraient sans elles. Les règles de
 * marque, elles, valent aussi ici (le même test les vérifie). Le guide est en zone verte ; l’entrée du lexique en zone
 * orange, pour montrer le bloc d’aide.
 */

/** Le jour de validation d’un exemple : aucun, un jour qui n’existe pas (jamais validé, les garde-fous refuseraient de le publier). */
const JAMAIS_VALIDE: Jour = "0000-00-00";

/** Des sources d’exemple, à remplacer par de vraies sources datées. */
const SOURCES_D_EXEMPLE = [
  { titre: "Source d’exemple n°\u00a01 (à remplacer par une vraie source)", url: "https://example.com/source-1", consulteLe: "2026-11-03" },
  { titre: "Source d’exemple n°\u00a02 (à remplacer par une vraie source)", url: "https://example.com/source-2", consulteLe: "2026-11-03" },
] as const;

/** Le guide d’exemple : un délai de réponse, et à partir de quand il dit quelque chose. */
export const GUIDE_D_EXEMPLE: Article = {
  slug: "il-met-du-temps-a-repondre",
  genre: "guide",
  theme: "Les délais",
  titre: "Il met du temps à répondre\u00a0: à partir de quand ça veut dire quelque chose, et quoi faire",
  surligne: { situation: "met du temps", action: "quoi faire" },
  description:
    "Un délai de réponse seul ne dit pas grand-chose. Ce qui compte, c’est un rythme qui change, qui relance, et ce qu’il y a dans les messages. Avec des exemples inventés.",
  motCle: "il met du temps à répondre",
  zone: "verte",
  publieLe: "2026-11-03",
  misAJourLe: "2026-11-03",
  changements: [{ le: "2026-11-03", quoi: "Publication (exemple)" }],
  valideLe: JAMAIS_VALIDE,
  sources: SOURCES_D_EXEMPLE,
  reponseCourte:
    "Un délai seul ne veut presque rien dire\u00a0: les gens répondent selon leur journée, leur téléphone et leur façon d’écrire. Ça commence à vouloir dire quelque chose quand son rythme change sans raison, quand c’est toujours toi qui relances, ou quand ses réponses raccourcissent en même temps.",
  sections: [
    {
      question: "Combien de temps, c’est long\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte: "Il n’y a pas de durée normale. Une personne répond en deux minutes, une autre le soir, une autre le lendemain, et toutes peuvent tenir à toi.",
        },
        { type: "paragraphe", texte: "Le bon repère, c’est son propre rythme. Compare ses réponses d’aujourd’hui à celles de vos premières semaines, pas à celles de tes potes." },
        { type: "blush", bulles: ["il répond vite le soir et jamais le matin\u00a0? c’est un rythme, pas un verdict"] },
      ],
    },
    {
      question: "Quand est-ce que le délai veut dire quelque chose\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte: "Le délai compte quand il change sans raison. Une personne qui répondait dans l’heure et qui met maintenant deux jours, c’est une information.",
        },
        { type: "paragraphe", texte: "Il compte aussi quand d’autres signes vont avec\u00a0: des réponses plus courtes, moins de questions, et c’est toujours toi qui relances." },
        {
          type: "conv",
          repliques: [
            { de: "autre", texte: "dsl je viens de voir 😅" },
            { de: "moi", texte: "t’inquiète\u00a0! t’as passé une bonne journée\u00a0?" },
            { de: "autre", texte: "oui tranquille" },
          ],
          legende: "Une réponse tardive, courte et sans question en retour\u00a0: c’est l’ensemble qui parle, pas l’heure.",
        },
        {
          type: "regarde",
          signes: [
            "Le délai de ses réponses, comparé à vos débuts",
            "Qui écrit en premier, et qui relance après un silence",
            "Les questions qu’on te pose, ou qu’on ne te pose plus",
            "La longueur des messages, des deux côtés",
            "Les heures où vous vous écrivez",
          ],
        },
      ],
    },
    {
      question: "Et s’il lit sans répondre\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte: "Lire sans répondre tout de suite, c’est souvent lire au mauvais moment. On ouvre un message dans le bus, on se dit qu’on répondra plus tard, et on oublie.",
        },
        {
          type: "paragraphe",
          texte: "Ça devient un signe quand ça se répète et que tes messages restent sans suite. Si plus rien ne revient du tout, c’est ce qu’on appelle le ghosting.",
        },
        {
          type: "conv",
          repliques: [
            { de: "moi", texte: "on se fait toujours ce ciné jeudi\u00a0?" },
            { de: "autre", texte: "ah mince j’avais zappé, je te redis" },
          ],
          legende: "Ni oui ni non\u00a0: une réponse qui laisse la porte entrouverte, sans rien proposer.",
        },
        { type: "blush", bulles: ["un «\u00a0je te redis\u00a0» sans date, c’est rarement un oui", "propose un jour et une heure, et regarde ce qui revient"] },
      ],
    },
    {
      question: "Qu’est-ce que tu peux faire\u00a0?",
      blocs: [
        { type: "paragraphe", texte: "Tu peux écrire une fois, clairement, avec une proposition précise. Un plan avec un jour et une heure appelle une vraie réponse." },
        { type: "paragraphe", texte: "Ensuite, laisse de l’espace. Si rien ne revient, ce silence est déjà une réponse, et tu n’as pas à courir après." },
        {
          type: "pieges",
          pieges: [
            "Envoyer trois messages d’affilée pour remplir le silence",
            "Compter les minutes et lui reprocher son délai",
            "Copier son délai pour lui faire sentir ce que ça fait",
          ],
        },
      ],
    },
  ],
  faq: [
    {
      question: "Il met trois jours à répondre, est-ce qu’il s’en fiche\u00a0?",
      reponse:
        "Pas forcément. Trois jours, c’est long s’il répond d’habitude le jour même, et c’est normal si vous vous écrivez toujours comme ça. Regarde surtout si le rythme a changé et si la conv avance.",
    },
    {
      question: "Est-ce que je dois attendre avant de répondre\u00a0?",
      reponse: "Non. Réponds quand tu as envie de répondre. Jouer la montre installe un jeu où personne ne sait plus ce que l’autre pense.",
    },
    {
      question: "Il répond vite mais ne relance jamais, ça veut dire quoi\u00a0?",
      reponse: "Ça peut être de la timidité, ou un intérêt poli. Une question de temps en temps, ou une proposition, aide à faire la différence.",
    },
  ],
  lies: ["ghosting"],
};

/** L’entrée du lexique d’exemple : le ghosting, en zone orange (le bloc d’aide en bas de section). */
export const ENTREE_D_EXEMPLE: Article = {
  slug: "ghosting",
  genre: "lexique",
  theme: "Les silences",
  titre: "Ghosting\u00a0: ce que ça veut dire, et quoi faire",
  surligne: { situation: "Ghosting", action: "quoi faire" },
  description:
    "Le ghosting, c’est quand une personne arrête de te répondre du jour au lendemain, sans rien dire. La définition, un exemple inventé, et la différence avec un simple silence.",
  motCle: "ghosting",
  zone: "orange",
  publieLe: "2026-11-03",
  misAJourLe: "2026-11-03",
  changements: [{ le: "2026-11-03", quoi: "Publication (exemple)" }],
  valideLe: JAMAIS_VALIDE,
  sources: SOURCES_D_EXEMPLE,
  reponseCourte:
    "Le ghosting, c’est quand une personne avec qui tu parlais arrête de te répondre du jour au lendemain, sans explication. Elle ne dit pas non, elle disparaît. Ça fait souvent plus mal qu’un refus, parce que tu restes sans réponse et que tu cherches ce que tu as mal fait.",
  sections: [
    {
      question: "Comment savoir si c’est du ghosting\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "On parle de ghosting quand le silence dure et que rien ne l’annonçait. Un message sans réponse ne suffit pas\u00a0; une semaine sans nouvelles après des jours à s’écrire, oui.",
        },
        {
          type: "conv",
          repliques: [
            { de: "moi", texte: "trop bien hier soir 😊" },
            { de: "moi", texte: "on remet ça samedi\u00a0?" },
          ],
          legende: "Lu mardi. Toujours rien le dimanche suivant.",
        },
        { type: "blush", bulles: ["un message sans réponse, c’est un silence", "une semaine de rien après des jours à s’écrire, c’est un ghosting"] },
      ],
    },
    {
      question: "Quelle différence avec le breadcrumbing\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Dans le ghosting, la personne disparaît. Dans le breadcrumbing, elle reste juste assez pour que tu l’attendes\u00a0: un like, une story vue, un message de temps en temps, sans jamais rien proposer.",
        },
      ],
    },
    {
      question: "Qu’est-ce que tu peux faire\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte: "Tu peux envoyer un dernier message simple, sans reproche, puis t’arrêter là. Tu n’as pas besoin d’une explication pour passer à autre chose.",
        },
        {
          type: "regarde",
          signes: ["Le moment où les réponses ont ralenti, puis cessé", "Qui posait les questions, avant le silence", "Les plans proposés, et ceux restés sans suite"],
        },
        {
          type: "pieges",
          pieges: ["Écrire tous les jours pour forcer une réponse", "Guetter ses stories pour comprendre ce qui se passe", "Te demander pendant des jours ce que tu as mal fait"],
        },
        { type: "aide" },
      ],
    },
  ],
  faq: [
    {
      question: "Est-ce que le ghosting veut dire que c’est fini\u00a0?",
      reponse: "Le plus souvent, oui\u00a0: un silence qui dure est une façon de s’éloigner. Rien ne t’oblige à attendre un changement d’avis.",
    },
    {
      question: "Pourquoi les gens ghostent\u00a0?",
      reponse: "Souvent pour éviter une conversation difficile. Ça dit plus de leur façon de gérer le malaise que de ta valeur.",
    },
  ],
  lies: ["il-met-du-temps-a-repondre"],
};

/** Les deux exemples, comme un petit registre : leurs liens se retrouvent entre eux (liesDe). */
export const EXEMPLES: readonly Article[] = [GUIDE_D_EXEMPLE, ENTREE_D_EXEMPLE];

/**
 * Le guide d’exemple en zone orange (/apercu/guide?zone=orange) : le même texte, avec le bloc d’aide au bout de sa
 * dernière section, là où un guide orange le pose. Pour voir le gabarit de cette zone, rien de plus.
 */
export const GUIDE_ORANGE_D_EXEMPLE: Article = {
  ...GUIDE_D_EXEMPLE,
  zone: "orange",
  sections: GUIDE_D_EXEMPLE.sections.map((s, k, toutes) => (k === toutes.length - 1 ? { ...s, blocs: [...s.blocs, { type: "aide" }] } : s)),
};

/**
 * Le guide d’exemple en zone rouge (/apercu/guide?zone=rouge) : le même texte, et ce que la page pose d’elle-même dans
 * cette zone (le bloc d’aide en tête, l’expert dans la signature, un simple lien au lieu du bouton et du prix). L’expert
 * est un nom de place, pas une personne : un vrai article rouge a le sien, nommé.
 */
export const GUIDE_ROUGE_D_EXEMPLE: Article = { ...GUIDE_D_EXEMPLE, zone: "rouge", expert: { nom: "Prénom Nom", role: "psychologue (exemple)" } };
