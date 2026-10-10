import type { Message, Source, Story } from "@/types";

/* Données factices reprises des maquettes. En production, elles viennent de l’analyse réelle. */
import { PEOPLE } from "./people";
export { PEOPLE };

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

