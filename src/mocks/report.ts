import type { Guess, QuestionAnswer, Report, SoberReport } from "@/types";

export const GUESS_LABELS: Record<Guess, { tile: string; quote: string }> = {
  parle: { tile: "On se parle", quote: "« on se parle »" },
  vus: { tile: "On s’est vus", quote: "« on s’est vus »" },
  flou: { tile: "C’est flou", quote: "« c’est flou »" },
};

export const REPORT: Report = {
  storyId: "story-hugo-sophie",
  verdict: {
    emoji: "🤏",
    short: "À deux doigts",
    title: "Vous êtes à deux doigts.",
    subtitle: "Et vous faites tous les deux semblant de rien.",
    difficult: false,
  },
  readingTime: { free: "3 min", full: "9 min" },
  level: "dit",
  trend: "↗ ça se réchauffe",
  nextStep: "Ton prochain pas : lui demander samedi, en face.",
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
            { label: "Qui écrit en premier", winner: "toi", toiPercent: 62, captionLeft: "toi, 6 fois sur 10" },
            { label: "Qui relance après un silence", winner: "elle", toiPercent: 30, captionRight: "elle, 7 fois sur 10" },
            { label: "Qui propose des plans", winner: "elle", toiPercent: 20, captionLeft: "toi : 1", captionRight: "elle : 4" },
            { label: "Qui répond vite", winner: "pareil", toiPercent: 50, captionLeft: "4 min le soir", captionRight: "4 min le soir" },
          ],
        },
        { kind: "meaning", text: "L’envie est là des deux côtés. Il manque juste que l’un de vous le dise." },
        { kind: "confidence", level: "sur", text: "12 preuves dans votre conv" },
      ],
    },
    {
      number: 2,
      title: "Le moment où tout a basculé",
      kicker: "2 mars, 23 h 41",
      tocTitle: "Le moment où tout a basculé",
      free: true,
      blocks: [
        { kind: "essential", text: "La seule fois où l’un de vous a posé la question, c’était elle." },
        {
          kind: "seen",
          messages: [
            { from: "elle", text: "au fait on est quoi toi et moi mdr", caption: "Sophie · 23:41" },
            { from: "toi", text: "mdr", caption: "Toi · 23:42" },
          ],
          factsAfter: ["Ses messages passent ensuite de 31 mots en moyenne à 14."],
        },
        { kind: "meaning", text: "Son « mdr » était une porte de sortie au cas où. Tu l’as prise. Elle attend que ce soit toi qui reposes la question." },
        { kind: "play", text: "C’est la question que tu vas lui reposer, en face." },
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
            { title: "Hinge · 2 sept.", text: "Elle t’écrit la première, sur ta photo d’escalade.", message: { from: "elle", text: "c’est toi qui grimpes sans corde là ?? 😳" } },
            { title: "Insta · sept. → déc.", text: "Trois mois de memes. C’est elle qui propose de se voir, deux fois." },
            { title: "Le premier date · 14 déc.", text: "Le libanais. Le lendemain, c’est encore elle qui écrit la première." },
          ],
        },
        { kind: "meaning", text: "À chaque étape, c’est elle qui fait le premier pas. La prochaine, c’est à toi." },
      ],
    },
    {
      number: 4,
      title: "Ce que vous ne dites pas",
      kicker: "les 3 esquives",
      tocTitle: "Ce que vous ne dites pas",
      free: false,
      blocks: [
        { kind: "essential", text: "Trois fois, elle a fait un pas vers « nous ». Trois fois, tu as répondu par une blague." },
        {
          kind: "seen",
          messages: [
            { from: "elle", text: "tu fais quoi pour la saint-valentin ? 👀", caption: "13 févr." },
            { from: "toi", text: "rien de spécial et toi" },
            { from: "elle", text: "ma sœur veut te rencontrer mdr", caption: "6 mars" },
            { from: "toi", text: "haha grave un jour" },
          ],
        },
        { kind: "play", text: "La prochaine fois qu’elle parle de « vous », réponds au premier degré." },
      ],
    },
    {
      number: 5,
      title: "Elle",
      kicker: "son portrait : la Relanceuse",
      tocTitle: "Elle",
      free: false,
      blocks: [
        { kind: "essential", text: "Elle montre son intérêt en agissant : elle propose, elle relance, elle se livre." },
        {
          kind: "seen",
          facts: ["Relance après 22 h, 7 fois sur 10 · 4 plans en un mois · 11 vocaux."],
          messages: [{ from: "elle", text: "dimanche y’a un marché de noël à côté du libanais 👀", caption: "8 févr." }],
        },
        { kind: "play", text: "Quand tu proposes, donne une date et une heure : elle répond alors en moins de 10 minutes." },
      ],
    },
    {
      number: 6,
      title: "Toi",
      kicker: "ton portrait : le Stratège",
      tocTitle: "Toi",
      free: false,
      blocks: [
        { kind: "essential", text: "Quand ça devient sérieux, tu fais une blague." },
        { kind: "meaning", text: "C’est une façon de te protéger d’un « non ». Elle, elle y lit de la distance." },
        { kind: "play", text: "Cette semaine : quand elle propose, tu fixes une date." },
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
          title: "Le Stratège & la Relanceuse",
          text: "Le même rythme, des fous rires tous les jours, et un code à vous : « le libanais ».",
          trophies: [
            { title: "Le mdr stratégique", text: "H. · 3 « mdr » aux 3 pires moments", side: "toi" },
            { title: "La reine de la relance", text: "S. · 7 relances sur 10", side: "elle" },
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
            { title: "Si tu ne fais rien", text: "Elle relance encore 2 ou 3 semaines, puis elle s’éloigne.", tag: "probable" },
            { title: "Si tu lui demandes samedi, en face", text: "Le meilleur scénario : en vrai, c’est elle qui ose le plus.", tag: "meilleur" },
          ],
        },
        {
          kind: "plan",
          items: [
            { when: "Aujourd’hui", title: "Fixe enfin le libanais", text: "Un jour et une heure." },
            { when: "Jeudi", title: "Écris-lui pour son exam", text: "Elle t’en a parlé 3 fois." },
            { when: "Samedi", title: "Pose LA question, en face", text: "Au dessert." },
          ],
        },
        { kind: "question", label: "LA question", text: "« J’aime bien ce qu’on a. Toi, tu le vois comment ? »" },
      ],
    },
  ],
};

/** Mode sobre : quand elle ne ressent pas la même chose (écrans 18 et 19). */
export const SOBER_REPORT: SoberReport = {
  intro: "Je vais être honnête avec toi.",
  title: "Elle ne ressent pas la même chose.",
  facts: "Elle répond, mais elle ne relance plus depuis 3 semaines. Ses messages font 4 mots en moyenne, contre 31 en janvier.",
  reassurance: "Ça ne dit rien de ce que tu vaux. Ça dit juste où elle en est.",
  steps: [
    "Arrête de relancer. Laisse-lui la porte ouverte, sans la tenir.",
    "Si tu as besoin d’une réponse claire, pose la question une fois. Puis laisse-la répondre.",
    "Prends deux semaines pour toi. Si quelque chose change, on regardera ensemble.",
  ],
  draftLabel: "Si tu veux lui écrire",
  draft: "J’ai l’impression qu’on n’est pas sur la même longueur d’onde. Je te laisse respirer.",
  helpLabel: "Besoin d’en parler à quelqu’un ?",
};

export const QUESTION_ANSWER: QuestionAnswer = {
  question: "Est-ce qu’elle voit quelqu’un d’autre ?",
  title: "Rien ne l’indique dans votre conv.",
  evidenceLabel: "Ce qui va dans ce sens",
  evidence: "Elle te parle tous les soirs entre 22 h et 1 h, 6 jours sur 7. Ses week-ends, elle te les raconte.",
  confidence: "probable",
  limits: "BLUSH ne voit que vos messages.",
};

/**
 * Des questions toutes prêtes, tirées du rapport, avec la réponse de BLUSH (simulation : en vrai, le back-end répond).
 * Chaque réponse reprend des faits du rapport. ⚠ Absent des maquettes : textes à valider.
 */
export const QUESTION_IDEAS: QuestionAnswer[] = [
  QUESTION_ANSWER,
  {
    question: "Que voulait dire son « on est quoi » du 2 mars ?",
    title: "Elle te demandait où vous en étiez, en gardant une porte de sortie.",
    evidenceLabel: "Ce qu’on voit",
    message: { from: "elle", text: "au fait on est quoi toi et moi mdr", caption: "Sophie · 2 mars, 23:41" },
    evidence: "Son « mdr » permettait d’en rire si tu ne suivais pas. Après ton « mdr », ses messages passent de 31 mots en moyenne à 14.",
    confidence: "sur",
    limits: "messages exacts, horodatés",
  },
  {
    question: "Pourquoi elle relance toujours après 22 h ?",
    title: "C’est son moment pour toi, une fois sa journée finie.",
    evidenceLabel: "Ce qu’on voit",
    evidence: "Après 22 h, c’est elle qui relance, 7 fois sur 10. Et le soir, elle te répond en 4 min.",
    confidence: "probable",
    limits: "BLUSH ne voit que vos messages.",
  },
  {
    question: "Comment lui proposer samedi sans la brusquer ?",
    title: "Avec un jour et une heure, simplement.",
    evidenceLabel: "Ce qu’on voit",
    evidence: "4 plans sur 5 viennent d’elle. Quand tu proposes une date et une heure, elle répond en moins de 10 minutes.",
    confidence: "probable",
    limits: "BLUSH ne voit que vos messages.",
  },
];
