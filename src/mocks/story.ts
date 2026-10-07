import type { Message, Source, Story } from "@/types";

/* Données factices reprises des maquettes. En production, elles viennent de l’analyse réelle. */

export const PEOPLE = {
  hugo: { id: "hugo", name: "Hugo", initial: "H" },
  sophie: { id: "sophie", name: "Sophie", initial: "S" },
} as const;

export const SOURCE_WHATSAPP: Source = {
  id: "src-whatsapp",
  app: "whatsapp",
  mode: "export",
  fileName: "Discussion avec Sophie.zip",
  label: "Depuis votre premier date",
  period: "14 déc. → 12 mars",
  messageCount: 1074,
  voiceCount: 11,
};

export const SOURCE_HINGE: Source = {
  id: "src-hinge",
  app: "hinge",
  mode: "captures",
  screenshotCount: 2,
  label: "Le match",
  period: "2 sept.",
  messageCount: 12,
};

export const SOURCE_INSTAGRAM: Source = {
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

/** Résultat de la lecture de captures (écran 03). */
export const SCREENSHOTS_RESULT = { count: 4, messagesRead: 96 };

/** La conv qui défile pendant la lecture (écran 08). */
export const READING_FEED: Message[] = [
  { from: "elle", text: "c’est toi qui grimpes sans corde là ?? 😳" },
  { from: "toi", text: "évidemment. je suis un peu fou" },
  { from: "elle", text: "bon on se le fait ce verre ou pas 😅" },
  { from: "toi", text: "samedi ?" },
  { from: "elle", text: "c’était trop bien hier" },
  { from: "toi", text: "grave. faut qu’on y retourne" },
  { from: "elle", text: "ma sœur veut te rencontrer mdr" },
  { from: "toi", text: "haha grave un jour" },
  { from: "elle", text: "au fait on est quoi toi et moi mdr" },
  { from: "toi", text: "mdr" },
  { from: "elle", text: "tu fais quoi samedi ?" },
  { from: "toi", text: "je suis libre 🙃" },
];

/** Ce que BLUSH remarque pendant la lecture (écran 08) : elle, un mot à vous, le moment. */
export const READING_DISCOVERIES = ["Elle relance après 22 h", "« le libanais » × 9", "2 mars, 23 h 41"];

export const READING_STEPS = [
  "Votre histoire, du premier au dernier message",
  "Qui relance, qui propose, qui s’ouvre",
  "Le moment où tout a basculé",
  "Ton verdict",
];

/** Étapes d’export par appli. La version iPhone/Android est choisie selon l’appareil. */
export const EXPORT_STEPS = {
  whatsapp: {
    menu: { contact: "Sophie", items: ["Ajouter aux favoris", "Exporter la discussion", "Effacer la discussion"], highlight: 1 },
    steps: {
      all: [
        "Ouvre votre conv",
        "Touche son nom en haut (iPhone) ou ⋮ puis Plus (Android)",
        "Exporter la discussion, sans médias",
        "Enregistre dans Fichiers (iPhone) ou Drive (Android)",
      ],
      ios: ["Ouvre votre conv", "Touche son nom en haut", "Exporter la discussion, sans médias", "Enregistre dans Fichiers"],
      android: ["Ouvre votre conv", "Touche ⋮ puis Plus", "Exporter la discussion, sans médias", "Enregistre dans Drive"],
    },
  },
  /* ⚠ Textes iMessage absents des maquettes : à valider. */
  imessage: {
    menu: { contact: "Sophie", items: ["Afficher le contact", "Exporter la conversation", "Supprimer la conversation"], highlight: 1 },
    steps: {
      all: ["Ouvre Messages sur ton Mac", "Ouvre votre conv", "Exporter la conversation", "Enregistre le fichier"],
      ios: ["Ouvre Messages sur ton Mac", "Ouvre votre conv", "Exporter la conversation", "Enregistre le fichier"],
      android: ["Ouvre Messages sur ton Mac", "Ouvre votre conv", "Exporter la conversation", "Enregistre le fichier"],
    },
  },
} as const;
