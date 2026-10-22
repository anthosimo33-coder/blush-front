import type { AppKind, Confidence } from "@/types";

/*
 * La landing par situation (une proposition, sur /apercu/landing : rien en ligne). L’idée vient de l’e-commerce : la
 * visiteuse choisit sa situation comme on choisit sa taille, et toute la page lui montre quelqu’un comme elle, sa conv,
 * ce que BLUSH y a vu, son rapport et ce qu’elle envoie. Les personas sont ceux du 21 octobre (Inès en talking stage,
 * l’ICP ; la trentenaire en couple ; l’ex qui réécrit ; le mec sur Hinge ; la ghostée), plus les thèmes des campagnes
 * (il répond plus pareil, la dispute, le meilleur ami).
 * Tout est inventé : les prénoms, les convs, les chiffres. Chaque bloc le dit (« exemple fictif »). Les photos sont à
 * shooter avec les créatrices : `photo` dit ce qu’on y voit.
 * TODO(produit): relire chaque situation, puis remplacer les cadres « photo à shooter » par les vraies photos.
 */

export type SituationId = "change" | "flou" | "dispute" | "ghost" | "ex" | "ami" | "match";

/** Un message de la conv d’exemple : de l’autre (« elle », à gauche) ou de toi (à droite), et son heure. */
type MessageExemple = { de: "elle" | "toi"; texte: string; heure: string };

/** Un chiffre de la conv : sa valeur en gros, ce qu’il dit, et de quel côté il penche. */
export type ChiffreExemple = { valeur: string; texte: string; cote: "toi" | "elle" | "pareil" };

export type Situation = {
  id: SituationId;
  /** Le choix, dans la rangée « C’est quoi ta situation ? » (court : il tient dans une pastille). */
  choix: string;
  emoji: string;
  /** Le titre du haut, quand on arrive par un lien de cette situation (?s=). */
  titre: string;
  /** La personne qui lui ressemble : la « mannequin de sa taille ». */
  persona: {
    prenom: string;
    age: number;
    /** Elle ou lui : les textes autour de la personne s’accordent (« ce qu’elle demande », « ce qu’il demande »). */
    genre: "elle" | "il";
    /** Où elle en est, en une ligne. */
    ou: string;
    app: AppKind;
    /** Les messages lus, déjà écrits pour l’écran (« 6 120 »). */
    messages: string;
    /** Ce qu’elle se demande : sa peur, dans ses mots. */
    doute: string;
    /** La photo à shooter : ce qu’on y voit. */
    photo: string;
  };
  /** L’autre personne : son prénom, et son pronom (il ou elle). */
  autre: { prenom: string; il: boolean };
  conv: MessageExemple[];
  /** Trois chiffres de la conv, comme le haut du paywall : la photo « à l’échelle ». */
  chiffres: [ChiffreExemple, ChiffreExemple, ChiffreExemple];
  verdict: { emoji: string; titre: string; sous: string; preuve: { texte: string; date: string }; confiance: Confidence; preuves: number };
  /** Les titres des huit chapitres, écrits pour son histoire (le 5 : le prénom de l’autre). */
  chapitres: [string, string, string, string, string, string, string, string];
  /** La première phrase du chapitre 2, lisible : le reste du rapport est flouté. */
  extrait: string;
  /** Ce qu’elle demande au chat, ce que BLUSH lui écrit, et pourquoi. `aEnvoyer` : faux quand BLUSH lui dit de ne rien envoyer. */
  reponse: { question: string; texte: string; pourquoi: string; aEnvoyer: boolean };
  prochainPas: string;
  /** Le prénom du vrai témoignage le plus proche (src/contenu/landing.ts) : montré en premier. */
  avis: string;
  /** La question qu’elle se pose avant de payer, propre à sa situation. */
  question: { q: string; r: string };
};

export const SITUATIONS: Situation[] = [
  {
    id: "change",
    choix: "Il répond plus pareil",
    emoji: "📉",
    titre: "Il te répond plus pareil\u00a0?",
    persona: {
      prenom: "Léna",
      age: 22,
      genre: "elle",
      ou: "En couple avec Hugo depuis un an et demi",
      app: "whatsapp",
      messages: "6\u00a0120",
      doute: "Mes potes disent que c’est le boulot. Moi, je sens que c’est autre chose.",
      photo: "Léna au lit, 1\u00a0h du matin, la lumière du téléphone sur le visage. Elle relit la conv.",
    },
    autre: { prenom: "Hugo", il: true },
    conv: [
      { de: "toi", texte: "t’es rentré\u00a0? 🙂", heure: "23:12" },
      { de: "toi", texte: "bonne nuit alors", heure: "00:40" },
      { de: "elle", texte: "dsl je dormais", heure: "09:58" },
      { de: "toi", texte: "on se voit ce week-end\u00a0?", heure: "10:01" },
      { de: "elle", texte: "jsp encore, je te dis", heure: "13:26" },
    ],
    chiffres: [
      { valeur: "3\u00a0h\u00a012", texte: "pour te répondre, contre 9\u00a0min en mars", cote: "elle" },
      { valeur: "8 sur 10", texte: "des convs, c’est toi qui les lances", cote: "toi" },
      { valeur: "12\u00a0mai", texte: "le jour où ça a changé", cote: "pareil" },
    ],
    verdict: {
      emoji: "🤔",
      titre: "Un truc coince depuis le 12\u00a0mai.",
      sous: "Il n’est pas parti. Il s’est mis en retrait, et c’est toi qui portes la conv.",
      preuve: { texte: "jsp encore, je te dis", date: "14 juin, 13\u00a0h\u00a026" },
      confiance: "sur",
      preuves: 14,
    },
    chapitres: [
      "Le verdict",
      "Le 12\u00a0mai, le soir où tout a basculé",
      "Votre histoire, en trois actes",
      "Ce qui coince\u00a0: les «\u00a0je te dis\u00a0»",
      "Hugo",
      "Toi\u00a0: celle qui tient la conv",
      "Votre duo, avant et maintenant",
      "Ton prochain pas",
    ],
    extrait: "Jusqu’au 12\u00a0mai, Hugo t’écrivait le premier un jour sur deux. Depuis, plus une seule fois.",
    reponse: {
      question: "je lui réponds quoi\u00a0?",
      texte: "Je te sens loin en ce moment. Pas un reproche, juste envie qu’on se retrouve. Samedi, toi et moi\u00a0?",
      pourquoi: "Tu dis ce que tu sens sans l’accuser, et tu proposes un moment précis.",
      aEnvoyer: true,
    },
    prochainPas: "Arrête de relancer à minuit. Propose-lui un moment à deux, avec un jour.",
    avis: "Sonia",
    question: {
      q: "Et si c’est juste le boulot\u00a0?",
      r: "BLUSH te le dira. Il compare vos messages d’avant et ceux de maintenant, et te dit à quel point il en est sûr.",
    },
  },
  {
    id: "flou",
    choix: "On est quoi, au juste\u00a0?",
    emoji: "🫠",
    titre: "Vous êtes quoi, au juste\u00a0?",
    persona: {
      prenom: "Inès",
      age: 20,
      genre: "elle",
      ou: "Elle parle avec Nathan depuis deux mois",
      app: "instagram",
      messages: "1\u00a0840",
      doute: "On s’écrit tous les jours, on se voit… mais il n’a jamais dit ce qu’on était.",
      photo: "Inès au café, elle tend son téléphone à sa pote, qui lève un sourcil.",
    },
    autre: { prenom: "Nathan", il: true },
    conv: [
      { de: "elle", texte: "t’es pas comme les autres toi", heure: "23:48" },
      { de: "toi", texte: "ça veut dire quoi 😭", heure: "23:49" },
      { de: "elle", texte: "que t’es différente. en bien", heure: "00:15" },
      { de: "toi", texte: "et nous du coup\u00a0?", heure: "00:16" },
      { de: "elle", texte: "on se prend pas la tête, c’est bien non", heure: "00:52" },
    ],
    chiffres: [
      { valeur: "6 sur 7", texte: "de ses messages arrivent après 23\u00a0h", cote: "elle" },
      { valeur: "3 fois", texte: "tu as demandé ce que vous étiez. 3 esquives", cote: "toi" },
      { valeur: "0", texte: "projet avec toi au-delà du week-end", cote: "elle" },
    ],
    verdict: {
      emoji: "🤔",
      titre: "Il hésite.",
      sous: "Il aime ce que vous avez. Il évite tout ce qui l’engage.",
      preuve: { texte: "on se prend pas la tête, c’est bien non", date: "2 oct., 0\u00a0h\u00a052" },
      confiance: "probable",
      preuves: 9,
    },
    chapitres: [
      "Le verdict",
      "Le soir où tu as posé la question",
      "Deux mois, en trois actes",
      "Ce qui coince\u00a0: les «\u00a0on verra\u00a0»",
      "Nathan",
      "Toi\u00a0: celle qui ose demander",
      "Votre duo, la nuit et le jour",
      "Ton prochain pas",
    ],
    extrait: "Trois fois, tu as demandé ce que vous étiez. Trois fois, Nathan a changé de sujet, toujours après minuit.",
    reponse: {
      question: "je lui réponds quoi\u00a0?",
      texte: "Moi aussi j’aime bien qu’on se prenne pas la tête. Mais j’aime aussi savoir où je vais. On en parle samedi, en vrai\u00a0?",
      pourquoi: "Tu restes légère, tu poses ta limite, et tu sors la question du téléphone.",
      aEnvoyer: true,
    },
    prochainPas: "Pose la question une seule fois, en face. Sa réponse te dira tout.",
    avis: "Charlotte",
    question: {
      q: "Et si je lui fais peur en demandant\u00a0?",
      r: "BLUSH t’écrit la version qui ne met pas la pression. Et ce qu’il ne faut surtout pas envoyer.",
    },
  },
  {
    id: "dispute",
    choix: "On se dispute tout le temps",
    emoji: "⚡️",
    titre: "Il dit que c’est toi le problème\u00a0?",
    persona: {
      prenom: "Sarah",
      age: 24,
      genre: "elle",
      ou: "En couple avec Mehdi depuis trois ans",
      app: "whatsapp",
      messages: "14\u00a0300",
      doute: "Après chaque dispute, c’est moi qui m’excuse. Même quand j’ai rien fait.",
      photo: "Sarah assise au bord du lit, le pouce au-dessus d’«\u00a0envoyer\u00a0». Elle hésite.",
    },
    autre: { prenom: "Mehdi", il: true },
    conv: [
      { de: "toi", texte: "t’étais où\u00a0?", heure: "01:12" },
      { de: "elle", texte: "tu recommences", heure: "01:29" },
      { de: "elle", texte: "t’es vraiment fatigante parfois", heure: "01:29" },
      { de: "toi", texte: "pardon", heure: "01:31" },
    ],
    chiffres: [
      { valeur: "11 sur 12", texte: "de vos disputes finissent par ton «\u00a0pardon\u00a0»", cote: "toi" },
      { valeur: "0", texte: "excuse de sa part depuis avril", cote: "elle" },
      { valeur: "17", texte: "«\u00a0tu recommences\u00a0» en six mois", cote: "elle" },
    ],
    verdict: {
      emoji: "🤔",
      titre: "Un truc coince.",
      sous: "Tes questions ne sont pas le problème. Le problème, c’est que chacune devient une dispute.",
      preuve: { texte: "tu recommences", date: "12 oct., 1\u00a0h\u00a029" },
      confiance: "sur",
      preuves: 17,
    },
    chapitres: [
      "Le verdict",
      "Le 26\u00a0avril, la nuit où tout a basculé",
      "Trois ans, en trois actes",
      "Ce qui coince\u00a0: les «\u00a0tu recommences\u00a0»",
      "Mehdi",
      "Toi\u00a0: celle qui s’excuse",
      "Votre duo, quand ça monte",
      "Ton prochain pas",
    ],
    extrait: "Sur douze disputes, onze se terminent par ton «\u00a0pardon\u00a0». Pas une seule par le sien.",
    reponse: {
      question: "je lui réponds quoi\u00a0?",
      texte: "Je cherche pas la dispute. Je t’ai posé une question, et j’aimerais une réponse, pas un reproche.",
      pourquoi: "Tu restes calme, tu ne t’excuses pas, et tu ramènes la conv à ta question.",
      aEnvoyer: true,
    },
    prochainPas: "Plus de «\u00a0pardon\u00a0» réflexe. Pose ta question une fois, calmement, et attends sa réponse.",
    avis: "Sonia",
    question: {
      q: "Et si c’est vraiment moi qui exagère\u00a0?",
      r: "BLUSH te le dira aussi. Il lit vos deux côtés, avec les messages qui le montrent.",
    },
  },
  {
    id: "ghost",
    choix: "Il a disparu",
    emoji: "👻",
    titre: "Il a disparu sans un mot\u00a0?",
    persona: {
      prenom: "Maëlle",
      age: 21,
      genre: "elle",
      ou: "Trois dates avec Yanis, puis plus rien",
      app: "imessage",
      messages: "640",
      doute: "J’ai dit un truc qu’il fallait pas\u00a0?",
      photo: "Maëlle le matin, en pyjama. Elle fixe le «\u00a0Vu\u00a0» sous son dernier message.",
    },
    autre: { prenom: "Yanis", il: true },
    conv: [
      { de: "elle", texte: "super soirée, 10/10", heure: "23:44" },
      { de: "toi", texte: "j’ai trop kiffé hier 🙈", heure: "09:41" },
      { de: "toi", texte: "t’as survécu à ta journée\u00a0? 😅", heure: "14:06" },
      { de: "toi", texte: "j’ai dit un truc qu’il fallait pas\u00a0?", heure: "22:47" },
    ],
    chiffres: [
      { valeur: "9 sur 10", texte: "des convs, c’est toi qui les lances depuis juillet", cote: "toi" },
      { valeur: "4\u00a0jours", texte: "son plus long silence, avant celui-là", cote: "elle" },
      { valeur: "3", texte: "messages de toi, sans réponse", cote: "toi" },
    ],
    verdict: {
      emoji: "🧊",
      titre: "Il s’éloigne.",
      sous: "Ce n’est pas ton dernier message. Il prend ses distances depuis juillet, par petites touches.",
      preuve: { texte: "je suis nul avec mon tel tu sais", date: "3 août, 12\u00a0h\u00a041" },
      confiance: "sur",
      preuves: 12,
    },
    chapitres: [
      "Le verdict",
      "Le 25\u00a0juillet, le date qu’il a annulé",
      "Votre histoire, en trois actes",
      "Ce qui coince\u00a0: ses silences",
      "Yanis",
      "Toi\u00a0: celle qui relance",
      "Votre duo, les jours sans réponse",
      "Ton prochain pas",
    ],
    extrait: "Ce n’est pas ton dernier message. Depuis le 25\u00a0juillet, Yanis répond de plus en plus tard, et ne propose plus rien.",
    reponse: {
      question: "je lui renvoie un message\u00a0?",
      texte: "Non. Rien ce soir.",
      pourquoi: "Trois messages sans réponse, c’est déjà sa réponse. Le prochain, c’est à lui de l’écrire.",
      aEnvoyer: false,
    },
    prochainPas: "Ne relance plus. S’il revient, tu sauras quoi lui répondre.",
    avis: "Charlotte",
    question: {
      q: "Et s’il revient\u00a0?",
      r: "Colle son message dans BLUSH. Tu sauras ce qu’il veut vraiment, et quoi lui répondre.",
    },
  },
  {
    id: "ex",
    choix: "Mon ex m’a réécrit",
    emoji: "🔁",
    titre: "Ton ex t’a réécrit\u00a0?",
    persona: {
      prenom: "Jade",
      age: 23,
      genre: "elle",
      ou: "Séparée de Lucas depuis quatre mois. Il lui a réécrit hier soir",
      app: "whatsapp",
      messages: "9\u00a0870",
      doute: "Il m’écrit «\u00a0tu me manques\u00a0». Je réponds, ou je me protège\u00a0?",
      photo: "Jade tient son téléphone à bout de bras, le message de son ex à l’écran. Elle hésite.",
    },
    autre: { prenom: "Lucas", il: true },
    conv: [
      { de: "elle", texte: "tu me manques", heure: "23:58" },
      { de: "elle", texte: "on pourrait se voir, juste parler\u00a0?", heure: "23:59" },
    ],
    chiffres: [
      { valeur: "3 fois", texte: "il est revenu après une rupture, toujours un dimanche soir", cote: "elle" },
      { valeur: "2 sem.", texte: "ce qu’ont duré ses deux derniers retours", cote: "elle" },
      { valeur: "4 sur 5", texte: "de vos disputes portaient sur la même chose", cote: "pareil" },
    ],
    verdict: {
      emoji: "🤔",
      titre: "Il hésite.",
      sous: "Il veut revenir. Rien dans ses messages ne dit que ce qui coinçait a changé.",
      preuve: { texte: "on pourrait se voir, juste parler\u00a0?", date: "19 oct., 23\u00a0h\u00a059" },
      confiance: "probable",
      preuves: 8,
    },
    chapitres: [
      "Le verdict",
      "Le 2\u00a0juin, le soir où ça a cassé",
      "Vos deux ans, en trois actes",
      "Ce qui coince\u00a0: toujours la même dispute",
      "Lucas",
      "Toi\u00a0: ce dont tu as besoin",
      "Votre duo, avant et après",
      "Ton prochain pas",
    ],
    extrait: "C’est la troisième fois que Lucas revient, toujours un dimanche soir, et toujours sans parler de ce qui avait cassé.",
    reponse: {
      question: "je lui réponds quoi\u00a0?",
      texte: "Ça me touche. Mais avant de se voir, j’ai besoin de savoir ce qui a changé de ton côté.",
      pourquoi: "Tu ne fermes pas la porte, tu ne cours pas non plus. Tu demandes la seule chose qui compte.",
      aEnvoyer: true,
    },
    prochainPas: "Ne dis pas oui ce soir. Demande-lui d’abord ce qui a changé.",
    avis: "Charlotte",
    question: {
      q: "Et si je veux juste tourner la page\u00a0?",
      r: "BLUSH t’aide aussi à ça. Il ne t’aidera jamais à courir après quelqu’un qui est parti.",
    },
  },
  {
    id: "ami",
    choix: "Mon meilleur ami",
    emoji: "🫂",
    titre: "Ton meilleur ami est bizarre avec toi\u00a0?",
    persona: {
      prenom: "Camille",
      age: 19,
      genre: "elle",
      ou: "Meilleure amie de Sami depuis le lycée",
      app: "instagram",
      messages: "11\u00a0200",
      doute: "Il critique tous mes mecs. Il est juste protecteur… non\u00a0?",
      photo: "Camille et Sami sur un canapé. Elle rit devant son téléphone, lui ne regarde qu’elle.",
    },
    autre: { prenom: "Sami", il: true },
    conv: [
      { de: "toi", texte: "il m’a invitée au resto 🥹", heure: "00:41" },
      { de: "elle", texte: "tu mérites mieux que lui", heure: "01:58" },
      { de: "elle", texte: "laisse tomber je dis n’importe quoi", heure: "01:59" },
    ],
    chiffres: [
      { valeur: "2\u00a0min", texte: "pour te répondre. Ton date\u00a0: 3\u00a0h", cote: "elle" },
      { valeur: "14", texte: "messages qu’il a supprimés, tous la nuit", cote: "elle" },
      { valeur: "6 sur 6", texte: "de tes mecs, il les a tous critiqués", cote: "elle" },
    ],
    verdict: {
      emoji: "🤏",
      titre: "À deux doigts de te le dire.",
      sous: "Il te répond en deux minutes, efface ses messages la nuit, et démolit chacun de tes mecs.",
      preuve: { texte: "tu mérites mieux que lui", date: "12 oct., 1\u00a0h\u00a058" },
      confiance: "probable",
      preuves: 11,
    },
    chapitres: [
      "Le verdict",
      "Le 23\u00a0mai, le moment sur le canapé",
      "Six ans d’amitié, en trois actes",
      "Ce qui coince\u00a0: ce qu’il n’ose pas dire",
      "Sami",
      "Toi\u00a0: ce que tu veux, toi",
      "Votre duo, la nuit",
      "Ton prochain pas",
    ],
    extrait: "Depuis le 23\u00a0mai, Sami efface ses messages la nuit. Quatorze fois, toujours entre 1\u00a0h et 3\u00a0h.",
    reponse: {
      question: "je lui dis quoi\u00a0?",
      texte: "Tu dis souvent que je mérite mieux. Mieux comment, Sami\u00a0?",
      pourquoi: "Tu ne l’accuses de rien. Tu lui ouvres la porte pour dire ce qu’il n’ose pas.",
      aEnvoyer: true,
    },
    prochainPas: "Avant de lui répondre, demande-toi ce que toi, tu veux. Le chapitre 6 t’y aide.",
    avis: "Mattheo",
    question: {
      q: "Et si je me fais des films\u00a0?",
      r: "BLUSH te dit à quel point il en est sûr, avec les messages qui le montrent. Pas plus.",
    },
  },
  {
    id: "match",
    choix: "Un match qui refroidit",
    emoji: "🧊",
    titre: "Ton match refroidit\u00a0?",
    persona: {
      prenom: "Théo",
      age: 26,
      genre: "il",
      ou: "Match Hinge avec Clara depuis trois semaines",
      app: "hinge",
      messages: "210",
      doute: "Elle répondait en cinq minutes. Maintenant, c’est «\u00a0haha\u00a0» le lendemain.",
      photo: "Théo dans le métro. Il regarde son écran, sceptique.",
    },
    autre: { prenom: "Clara", il: false },
    conv: [
      { de: "toi", texte: "on se fait ce verre jeudi\u00a0?", heure: "19:02" },
      { de: "elle", texte: "haha peut-être", heure: "11:47" },
      { de: "elle", texte: "on verra", heure: "11:47" },
    ],
    chiffres: [
      { valeur: "16\u00a0h", texte: "pour te répondre, contre 5\u00a0min au début", cote: "elle" },
      { valeur: "0", texte: "question de sa part depuis le 9\u00a0octobre", cote: "elle" },
      { valeur: "3", texte: "«\u00a0on verra\u00a0» en dix jours", cote: "elle" },
    ],
    verdict: {
      emoji: "🧊",
      titre: "Elle s’éloigne.",
      sous: "Elle répond par politesse, et elle ne pose plus de questions.",
      preuve: { texte: "haha peut-être", date: "18 oct., 11\u00a0h\u00a047" },
      confiance: "sur",
      preuves: 7,
    },
    chapitres: [
      "Le verdict",
      "Le 9\u00a0octobre, le message resté en suspens",
      "Trois semaines, en trois actes",
      "Ce qui coince\u00a0: les «\u00a0on verra\u00a0»",
      "Clara",
      "Toi\u00a0: celui qui propose",
      "Votre duo, en chiffres",
      "Ton prochain pas",
    ],
    extrait: "Jusqu’au 9\u00a0octobre, Clara te posait une question sur deux. Depuis, plus aucune.",
    reponse: {
      question: "je lui réponds quoi\u00a0?",
      texte: "Je te propose une seule fois, sans pression\u00a0: jeudi 20\u00a0h\u00a0? Sinon, pas grave 🙂",
      pourquoi: "Une proposition claire, et une porte de sortie. Sa réponse te dira tout.",
      aEnvoyer: true,
    },
    prochainPas: "Une dernière proposition précise. Sans réponse, tu passes à autre chose.",
    avis: "Mattheo",
    question: {
      q: "Ça marche avec Hinge\u00a0?",
      r: "Oui. Hinge, Tinder, Bumble, Snap\u00a0: fais des captures ou filme ton écran, BLUSH lit tout.",
    },
  },
];

/** La situation montrée d’abord, sans lien de situation : la plus fréquente dans les campagnes (« il répond plus pareil »). */
export const SITUATION_PAR_DEFAUT: SituationId = "change";

/** La situation d’un lien (?s=…), ou rien quand il n’en nomme aucune. */
export const situationDe = (id: string | undefined) => SITUATIONS.find((s) => s.id === id) ?? null;

/** Les textes de la landing par situation. */
export const TEXTES_SITUATIONS = {
  /** Le titre du haut sans lien de situation : la rumination, dans ses mots (l’étage « ce qu’elle ressent »). */
  titre: ["Tu relis sa conv", "à 2\u00a0h du mat’\u00a0?"] as const,
  sous: "Importe votre conv\u00a0: BLUSH la lit en entier, te dit où vous en êtes, preuves à l’appui, et quoi répondre.",
  choisir: "C’est quoi ta situation\u00a0?",
  choisirSous: "Choisis-la\u00a0: on te montre quelqu’un comme toi, sa conv, et ce que BLUSH y a vu.",
  fictif: "Exemple fictif · prénoms inventés",
  photo: "Photo à shooter",
  etapes: (prenom: string) => `Ce que BLUSH a vu dans la conv de ${prenom}`,
  conv: "Sa conv",
  lue: (messages: string) => `${messages} messages lus par BLUSH en 40\u00a0s`,
  chiffres: "Ses chiffres",
  verdict: "Le verdict",
  preuves: (n: number) => `${n} preuves dans leur conv`,
  chat: (genre: "elle" | "il") => `Ce qu’${genre} demande à BLUSH`,
  rienAEnvoyer: "Rien à envoyer",
  pourquoi: "Pourquoi",
  prochainPas: "Son prochain pas",
  conseil: "Ce que BLUSH lui conseille",
  rapport: (prenom: string) => `Feuillette le rapport de ${prenom}`,
  rapportSous: "Huit chapitres écrits pour son histoire, et le vocal de BLUSH. Dans ton rapport, tout est écrit pour la tienne.",
  vocal: "Le vocal de BLUSH",
  vocalDuree: "0:28",
  vocalSous: "Ton rapport, en 30 secondes, à écouter.",
  contenu: (chapitres: number, bulles: number) => `${chapitres} chapitres · le vocal · ${bulles} réponses de BLUSH`,
  paiement: "une fois, pas d’abonnement",
  avis: "Ils se posaient la même question.",
  /** Ce que la loi demande à côté d’une note (Code de la consommation, art. D.111-17) : d’où elle vient, et quand. */
  origineDeLaNote: "Note donnée par les testeurs de BLUSH, lors de tests menés en université en octobre 2026.",
  origineDesAvis: "Avis de testeurs, publiés avec leur accord, dans leurs mots.",
  questions: "Les questions qu’on se pose avant",
};

/** Les questions de toutes les situations, après celle de la sienne. `prix` : le rapport, déjà écrit (« 9,90 € »). */
export const QUESTIONS_COMMUNES = (prix: string) => [
  {
    q: "Il saura que j’ai importé notre conv\u00a0?",
    r: "Non. Rien ne lui est envoyé, et ta conv brute est effacée après ton rapport.",
  },
  {
    q: "C’est combien\u00a0?",
    r: `Le rapport complet\u00a0: ${prix}, une seule fois. Pas d’abonnement.`,
  },
  {
    q: "Et si BLUSH se trompe\u00a0?",
    r: "Il ne devine rien. Il dit ce que montrent vos messages, avec les preuves, et à quel point il en est sûr.",
  },
];
