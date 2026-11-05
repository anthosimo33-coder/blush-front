import type { Article } from "./types";

/* Le « vu » sans réponse : ce qu’il dit, ce qu’il ne dit pas, et que faire. Requête visée « il voit mes messages mais ne répond pas », zone verte. */

/** Il voit mes messages mais ne répond pas : pourquoi, et que faire. */
export const IL_VOIT_MES_MESSAGES: Article = {
  slug: "il-voit-mes-messages",
  genre: "guide",
  theme: "Les messages vus",
  titre: "Il voit mes messages mais ne répond pas\u00a0: pourquoi, et que faire",
  surligne: { situation: "voit", action: "que faire" },
  description:
    "Il a vu ton message et rien ne revient\u00a0: ce que le «\u00a0vu\u00a0» dit, ce qu’il ne dit pas, quand il devient un signe, et le seul message à envoyer. Avec des convs d’exemple inventées.",
  motCle: "il voit mes messages mais ne répond pas",
  zone: "verte",
  publieLe: "2026-11-05",
  misAJourLe: "2026-11-05",
  changements: [{ le: "2026-11-05", quoi: "Publication" }],
  valideLe: "2026-11-05",
  sources: [
    {
      titre:
        "Lynden et Rasmussen, «\u00a0Exploring the impact of ‘read receipts’ in Mobile Instant Messaging\u00a0», Tidsskrift for Medier, Erkendelse og Formidling, 2017 (université de Copenhague)",
      url: "https://tidsskrift.dk/mef-journal/article/view/28781",
      consulteLe: "2026-11-04",
    },
    {
      titre: "Hoyle, Das, Kapadia, Lee et Vaniea, «\u00a0Was my message read?: Privacy and Signaling on Facebook Messenger\u00a0», actes de la conférence CHI, 2017",
      url: "https://www.cs.oberlin.edu/~rhoyle/papers/hoyle-chi17.pdf",
      consulteLe: "2026-11-04",
    },
    { titre: "Le Robert, définition de «\u00a0ghoster\u00a0»", url: "https://dictionnaire.lerobert.com/definition/ghoster", consulteLe: "2026-11-04" },
  ],
  reponseCourte:
    "Quand il voit tes messages mais ne répond pas, le «\u00a0vu\u00a0» dit seulement qu’il a ouvert la conv. Souvent, il a lu entre deux choses, ou ne sait pas encore quoi répondre. Ça compte quand ça se répète. N’ajoute rien\u00a0: attends son rythme habituel, puis envoie un seul message, court et facile à saisir. Sans réponse, arrête.",
  sections: [
    {
      question: "Le «\u00a0vu\u00a0» sans réponse, ça veut dire qu’il t’ignore\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Non, pas à lui seul\u00a0: le «\u00a0vu\u00a0» dit qu’il a ouvert la conv, rien de plus. Il ne dit pas s’il a eu le temps de lire, ni s’il a choisi de ne pas répondre.",
        },
        {
          type: "paragraphe",
          texte:
            "On ouvre souvent un message au mauvais moment\u00a0: en cours, au boulot, dans le métro. On se dit qu’on répondra en rentrant, puis la soirée passe. Dans une enquête publiée en 2017 auprès d’une centaine d’étudiants de Copenhague, près des deux tiers préféraient répondre quand ils avaient le temps.",
        },
        {
          type: "paragraphe",
          texte:
            "Le «\u00a0vu\u00a0» pèse aussi sur celui qui reçoit le message. Dans la même enquête, 93\u00a0% évitaient parfois d’ouvrir un message, juste pour ne pas le marquer comme lu. Et c’est avec quelqu’un qu’ils commençaient à fréquenter qu’ils y faisaient le plus attention.",
        },
        {
          type: "conv",
          repliques: [
            { de: "moi", texte: "j’ai eu mon permis 🚗🎉" },
            { de: "autre", texte: "nooon bravo\u00a0! je l’ai vu ce midi en plein cours, je voulais pas te répondre en deux mots" },
            { de: "autre", texte: "tu m’emmènes où en premier\u00a0?" },
          ],
          legende: "Vu à midi, réponse le soir\u00a0: il avait lu en cours, et il a attendu de pouvoir répondre vraiment.",
        },
        { type: "blush", bulles: ["le vu, c’est «\u00a0il a ouvert\u00a0», pas «\u00a0il t’ignore\u00a0»", "un message lu en cours, ça se répond souvent le soir"] },
      ],
    },
    {
      question: "Pourquoi il voit mes messages mais ne répond pas\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte: "Le plus souvent, parce que ton message arrive à un moment où il ne peut pas y répondre bien. Il le garde pour plus tard, et plus tard devient demain.",
        },
        {
          type: "paragraphe",
          texte:
            "Parfois, c’est ton message qui demande du temps. Une question sur «\u00a0vous deux\u00a0», une confidence qui appelle une vraie réponse, un long message\u00a0: il attend d’avoir les bons mots.",
        },
        {
          type: "paragraphe",
          texte:
            "Et parfois, il a moins envie. Il laisse en vu pour ne pas avoir à dire non, ou pour s’éloigner sans en parler. Un seul vu ne permet pas de savoir dans quel cas tu es.",
        },
        {
          type: "paragraphe",
          texte:
            "Ce silence-là fait souvent plus mal qu’un message pas encore ouvert. Une enquête menée en 2015 aux États-Unis a interrogé 402 personnes qui écrivaient sur Messenger. Lu sans réponse, un message leur donnait deux fois plus souvent l’impression d’être ignorées qu’un message pas encore lu\u00a0: 27\u00a0% contre 13\u00a0%.",
        },
        {
          type: "paragraphe",
          texte: "C’est normal de le vivre mal. Mais ce que tu ressens devant ce vu ne dit pas encore ce qu’il pense, lui.",
        },
        { type: "blush", bulles: ["un «\u00a0on en est où nous deux\u00a0?\u00a0», ça se répond rarement dans la minute", "laisse-lui le temps de trouver ses mots"] },
      ],
    },
    {
      question: "Quand est-ce qu’un «\u00a0vu\u00a0» sans réponse devient un signe\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Quand il se répète, et que tes messages s’empilent sans retour. Un vu isolé, c’est un soir. Des messages vus d’affilée, plusieurs fois par semaine, c’est une habitude.",
        },
        {
          type: "paragraphe",
          texte:
            "Compare avec son rythme à lui. S’il a toujours répondu le lendemain, un vu le soir ne veut rien dire. S’il répondait dans l’heure et laisse maintenant tout en vu, quelque chose a changé.",
        },
        {
          type: "paragraphe",
          texte: "Regarde aussi ce qui arrive quand il répond enfin\u00a0: deux mots, aucune question, aucun plan. Et c’est toujours toi qui fais repartir la conv.",
        },
        {
          type: "conv",
          repliques: [
            { de: "moi", texte: "j’ai gagné deux places pour le match de samedi 🏀" },
            { de: "moi", texte: "mon frère peut plus venir" },
            { de: "moi", texte: "bon, bonne soirée 😊" },
            { de: "autre", texte: "ah dsl j’avais vu et zappé" },
          ],
          legende: "Trois messages vus, puis une excuse sans rien proposer\u00a0: un soir ne prouve rien, mais si c’est chaque fois comme ça, le schéma parle.",
        },
        {
          type: "regarde",
          signes: [
            "Combien de tes messages attendent depuis sa dernière réponse",
            "Les messages restés trois heures sans réponse, suivis d’un autre de la même personne",
            "Qui fait repartir la conv après douze heures de silence",
            "Son délai de réponse habituel, et s’il s’allonge sur les trois dernières semaines",
            "La longueur de ses messages, mois après mois, à côté des tiens",
            "Le jour du dernier message de chacun",
          ],
        },
        {
          type: "paragraphe",
          texte:
            "Le «\u00a0vu\u00a0» lui-même, BLUSH ne le lit pas\u00a0: ni dans un export Instagram ou WhatsApp, ni sur des captures d’écran. Il lit ce qui a été écrit, et par qui.",
        },
        {
          type: "paragraphe",
          texte:
            "Sur des captures, les heures sont approximatives\u00a0: il n’en tire ni délai ni relance, et s’en tient à ce que disent les messages. Un export Instagram ou WhatsApp garde l’heure de chaque message\u00a0: c’est là que les délais et les relances se mesurent.",
        },
        { type: "blush", bulles: ["le vu, je le vois pas\u00a0: je vois qui écrit sans retour, et depuis quand t’attends"] },
      ],
    },
    {
      question: "Qu’est-ce que tu peux faire quand il te laisse en vu\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte: "D’abord, ne remplis pas le silence. Un deuxième message pour faire remonter le premier ne le fera pas répondre, et il change le ton de la conv.",
        },
        {
          type: "paragraphe",
          texte:
            "En attendant, ferme la conv et occupe ta soirée autrement\u00a0: une série, tes potes, ton sport. Relire son «\u00a0vu\u00a0» dix fois ne changera rien à sa réponse.",
        },
        {
          type: "paragraphe",
          texte:
            "Attends que son silence dépasse son rythme habituel. Puis écris une seule fois, un message qui se répond en dix secondes\u00a0: une question courte, ou une perche qu’il n’a plus qu’à saisir. Si vous êtes deux garçons, la perche n’a rien d’obligé\u00a0: propose toi-même, avec un jour et une heure.",
        },
        {
          type: "conv",
          repliques: [
            { de: "moi", texte: "j’ai fait des cookies, y en a pour un régiment 🍪" },
            { de: "autre", texte: "goûter au parc dimanche\u00a0? je ramène à boire" },
            { de: "moi", texte: "dimanche 16\u00a0h, je garde les meilleurs" },
          ],
          legende: "Un seul message, facile à saisir\u00a0: il propose le jour, tu fixes l’heure. Sa réponse, ou son silence, te dit où tu en es.",
        },
        {
          type: "paragraphe",
          texte:
            "Si tu veux parler de vous deux, garde ce sujet pour un appel, ou pour la prochaine fois que vous vous verrez. Un sujet qui compte se règle mal à coups de messages laissés en vu.",
        },
        {
          type: "paragraphe",
          texte:
            "Et si ce message-là reste en vu lui aussi, arrête d’écrire. Quand plus rien ne revient, on parle de ghosting\u00a0: pour Le Robert, «\u00a0ghoster\u00a0», c’est couper tout contact d’un coup, sans explication. Tu n’as pas besoin de la sienne pour passer à autre chose.",
        },
        {
          type: "paragraphe",
          texte:
            "BLUSH suit la même règle\u00a0: quand tout reste en vu, il ne t’aide pas à relancer encore. Et si c’est toi qui relances sans arrêt, il te le dit, tes propres messages sous les yeux.",
        },
        {
          type: "pieges",
          pieges: [
            "Écrire «\u00a0je vois que t’as vu\u00a0» pour le faire réagir",
            "Garder la conv ouverte pour voir s’il est en ligne",
            "Le laisser en vu à ton tour, pour qu’il comprenne",
          ],
        },
        { type: "blush", bulles: ["t’attends son rythme, puis une seule perche", "après, c’est à lui de jouer"] },
      ],
    },
  ],
  faq: [
    {
      question: "Un vu sans réponse, c’est un manque de respect\u00a0?",
      reponse:
        "Pas forcément\u00a0: beaucoup de gens ouvrent un message et répondent quand ils ont le temps. Ça devient un manque d’égards quand c’est une habitude, même face à une question directe. Le lui faire remarquer ne le fera pas répondre\u00a0: écris-lui moins, et regarde s’il revient de lui-même.",
    },
    {
      question: "Il me laisse en vu mais regarde mes stories, pourquoi\u00a0?",
      reponse:
        "Voir une story se fait d’un geste, sans rien engager. Ouvrir ton message et y répondre, c’est entrer dans la conv. Ça ne prouve ni qu’il s’intéresse à toi, ni l’inverse\u00a0: ce qui compte reste ce qu’il t’écrit.",
    },
    {
      question: "Il est en ligne mais ne me répond pas, ça veut dire quoi\u00a0?",
      reponse:
        "Être en ligne ne veut pas dire être libre pour toi\u00a0: il peut écrire à un groupe, regarder une vidéo ou chercher un itinéraire. Garder un œil sur son statut ne t’apprendra rien de plus. Regarde plutôt ce qu’il t’écrit, quand il écrit.",
    },
    {
      question: "Il a vu mon message, combien de temps attendre avant de relancer\u00a0?",
      reponse:
        "Le temps qu’il met d’habitude à répondre, et un peu plus. S’il répond en général le soir, attends le lendemain\u00a0; s’il met deux jours, attends-en trois. Puis une seule relance, courte\u00a0: une question ou une perche. Si elle reste en vu, n’écris plus.",
    },
  ],
  lies: ["il-ne-repond-plus", "il-met-du-temps-a-repondre", "interesse-par-message", "ghosting"],
};
