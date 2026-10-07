import type { BlushAnswer, Fiche, Guess, QuestionAnswer, Reply, Report, SoberReport, Story } from "@/types";
import {
  COUPLE_FICHE,
  COUPLE_QUESTION_ANSWER,
  COUPLE_QUESTION_IDEAS,
  COUPLE_QUICK_QUESTIONS,
  COUPLE_READING_DISCOVERIES,
  COUPLE_REPLY,
  COUPLE_REPORT,
  COUPLE_SOBER_REPORT,
  COUPLE_STORY_ID,
  COUPLE_VOICE_ANSWER,
} from "./couple";
import { FICHE, QUICK_QUESTIONS, REPLY, VOICE_ANSWER } from "./daily";
import { QUESTION_ANSWER, QUESTION_IDEAS, REPORT, SOBER_REPORT } from "./report";
import { READING_DISCOVERIES, STORY } from "./story";

/** Une histoire de démo : tout ce que le back-end renverrait pour elle. */
export type DemoStory = {
  story: Story;
  report: Report;
  sober: SoberReport;
  questionAnswer: QuestionAnswer;
  questionIdeas: QuestionAnswer[];
  reply: Reply;
  voiceAnswer: QuestionAnswer;
  quickQuestions: { question: string; answer: BlushAnswer }[];
  discoveries: string[];
  fiche: Pick<Fiche, "portrait" | "summary" | "summaryShort">;
};

/** Hugo et Sophie, avant d’être ensemble (les maquettes). */
const RENCONTRE: DemoStory = {
  story: STORY,
  report: REPORT,
  sober: SOBER_REPORT,
  questionAnswer: QUESTION_ANSWER,
  questionIdeas: QUESTION_IDEAS,
  reply: REPLY,
  voiceAnswer: VOICE_ANSWER,
  quickQuestions: QUICK_QUESTIONS,
  discoveries: READING_DISCOVERIES,
  fiche: { portrait: FICHE.portrait, summary: FICHE.summary, summaryShort: FICHE.summaryShort },
};

/** La même conv, lue comme un couple (voir couple.ts). */
const COUPLE: DemoStory = {
  story: { ...STORY, id: COUPLE_STORY_ID },
  report: COUPLE_REPORT,
  sober: COUPLE_SOBER_REPORT,
  questionAnswer: COUPLE_QUESTION_ANSWER,
  questionIdeas: COUPLE_QUESTION_IDEAS,
  reply: COUPLE_REPLY,
  voiceAnswer: COUPLE_VOICE_ANSWER,
  quickQuestions: COUPLE_QUICK_QUESTIONS,
  discoveries: COUPLE_READING_DISCOVERIES,
  fiche: COUPLE_FICHE,
};

/** Les histoires de démo par leur nom d’URL (?histoire=rencontre|couple). */
export const DEMO_STORY_IDS = { rencontre: RENCONTRE.story.id, couple: COUPLE.story.id } as const;

/** L’histoire de démo ouverte ; par défaut, celle des maquettes. */
export function demoStory(storyId: string | undefined): DemoStory {
  return [RENCONTRE, COUPLE].find((s) => s.story.id === storyId) ?? RENCONTRE;
}

/** Simulation de l’analyse : « On est ensemble » ouvre l’histoire en couple. */
export function storyIdFor(guess: Guess): string {
  return guess === "ensemble" ? COUPLE.story.id : RENCONTRE.story.id;
}
