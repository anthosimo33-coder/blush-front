import type { Article } from "./types";

/* Le silence après des jours à s’écrire : ce qu’il peut vouloir dire, et quoi faire le soir même. Requête « il ne répond plus à mes messages », zone verte. */

/** Il ne répond plus à mes messages : ce que ça peut vouloir dire, et quoi faire ce soir. */
export const IL_NE_REPOND_PLUS: Article = {
  slug: "il-ne-repond-plus",
  genre: "guide",
  theme: "Les silences",
  titre: "Il ne répond plus à mes messages\u00a0: ce que ça peut vouloir dire, et quoi faire ce soir",
  surligne: { situation: "ne répond plus", action: "ce soir" },
  description: "Pourquoi il ne répond plus, comment faire la différence entre une pause et une fin, et le seul message à envoyer ce soir. Avec des convs d’exemple inventées.",
  motCle: "il ne répond plus à mes messages",
  zone: "verte",
  publieLe: "2026-11-04",
  misAJourLe: "2026-11-05",
  changements: [
    { le: "2026-11-04", quoi: "Publication" },
    { le: "2026-11-05", quoi: "Pour se voir, quand une fille écrit à un garçon\u00a0: une perche plutôt qu’une invitation" },
  ],
  valideLe: "2026-11-05",
  sources: [
    { titre: "Le Robert, définition de «\u00a0ghoster\u00a0»", url: "https://dictionnaire.lerobert.com/definition/ghoster", consulteLe: "2026-11-03" },
    { titre: "Fil Santé Jeunes, «\u00a0Le ghosting\u00a0»", url: "https://www.filsantejeunes.com/le-ghosting-20830", consulteLe: "2026-11-03" },
    {
      titre:
        "Navarro, Larrañaga, Yubero et Víllora, «\u00a0Psychological Correlates of Ghosting and Breadcrumbing Experiences: A Preliminary Study among Adults\u00a0», International Journal of Environmental Research and Public Health, 2020",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7037474/",
      consulteLe: "2026-11-03",
    },
  ],
  reponseCourte:
    "Quand il ne répond plus à tes messages, ça peut vouloir dire qu’il est débordé ou qu’il ne sait pas quoi répondre. Il peut aussi prendre du recul après une dispute, ou perdre de l’intérêt. Un silence seul ne tranche pas\u00a0: compare-le à son rythme d’avant. S’il le dépasse, envoie un seul message clair, puis arrête-toi.",
  sections: [
    {
      question: "Pourquoi il ne répond plus à mes messages\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Souvent, pour une raison banale\u00a0: il est pris, il a vu ton message en courant, ou il ne sait pas quoi y répondre. Un message qui demande une vraie réponse attend qu’il ait la tête à ça, et finit parfois oublié.",
        },
        {
          type: "paragraphe",
          texte:
            "Parfois, le silence dit autre chose\u00a0: son intérêt retombe, ou il évite une conversation qu’il trouve gênante. Couper le contact d’un coup, sans explication, c’est ce que Le Robert appelle «\u00a0ghoster\u00a0», surtout en amour.",
        },
        {
          type: "paragraphe",
          texte: "Un seul message sans réponse ne dit pas encore dans quel cas tu es. Ce qui se passait juste avant le silence en dit beaucoup plus.",
        },
        { type: "blush", bulles: ["un message sans réponse, c’est pas encore une réponse", "ce qui compte, c’est ce qui se passait juste avant"] },
      ],
    },
    {
      question: "Il ne répond plus après une dispute\u00a0: qu’est-ce que ça veut dire\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Après une dispute, son silence veut souvent dire qu’il a besoin de temps, pas forcément que c’est fini. Certains se calment en parlant, d’autres en se taisant quelques heures ou une journée.",
        },
        {
          type: "paragraphe",
          texte:
            "Ça devient un signe quand le silence dure bien plus longtemps que la dispute ne le méritait, ou quand chaque désaccord finit comme ça. Ce n’est plus un besoin de calme, c’est une façon de ne jamais en parler.",
        },
        {
          type: "conv",
          repliques: [
            { de: "autre", texte: "laisse tomber, j’ai pas envie d’en parler là" },
            { de: "moi", texte: "ok, je te laisse respirer. on s’appelle demain à 19h\u00a0?" },
          ],
          legende: "Après une dispute\u00a0: de l’espace tout de suite, et un moment précis pour en reparler.",
        },
        {
          type: "paragraphe",
          texte:
            "Ce soir, écris une seule fois. Reconnais ta part s’il y en a une, en deux lignes, pas en pavé à 2\u00a0h du matin. Puis propose un appel pour en parler. La suite est entre ses mains.",
        },
        { type: "blush", bulles: ["un pavé d’excuses à 2h du mat, non", "un «\u00a0on s’appelle demain à 19h\u00a0?\u00a0», ça oui"] },
      ],
    },
    {
      question: "Comment savoir si c’est une pause ou la fin\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Compare son silence à son rythme d’avant, pas à celui de tes potes. S’il répondait le soir même et laisse passer trois jours, c’est une info. S’il a toujours mis deux jours, beaucoup moins.",
        },
        {
          type: "paragraphe",
          texte:
            "Le silence pèse plus quand d’autres signes l’ont précédé\u00a0: des réponses de plus en plus courtes, plus aucune question sur toi, un plan annulé sans en proposer un autre. Et c’est toujours toi qui relances.",
        },
        {
          type: "conv",
          repliques: [
            { de: "moi", texte: "t’as passé une bonne semaine\u00a0?" },
            { de: "autre", texte: "ouais tranquille" },
            { de: "moi", texte: "le nouveau film de science-fiction sort samedi, il a l’air ouf 🎬" },
          ],
          legende: "Deux mots, aucune question en retour, puis le silence après une idée de sortie. Un soir ne prouve rien\u00a0; si ça se répète, c’est une réponse.",
        },
        {
          type: "regarde",
          signes: [
            "Qui écrit en premier chaque jour, sur toute la conv et sur les trois dernières semaines",
            "Qui reprend la conv après douze heures de silence ou plus",
            "Les messages restés sans réponse, puis relancés par la même personne",
            "Depuis combien de jours chacun n’a plus rien écrit",
            "La longueur de vos messages, mois par mois",
            "Combien de messages tu as envoyés depuis sa dernière réponse",
          ],
        },
        {
          type: "paragraphe",
          texte:
            "Sur un export Instagram ou WhatsApp, chaque message a son heure\u00a0: BLUSH mesure tous ces signes. Sur des captures d’écran, les heures sont approximatives. Il lit alors les messages et leur longueur, sans compter qui écrit en premier, les reprises ni les relances.",
        },
        {
          type: "paragraphe",
          texte:
            "BLUSH ne déclare pas une histoire finie sur un soir de silence. Il lui faut un signe net, comme un non ou une dizaine de jours sans rien alors que tu as écrit au moins deux fois. Des semaines où tout s’éteint en sont un aussi. Dans le doute, il ne conclut pas à la fin\u00a0: son verdict porte l’étiquette «\u00a0À vérifier\u00a0».",
        },
        { type: "blush", bulles: ["un soir de silence, je conclus rien", "dix jours sans rien alors que t’as écrit deux fois\u00a0? là je te dis ce que j’en pense, cash"] },
      ],
    },
    {
      question: "Qu’est-ce que je peux lui envoyer ce soir\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte:
            "Un seul message, court, facile à saisir. Le plus simple, c’est une perche\u00a0: tu lui parles d’un endroit ou d’un projet, et tu le laisses proposer de se voir. Sa réponse, ou son silence, te dira où tu en es. Si vous êtes deux garçons, pas besoin de perche\u00a0: l’un ou l’autre propose, avec un jour et une heure.",
        },
        {
          type: "paragraphe",
          texte: "Attends d’abord que son silence dépasse son rythme habituel. S’il répond d’ordinaire le lendemain, un message ce soir arrive trop tôt.",
        },
        {
          type: "conv",
          repliques: [
            { de: "moi", texte: "je suis passée devant le skatepark dont tu m’avais parlé, y avait un monde fou" },
            { de: "autre", texte: "mercredi après le taf, on y passe\u00a0?" },
            { de: "moi", texte: "18h, je t’attends à l’entrée 😊" },
          ],
          legende: "Une perche plutôt qu’un plan\u00a0: s’il était juste débordé, elle lui donne une raison simple de répondre. Il propose le jour, tu fixes l’heure.",
        },
        {
          type: "paragraphe",
          texte:
            "Une fois le message parti, pose ton téléphone. Appelle une amie, lance une série, fais autre chose de ta soirée\u00a0: attendre devant l’écran ne le fera pas répondre plus vite.",
        },
        {
          type: "pieges",
          pieges: [
            "Enchaîner les relances jusqu’à obtenir une réponse",
            "Écrire un long message au milieu de la nuit pour tout réexpliquer",
            "Passer la soirée sur son profil à chercher un indice",
          ],
        },
        { type: "blush", bulles: ["une perche, et tu poses le tel\u00a0: pas trois relances"] },
      ],
    },
    {
      question: "Et s’il ne répond pas à ce message non plus\u00a0?",
      blocs: [
        {
          type: "paragraphe",
          texte: "Tu arrêtes d’écrire. Tu n’as pas besoin de son explication pour passer à autre chose, et son silence n’est pas une note sur toi.",
        },
        {
          type: "paragraphe",
          texte: "C’est aussi la règle de BLUSH\u00a0: quand l’autre ne répond plus, il ne te rédige pas de relance de plus. Il t’aide plutôt à passer à autre chose.",
        },
        {
          type: "paragraphe",
          texte:
            "Il y a aussi les miettes\u00a0: un message de temps en temps, sans jamais de suite. Une étude espagnole a interrogé 626 adultes de 18 à 40 ans. Ceux qui en avaient reçu au moins trois fois dans l’année se disaient moins satisfaits de leur vie, et plus seuls.",
        },
        {
          type: "paragraphe",
          texte:
            "Chez ceux qui avaient été ghostés, elle ne trouvait pas ce lien. C’est un lien, pas une preuve, et l’étude se dit préliminaire. Si ses messages reviennent au compte-gouttes, tu n’as pas à attendre le suivant.",
        },
        { type: "blush", bulles: ["tu lui dois pas une relance de plus", "son silence, c’est pas une note sur toi"] },
      ],
    },
  ],
  faq: [
    {
      question: "Pourquoi il ne me répond plus du jour au lendemain\u00a0?",
      reponse:
        "Souvent parce qu’il évite une conversation qu’il trouve difficile, ou que son intérêt est retombé sans qu’il ose le dire. Parfois pour une raison qui n’a rien à voir avec toi. Sans un mot de sa part, regarde plutôt ce qui avait changé dans vos messages avant le silence.",
    },
    {
      question: "Il ne me répond plus mais ne me bloque pas, ça veut dire quoi\u00a0?",
      reponse: "Pas grand-chose. Bloquer demande un geste, se taire n’en demande aucun. Ne pas te bloquer ne veut pas dire qu’il attend ton message.",
    },
    {
      question: "Il ne répond plus à mes SMS ni à mes appels, que faire\u00a0?",
      reponse:
        "La même chose que pour un message\u00a0: si ton dernier texto attend encore, tu as déjà posé ta question, et tu t’arrêtes là. Multiplier les appels ne lui donnera pas plus envie de répondre, et ça te laisse dans l’attente.",
    },
    {
      question: "Il ne me répond plus mais regarde mes stories, pourquoi\u00a0?",
      reponse:
        "Regarder une story ne demande aucun effort, répondre en demande un. Ce n’est pas un message pour toi, et ça ne dit rien de ce qu’il veut\u00a0: ne bâtis rien dessus.",
    },
  ],
  lies: ["il-met-du-temps-a-repondre", "il-voit-mes-messages", "interesse-par-message", "ghosting"],
};
