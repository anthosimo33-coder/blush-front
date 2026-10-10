import { estOffert } from "@/contenu/chapitres";
import type { Report, Source, Story } from "@/types";

/*
 * L’histoire d’exemple de l’aperçu de l’écriture (en local seulement) : Hugo et Sophie, données reprises des maquettes.
 * En production, elles viennent de l’analyse réelle.
 */

const PEOPLE = {
  hugo: { id: "hugo", name: "Hugo", initial: "H" },
  sophie: { id: "sophie", name: "Sophie", initial: "S" },
} as const;

/** L’autre personne (Hugo est celui qui lit) : son prénom est le titre d’attente du chapitre 5, comme sur le serveur. */
export const AUTRE = PEOPLE.sophie.name;

const SOURCE_WHATSAPP: Source = {
  id: "src-whatsapp",
  app: "whatsapp",
  mode: "export",
  fileName: "Discussion avec Sophie.zip",
  label: "Depuis votre premier date",
  period: "14 déc. → 12 mars",
  messageCount: 1074,
  voiceCount: 11,
};

const SOURCE_HINGE: Source = {
  id: "src-hinge",
  app: "hinge",
  mode: "captures",
  screenshotCount: 2,
  label: "Le match",
  period: "2 sept.",
  messageCount: 12,
};

const SOURCE_INSTAGRAM: Source = {
  id: "src-instagram",
  app: "instagram",
  mode: "captures",
  screenshotCount: 4,
  label: "Les premiers DM",
  period: "sept. → déc.",
  messageCount: 116,
};

export const STORY: Story = {
  id: "story-hugo-sophie",
  participants: [PEOPLE.hugo, PEOPLE.sophie],
  /* Remises dans l’ordre : Hinge, puis Insta, puis WhatsApp */
  sources: [SOURCE_HINGE, SOURCE_INSTAGRAM, SOURCE_WHATSAPP],
  totalMessages: 1202,
  voiceCount: 11,
  period: "14 déc. → 12 mars",
  durationLabel: "6 mois",
  updatedLabel: "mis à jour le 12 mars",
};

export const REPORT: Report = {
  storyId: "story-hugo-sophie",
  verdict: {
    emoji: "🤏",
    short: "À deux doigts",
    title: "Vous êtes à deux doigts.",
    subtitle: "Et vous faites tous les deux semblant de rien.",
  },
  readingTime: { free: "3 min", full: "9 min" },
  level: "dit",
  trend: "↗ ça se réchauffe",
  nextStep: "Ton prochain pas\u00a0: lui demander samedi, en face.",
  chapters: [
    {
      number: 1,
      title: "Le verdict",
      tocTitle: "Le verdict",
      free: estOffert(1),
      blocks: [
        {
          kind: "scores",
          rows: [
            { label: "Qui écrit en premier", winner: "toi", toiPercent: 62, captionLeft: "toi, 6 fois sur 10" },
            { label: "Qui relance après un silence", winner: "elle", toiPercent: 30, captionRight: "elle, 7 fois sur 10" },
            { label: "Qui propose des plans", winner: "elle", toiPercent: 20, captionLeft: "toi\u00a0: 1", captionRight: "elle\u00a0: 4" },
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
      free: estOffert(2),
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
        { kind: "meaning", text: "Son «\u00a0mdr\u00a0» était une porte de sortie au cas où. Tu l’as prise. Elle attend que ce soit toi qui reposes la question." },
        { kind: "play", text: "C’est la question que tu vas lui reposer, en face." },
        { kind: "confidence", level: "sur", text: "messages exacts, horodatés" },
      ],
    },
    {
      number: 3,
      title: "Votre histoire",
      kicker: "6 mois, 3 applis",
      tocTitle: "Votre histoire",
      free: estOffert(3),
      blocks: [
        {
          kind: "timeline",
          items: [
            { title: "Hinge · 2 sept.", text: "Elle t’écrit la première, sur ta photo d’escalade.", message: { from: "elle", text: "c’est toi qui grimpes sans corde là\u00a0?? 😳" } },
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
      free: estOffert(4),
      blocks: [
        { kind: "essential", text: "Trois fois, elle a fait un pas vers «\u00a0nous\u00a0». Trois fois, tu as répondu par une blague." },
        {
          kind: "seen",
          messages: [
            { from: "elle", text: "tu fais quoi pour la saint-valentin\u00a0? 👀", caption: "13 févr." },
            { from: "toi", text: "rien de spécial et toi" },
            { from: "elle", text: "ma sœur veut te rencontrer mdr", caption: "6 mars" },
            { from: "toi", text: "haha grave un jour" },
          ],
        },
        { kind: "play", text: "La prochaine fois qu’elle parle de «\u00a0vous\u00a0», réponds au premier degré." },
      ],
    },
    {
      number: 5,
      title: "Elle",
      kicker: "son portrait\u00a0: la Relanceuse",
      tocTitle: "Elle",
      free: estOffert(5),
      blocks: [
        { kind: "essential", text: "Elle montre son intérêt en agissant\u00a0: elle propose, elle relance, elle se livre." },
        {
          kind: "seen",
          facts: ["Relance après 22 h, 7 fois sur 10 · 4 plans en un mois · 11 vocaux."],
          messages: [{ from: "elle", text: "dimanche y’a un marché de noël à côté du libanais 👀", caption: "8 févr." }],
        },
        { kind: "play", text: "Quand tu proposes, donne une date et une heure\u00a0: elle répond alors en moins de 10 minutes." },
      ],
    },
    {
      number: 6,
      title: "Toi",
      kicker: "ton portrait\u00a0: le Stratège",
      tocTitle: "Toi",
      free: estOffert(6),
      blocks: [
        { kind: "essential", text: "Quand ça devient sérieux, tu fais une blague." },
        { kind: "meaning", text: "C’est une façon de te protéger d’un «\u00a0non\u00a0». Elle, elle y lit de la distance." },
        { kind: "play", text: "Cette semaine\u00a0: quand elle propose, tu fixes une date." },
      ],
    },
    {
      number: 7,
      title: "Votre duo",
      kicker: "à partager, prénoms masqués",
      tocTitle: "Votre duo",
      free: estOffert(7),
      blocks: [
        {
          kind: "duo",
          title: "Le Stratège & la Relanceuse",
          text: "Le même rythme, des fous rires tous les jours, et un code à vous\u00a0: «\u00a0le libanais\u00a0».",
          trophies: [
            { title: "Le mdr stratégique", text: "H. · 3 «\u00a0mdr\u00a0» aux 3 pires moments", side: "toi" },
            { title: "La reine de la relance", text: "S. · 7 relances sur 10", side: "elle" },
          ],
        },
      ],
    },
    {
      number: 8,
      title: "Ton prochain pas",
      tocTitle: "Ton prochain pas",
      free: estOffert(8),
      blocks: [
        {
          kind: "scenarios",
          items: [
            { title: "Si tu ne fais rien", text: "Elle relance encore 2 ou 3 semaines, puis elle s’éloigne.", tag: "probable" },
            { title: "Si tu lui demandes samedi, en face", text: "Le meilleur scénario\u00a0: en vrai, c’est elle qui ose le plus.", tag: "meilleur" },
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
        { kind: "question", label: "LA question", text: "«\u00a0J’aime bien ce qu’on a. Toi, tu le vois comment\u00a0?\u00a0»" },
      ],
    },
  ],
};
