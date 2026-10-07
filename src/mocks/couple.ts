import type { BlushAnswer, QuestionAnswer, Reply, Report, SoberReport } from "@/types";

/*
 * L’histoire en couple : la même conv (Hugo & Sophie), lue comme un couple ensemble depuis le 6 janvier,
 * où un truc coince depuis le dîner annulé du 22 février.
 * Elle s’ouvre quand on choisit « On est ensemble » (écran 06), ou avec ?histoire=couple.
 * ⚠ Absent des maquettes : tous ces textes sont à valider.
 * Verdicts en couple, mêmes emojis : 🔥 toujours le feu · 🤏 il manque un petit rien · 🤔 un truc coince · 🧊 vous vous éloignez.
 */

export const COUPLE_STORY_ID = "story-hugo-sophie-couple";

export const COUPLE_REPORT: Report = {
  storyId: COUPLE_STORY_ID,
  verdict: {
    emoji: "🤔",
    short: "Un truc coince",
    title: "Un truc coince.",
    subtitle: "Elle dit « c’est pas grave ». Ses messages disent le contraire.",
    difficult: false,
  },
  readingTime: { free: "3 min", full: "9 min" },
  level: "coince",
  trend: "↘ ça se refroidit",
  nextStep: "Ton prochain pas : rattraper le dîner avec sa sœur.",
  chapters: [
    {
      number: 1,
      title: "Le verdict",
      tocTitle: "Le verdict",
      free: true,
      blocks: [
        {
          kind: "scores",
          rows: [
            { label: "Qui propose des plans", winner: "elle", toiPercent: 25, captionLeft: "toi : 2", captionRight: "elle : 6" },
            { label: "Qui annule", winner: "toi", toiPercent: 80, captionLeft: "toi : 4", captionRight: "elle : 1" },
            { label: "Qui raconte sa journée", winner: "elle", toiPercent: 30, captionRight: "elle, 7 fois sur 10" },
            { label: "Qui répond vite", winner: "pareil", toiPercent: 50, captionLeft: "6 min le soir", captionRight: "6 min le soir" },
          ],
        },
        { kind: "meaning", text: "Vous êtes bien ensemble. Mais depuis trois semaines, elle se retient, et tu ne l’as pas vu." },
        { kind: "confidence", level: "sur", text: "14 preuves dans votre conv" },
      ],
    },
    {
      number: 2,
      title: "Le moment où tout a basculé",
      kicker: "22 févr., 19 h 12",
      tocTitle: "Le moment où tout a basculé",
      free: true,
      blocks: [
        { kind: "essential", text: "Le soir où tu as annulé le dîner avec sa sœur, pour la deuxième fois." },
        {
          kind: "seen",
          messages: [
            { from: "toi", text: "désolé je vais pas pouvoir ce soir, le taf 😩", caption: "Toi · 19:12" },
            { from: "elle", text: "ok.", caption: "Sophie · 19:40" },
            { from: "elle", text: "c’est pas grave", caption: "Sophie · 19:41" },
          ],
          factsAfter: ["Ses messages passent ensuite de 28 mots en moyenne à 11."],
        },
        { kind: "meaning", text: "Son « c’est pas grave » voulait dire l’inverse. Sa sœur Inès revient dans 1 message sur 5 : ce dîner comptait pour elle." },
        { kind: "play", text: "C’est ce dîner qu’il faut rattraper. Pas avec des excuses : avec une date." },
        { kind: "confidence", level: "sur", text: "messages exacts, horodatés" },
      ],
    },
    {
      number: 3,
      title: "Votre histoire",
      kicker: "6 mois, 3 applis",
      tocTitle: "Votre histoire",
      free: false,
      blocks: [
        {
          kind: "timeline",
          items: [
            { title: "Hinge · 2 sept.", text: "Elle t’écrit la première, sur ta photo d’escalade." },
            { title: "Le premier date · 14 déc.", text: "Le libanais. Le lendemain, c’est elle qui écrit la première." },
            { title: "Ensemble · 6 janv.", text: "C’est elle qui pose la question. Tu dis oui en 40 secondes.", message: { from: "elle", text: "bon du coup on est ensemble ou pas 😅" } },
            { title: "Le dîner annulé · 22 févr.", text: "Depuis, elle n’a plus proposé un seul plan." },
          ],
        },
        { kind: "meaning", text: "Pendant deux mois, c’est elle qui a fait avancer votre histoire. Là, elle attend de voir si tu suis." },
      ],
    },
    {
      number: 4,
      title: "Ce que vous ne dites pas",
      kicker: "les 4 « c’est pas grave »",
      tocTitle: "Ce que vous ne dites pas",
      free: false,
      blocks: [
        { kind: "essential", text: "Quatre fois en trois semaines, elle a écrit « c’est pas grave ». Quatre fois, tu l’as crue." },
        {
          kind: "seen",
          messages: [
            { from: "elle", text: "c’est pas grave, vas-y avec tes potes", caption: "28 févr." },
            { from: "toi", text: "t’es la meilleure 🙏" },
            { from: "elle", text: "inès demande si tu viens à son anniv le 20", caption: "6 mars" },
            { from: "toi", text: "je vais essayer" },
          ],
        },
        { kind: "play", text: "La prochaine fois qu’elle écrit « c’est pas grave », réponds : « Si, ça compte. On en parle ce soir ? »" },
      ],
    },
    {
      number: 5,
      title: "Elle",
      kicker: "son portrait : l’Attentionnée",
      tocTitle: "Elle",
      free: false,
      blocks: [
        { kind: "essential", text: "Elle montre qu’elle tient à toi en pensant à tout : elle propose, elle retient, elle demande comment tu vas." },
        {
          kind: "seen",
          facts: ["6 plans proposés en janvier, aucun depuis le 22 février · 23 vocaux en janvier, 2 depuis."],
          messages: [{ from: "elle", text: "t’as mangé ce midi ? tu dis jamais quand t’es crevé", caption: "18 févr." }],
        },
        { kind: "play", text: "Elle ne va pas te demander d’en faire plus. Elle va arrêter de proposer, et c’est déjà commencé. Cette semaine, c’est toi qui proposes." },
      ],
    },
    {
      number: 6,
      title: "Toi",
      kicker: "ton portrait : le Débordé",
      tocTitle: "Toi",
      free: false,
      blocks: [
        { kind: "essential", text: "Tu réponds toujours, mais en courant." },
        { kind: "meaning", text: "Pour toi, « désolé, le taf » est une explication. Pour elle, c’est la quatrième fois en trois semaines qu’elle passe après." },
        { kind: "play", text: "Cette semaine : chaque jour, un message qui n’est pas de l’organisation." },
      ],
    },
    {
      number: 7,
      title: "Votre duo",
      kicker: "à partager, prénoms masqués",
      tocTitle: "Votre duo",
      free: false,
      blocks: [
        {
          kind: "duo",
          title: "Le Débordé & l’Attentionnée",
          text: "Des fous rires, un code à vous (« le libanais »), et l’envie d’avancer. Il manque juste de vous le redire.",
          trophies: [
            { title: "Le « désolé, le taf »", text: "H. · 4 annulations en 3 semaines", side: "toi" },
            { title: "La reine du vocal", text: "S. · 23 vocaux en janvier", side: "elle" },
          ],
        },
      ],
    },
    {
      number: 8,
      title: "Ton prochain pas",
      tocTitle: "Ton prochain pas",
      free: false,
      blocks: [
        {
          kind: "scenarios",
          items: [
            { title: "Si tu ne fais rien", text: "Elle continue de dire « c’est pas grave », et elle prend ses distances sans te le dire.", tag: "probable" },
            { title: "Si tu rattrapes le dîner avec Inès", text: "Le meilleur scénario : c’est ce qu’elle attend depuis le 22 février.", tag: "meilleur" },
          ],
        },
        {
          kind: "plan",
          items: [
            { when: "Ce soir", title: "Reparle du dîner raté", text: "Sans te justifier : dis-lui que ça compte." },
            { when: "Jeudi", title: "Écris-lui pour son exam", text: "Elle t’en a parlé 3 fois." },
            { when: "Le 20", title: "Va à l’anniversaire d’Inès", text: "Et dis-le-lui dès ce soir." },
          ],
        },
        { kind: "question", label: "LA phrase", text: "« J’ai annulé deux fois, et je sais que ça t’a fait de la peine. Inès compte pour toi, donc pour moi. Je serai là le 20. »" },
      ],
    },
  ],
};

/** Mode sobre en couple : quand elle prend ses distances. */
export const COUPLE_SOBER_REPORT: SoberReport = {
  intro: "Je vais être honnête avec toi.",
  title: "Elle prend ses distances.",
  facts: "Depuis trois semaines, elle ne propose plus rien et ne t’envoie presque plus de vocaux. Ses messages font 6 mots en moyenne, contre 28 en janvier.",
  reassurance: "Ça ne veut pas dire que c’est fini. Ça veut dire qu’il faut en parler, maintenant.",
  steps: [
    "Ne fais pas comme si de rien n’était : elle le sent.",
    "Propose-lui d’en parler en face, cette semaine. Pas par message.",
    "Écoute-la d’abord. Tes explications viendront après.",
  ],
  draftLabel: "Si tu veux lui écrire",
  draft: "J’ai l’impression qu’on s’éloigne, et je n’ai pas envie de ça. On peut en parler ce week-end, juste nous deux ?",
  helpLabel: "Besoin d’en parler à quelqu’un ?",
};

export const COUPLE_QUESTION_ANSWER: QuestionAnswer = {
  question: "Est-ce qu’elle m’en veut ?",
  title: "Oui, pour le dîner avec Inès. Et elle ne te le dira pas d’elle-même.",
  evidenceLabel: "Ce qui va dans ce sens",
  evidence: "Depuis le 22 février, elle a écrit 4 fois « c’est pas grave », et elle ne propose plus rien. En janvier, c’était 6 plans.",
  confidence: "probable",
  limits: "BLUSH ne voit que vos messages.",
};

/** Des questions toutes prêtes, tirées du rapport, avec la réponse de BLUSH (simulation). */
export const COUPLE_QUESTION_IDEAS: QuestionAnswer[] = [
  COUPLE_QUESTION_ANSWER,
  {
    question: "Que voulait dire son « ok. » du 22 février ?",
    title: "Qu’elle était blessée, et qu’elle ne voulait pas se disputer par message.",
    evidenceLabel: "Ce qu’on voit",
    message: { from: "elle", text: "ok.", caption: "Sophie · 22 févr., 19:40" },
    evidence: "Elle met 28 minutes à répondre, contre 6 d’habitude. Puis elle ajoute « c’est pas grave », une minute après.",
    confidence: "sur",
    limits: "messages exacts, horodatés",
  },
  {
    question: "Est-ce qu’elle est moins amoureuse ?",
    title: "Rien ne le dit. Elle se protège.",
    evidenceLabel: "Ce qu’on voit",
    evidence: "Elle te demande encore chaque jour comment tu vas, et elle veut toujours te présenter sa sœur. Ce qui a baissé, c’est ce qu’elle propose.",
    confidence: "probable",
    limits: "BLUSH ne voit que vos messages.",
  },
  {
    question: "Comment rattraper le dîner sans en faire trop ?",
    title: "Avec une date, pas avec des excuses.",
    evidenceLabel: "Ce qu’on voit",
    evidence: "Elle t’a parlé 3 fois de l’anniversaire d’Inès, le 20. « Je serai là le 20 » vaut mieux qu’un long message.",
    confidence: "probable",
    limits: "BLUSH ne voit que vos messages.",
  },
];

export const COUPLE_REPLY: Reply = {
  messageId: "msg-101",
  incoming: { from: "elle", text: "c’est pas grave, on fera ça une autre fois", caption: "Sophie · lu sur ta capture" },
  sourceLabel: "lu sur ta capture",
  meaningTitle: "Elle est déçue, et elle n’ose pas insister.",
  meaningProof: "Le 22 février, elle a écrit presque la même chose. Ses messages ont raccourci juste après.",
  best: "Si, ça compte pour moi. Samedi soir, rien que nous deux ?",
  why: "Elle dit « c’est pas grave » quand ça l’est. Une date précise lui montre que tu as compris.",
};

export const COUPLE_VOICE_ANSWER: QuestionAnswer = {
  question: "Ton vocal",
  title: "Je t’ai écouté. Rattrape le dîner avec Inès.",
  evidenceLabel: "Pourquoi",
  evidence: "Depuis le 22 février, elle a écrit 4 fois « c’est pas grave ». Ce qu’elle attend, c’est une date, pas une explication.",
  confidence: "probable",
  limits: "BLUSH ne voit que vos messages.",
};

/** Son dernier message, tel que BLUSH l’a lu dans votre conv. */
const LAST_MESSAGE: Reply = { ...COUPLE_REPLY, incoming: { ...COUPLE_REPLY.incoming, caption: "Sophie · son dernier message" } };

/** Les questions toutes prêtes du chat, en couple. */
export const COUPLE_QUICK_QUESTIONS: { question: string; answer: BlushAnswer }[] = [
  { question: "Ça veut dire quoi ?", answer: { kind: "analysis", reply: LAST_MESSAGE, quoted: true } },
  { question: "Je lui réponds quoi ?", answer: { kind: "best", reply: LAST_MESSAGE } },
  { question: "Elle m’en veut ?", answer: { kind: "answer", answer: { ...COUPLE_QUESTION_ANSWER, question: "Elle m’en veut ?" } } },
  {
    question: "On en est où ?",
    answer: {
      kind: "level",
      answer: {
        question: "On en est où ?",
        title: "Un truc coince, et ça se refroidit depuis trois semaines.",
        evidenceLabel: "Ce qu’on voit",
        evidence: "Depuis le dîner annulé du 22 février, elle ne propose plus rien et ses messages ont raccourci de moitié. Mais elle t’écrit encore tous les soirs.",
        confidence: "sur",
        limits: "14 preuves dans votre conv",
      },
    },
  },
];

/** Ce que BLUSH remarque pendant la lecture (écran 08) : elle, toi, le moment. */
export const COUPLE_READING_DISCOVERIES = ["« c’est pas grave » × 4", "4 annulations", "22 févr., 19 h 12"];

/** Sa fiche : la même personne, avec le portrait et le rappel de cette histoire. */
export const COUPLE_FICHE = {
  portrait: "L’Attentionnée",
  summary: "L’anniversaire d’Inès est le 20 · elle t’en a parlé 3 fois",
  summaryShort: "L’anniversaire d’Inès, le 20",
};
