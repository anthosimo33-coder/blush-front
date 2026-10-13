import type { ReportPayload } from "@/types/api";
import type { Chapter, Report, SoberReport, Story } from "@/types";

/*
 * Un rapport inventé de bout en bout (aucune vraie conv), pour les tests du rapport en PDF et ses exemples : Noé importe
 * sa conv avec Maëlys. Ses huit chapitres ont toutes les sortes de blocs que l’écran sait montrer (src/components/ui/
 * report.tsx), des messages cités avec leurs emojis, et une suite fermée pour l’aperçu gratuit. Sans base.
 */

/** L’histoire de l’en-tête : Noé (toi) et Maëlys, une conv WhatsApp de l’été. */
export const HISTOIRE: Story = {
  id: "00000000-0000-4000-8000-000000000001",
  participants: [
    { id: "p0", name: "Noé", initial: "N" },
    { id: "p1", name: "Maëlys", initial: "M", pronoun: "elle" },
  ],
  sources: [
    { id: "s0", app: "whatsapp", mode: "export", fileName: "WhatsApp Chat - Maëlys.zip", label: "Votre conv", period: "14 juin → 4 sept.", messageCount: 1274, voiceCount: 9 },
  ],
  totalMessages: 1274,
  voiceCount: 9,
  period: "14 juin → 4 sept.",
  durationLabel: "3 mois",
  updatedLabel: "aujourd’hui",
  me: "p0",
};

const VERDICT: Report["verdict"] = {
  emoji: "🤏",
  short: "À deux doigts",
  title: "Vous êtes à deux doigts.",
  subtitle: "Elle a posé LA question le 4 septembre. Toi, t’as répondu par un mème.",
};

const SCORES: Extract<Chapter["blocks"][number], { kind: "scores" }> = {
  kind: "scores",
  rows: [
    { label: "Qui écrit en premier", winner: "toi", toiPercent: 61, captionLeft: "toi, 6 fois sur 10" },
    { label: "Qui relance après un silence", winner: "elle", toiPercent: 28, captionRight: "elle, 7 fois sur 10" },
    { label: "Qui propose des plans", winner: "elle", toiPercent: 20, captionLeft: "toi\u00a0: 1", captionRight: "elle\u00a0: 4" },
    { label: "Qui répond vite", winner: "pareil", toiPercent: 50, captionLeft: "6 min le soir", captionRight: "6 min le soir" },
  ],
};

/** Les huit chapitres du rapport complet, toutes leurs sortes de blocs. */
const CHAPITRES: Chapter[] = [
  {
    number: 1,
    title: "Le verdict",
    tocTitle: "Le verdict",
    free: true,
    blocks: [
      { kind: "lead", text: "Assieds-toi. Trois mois de conv, 1\u00a0274 messages, et une seule vraie question posée.\nDevine qui l’a posée." },
      SCORES,
      { kind: "meaning", text: "L’envie est là des deux côtés. Il manque juste que l’un de vous le dise à voix haute." },
      { kind: "confidence", level: "sur", text: "14 preuves dans votre conv" },
      {
        kind: "story",
        text: "Le 4 septembre, à 23 h 12, Maëlys écrit enfin ce que vous tournez autour depuis juin.",
        messages: [
          { from: "elle", text: "bon on est quoi toi et moi 🙃", caption: "Maëlys · 04/09 23:12" },
          { from: "toi", text: "deux légendes du karaoké 🎤", caption: "Toi · 04/09 23:14" },
        ],
      },
      { kind: "punchline", text: "Elle a ouvert la porte. Tu as répondu avec un micro." },
    ],
  },
  {
    number: 2,
    title: "Le moment où tout a basculé",
    kicker: "4 sept., 23 h 12",
    tocTitle: "Le moment où tout a basculé",
    free: false,
    blocks: [
      { kind: "essential", text: "La seule fois où l’un de vous a posé la question, c’était elle." },
      {
        kind: "seen",
        messages: [
          { from: "elle", text: "bon on est quoi toi et moi 🙃", caption: "Maëlys · 04/09 23:12" },
          { from: "toi", text: "deux légendes du karaoké 🎤", caption: "Toi · 04/09 23:14" },
          { from: "elle", text: "ok 😅", caption: "Maëlys · 04/09 23:31" },
        ],
        factsAfter: ["Ses messages passent ensuite de 28 mots en moyenne à 9."],
      },
      { kind: "meaning", text: "Son «\u00a0🙃\u00a0» était une porte de sortie, au cas où. Tu l’as prise. Elle attend que ce soit toi qui reposes la question." },
      { kind: "play", text: "Repose-lui la question, en face, et sans blague cette fois." },
      { kind: "confidence", level: "sur", text: "messages exacts, horodatés" },
    ],
  },
  {
    number: 3,
    title: "Votre histoire",
    kicker: "3 mois, 1 appli",
    tocTitle: "Votre histoire",
    free: false,
    blocks: [
      {
        kind: "timeline",
        items: [
          {
            title: "14 juin · le premier message",
            text: "Elle t’écrit la première, à propos de ta playlist de la fête de la musique.",
            message: { from: "elle", text: "c’est toi qui as mis Céline Dion à 2 h du mat\u00a0?? 😭" },
          },
          { title: "Juillet · les vocaux", text: "Neuf vocaux en un mois, dont quatre après minuit. Le ton change\u00a0: vous ne parlez plus de musique." },
          { title: "21 août · le premier date", text: "Le karaoké de la rue Oberkampf. Le lendemain, c’est encore elle qui écrit." },
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
      { kind: "lead", text: "Trois fois, elle a fait un pas vers «\u00a0nous\u00a0». Trois fois, tu as répondu par une blague." },
      {
        kind: "story",
        text: "Ça commence en douceur, mi-août. Elle teste, l’air de rien.\nEt toi, tu fais ce que tu fais de mieux\u00a0: tu fais rire.",
        messages: [
          { from: "elle", text: "ma sœur veut te rencontrer mdr", caption: "Maëlys · 16/08 19:02" },
          { from: "toi", text: "haha grave un jour", caption: "Toi · 16/08 19:40" },
          { from: "elle", text: "tu fais quoi le 31\u00a0? 👀", caption: "Maëlys · 28/08 22:15" },
          { from: "toi", text: "je dors mdr", caption: "Toi · 28/08 22:16" },
        ],
      },
      {
        kind: "stop",
        items: [
          {
            title: "Le «\u00a0mdr\u00a0» qui ferme la porte",
            text: "Quand elle parle de vous, un «\u00a0mdr\u00a0» sonne comme un non. Elle ne le reprend jamais après.",
            messages: [{ from: "toi", text: "mdr on verra", caption: "Toi · 02/09 00:41" }],
          },
          { title: "Le silence du week-end", text: "Deux week-ends de suite, tu réponds le lundi. Elle, elle a relancé le samedi." },
        ],
      },
      { kind: "punchline", text: "Tu ne dis jamais non. Tu ne dis jamais oui non plus." },
    ],
  },
  {
    number: 5,
    title: "Elle",
    kicker: "son portrait\u00a0: la Relanceuse",
    tocTitle: "Elle",
    free: false,
    blocks: [
      { kind: "essential", text: "Elle montre son intérêt en agissant\u00a0: elle propose, elle relance, elle se livre." },
      {
        kind: "seen",
        title: "Ce qu’elle fait",
        facts: ["Relance après 22 h, 7 fois sur 10", "4 plans proposés en un mois", "6 vocaux sur 9, c’est elle"],
        messages: [{ from: "elle", text: "dimanche y’a un vide-grenier à côté du karaoké, tu viens\u00a0? 🛍️", caption: "Maëlys · 25/08 11:03" }],
      },
      { kind: "play", text: "Quand tu proposes, donne un jour et une heure\u00a0: elle répond alors en moins de 10 minutes." },
    ],
  },
  {
    number: 6,
    title: "Toi",
    kicker: "ton portrait\u00a0: le Stratège",
    tocTitle: "Toi",
    free: false,
    blocks: [
      { kind: "essential", text: "Quand ça devient sérieux, tu fais une blague." },
      { kind: "meaning", text: "C’est ta façon de te protéger d’un «\u00a0non\u00a0». Elle, elle y lit de la distance." },
      { kind: "play", text: "Cette semaine\u00a0: quand elle propose quelque chose, tu fixes une date, tout de suite." },
      { kind: "punchline", text: "Ton humour, c’est ton armure. Elle voudrait voir ce qu’il y a dessous." },
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
        text: "Le même humour, des fous rires tous les soirs, et un code à vous\u00a0: «\u00a0Céline à 2 h du mat\u00a0».",
        trophies: [
          { title: "Le mdr stratégique", text: "N. · 3 «\u00a0mdr\u00a0» aux 3 pires moments", side: "toi" },
          { title: "La reine de la relance", text: "M. · 7 relances sur 10", side: "elle" },
        ],
      },
      { kind: "punchline", text: "Vous êtes drôles ensemble. Il serait temps d’être sérieux, un soir." },
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
          { title: "Si tu ne fais rien", text: "Elle relance encore deux ou trois semaines, puis elle s’éloigne doucement.", tag: "probable" },
          { title: "Si tu lui demandes samedi, en face", text: "Le meilleur scénario\u00a0: c’est elle qui ose le plus, elle n’attend que ça.", tag: "meilleur" },
        ],
      },
      {
        kind: "plan",
        items: [
          { when: "Aujourd’hui", title: "Propose le vide-grenier", text: "Un jour, une heure." },
          { when: "Jeudi", title: "Écris-lui pour son concert", text: "Elle t’en a parlé trois fois." },
          { when: "Samedi", title: "Pose LA question, en face", text: "Au dessert, sans mème." },
        ],
      },
      { kind: "question", label: "LA question", text: "«\u00a0J’aime bien ce qu’on a. Toi, tu le vois comment\u00a0?\u00a0»" },
      {
        kind: "ending",
        text: "Tu n’as rien raté. Tu as juste été prudent un peu trop longtemps.\nSamedi, sois aussi drôle que d’habitude, et une seconde sérieux. Elle n’attend que ça.",
      },
    ],
  },
];

/** Ce que la lecture rend d’un rapport débloqué et écrit, avec son vocal prêt. */
export const rapportComplet = (): ReportPayload => ({
  report: { storyId: HISTOIRE.id, verdict: VERDICT, chapters: CHAPITRES, readingTime: { free: "1 min", full: "9 min" }, level: "dit", trend: "↗ ça se réchauffe", nextStep: "" },
  sober: null,
  debloque: true,
  vocal: { etat: "pret", audio: "/api/vocal/audio", duree: 24, voix: "A", sobre: false, lignes: [] },
});

/**
 * Ce que la lecture rend sans l’accès (assemblerRapport) : le chapitre 1 fait du verdict seul (ses scores, ce que ça veut
 * dire, la confiance), puis les sept autres fermés, vides, sous leurs titres.
 */
export const rapportGratuit = (): ReportPayload => ({
  report: {
    ...rapportComplet().report,
    chapters: [
      { number: 1, title: "Le verdict", tocTitle: "Le verdict", free: true, blocks: [SCORES, CHAPITRES[0]!.blocks[2]!, CHAPITRES[0]!.blocks[3]!] },
      ...CHAPITRES.slice(1).map((c) => ({ number: c.number, title: c.title, tocTitle: c.tocTitle, free: false, locked: true, blocks: [] })),
    ],
  },
  sober: null,
  debloque: false,
});

const SOBRE: SoberReport = {
  intro: "On a lu votre conv. Avant tout, on a une chose à te dire.",
  title: "Ce qui se passe n’est pas de ta faute.",
  facts: "Plusieurs messages parlent de toi d’une façon qui fait mal. Personne ne devrait te parler comme ça.",
  reassurance: "Tu as le droit de prendre de la distance, et d’en parler à quelqu’un.",
  steps: ["Garde ces messages, au cas où.", "Parles-en à une personne de confiance.", "Tu n’as pas à répondre tout de suite."],
  draftLabel: "Si tu veux lui écrire",
  draft: "J’ai besoin de faire une pause. Je reviendrai vers toi quand je serai prêt.",
  helpLabel: "Besoin d’en parler à quelqu’un\u00a0?",
};

/** Ce que la lecture rend en mode sobre (une alerte) : le rapport doux seul, offert, sans chapitre. */
export const rapportSobre = (): ReportPayload => ({ ...rapportComplet(), report: { ...rapportComplet().report, chapters: [] }, sober: SOBRE, alerte: true });
