import type { BlushAnswer, ConvSummary, Fiche, Guess, QuestionAnswer, Reply, Report, SoberReport, Story } from "@/types";
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
import { AUTRES_CONVS, type AutreConv } from "./convs";
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
  fiche: Pick<Fiche, "portrait" | "summary" | "summaryShort"> & Partial<Pick<Fiche, "person">>;
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

/** Une autre conv du compte (proposition « plusieurs convs », voir convs.ts) : celle de Sophie, avec une autre personne. */
function autre(c: AutreConv): DemoStory {
  return {
    ...RENCONTRE,
    story: { ...STORY, id: c.id, participants: [STORY.participants[0], c.person] },
    report: { ...REPORT, storyId: c.id, verdict: c.verdict, level: c.level, trend: c.trend, nextStep: c.nextStep },
    fiche: { ...RENCONTRE.fiche, person: c.person, summaryShort: c.summaryShort, summary: c.summaryShort },
  };
}

const AUTRES = AUTRES_CONVS.map(autre);

/** Les histoires de démo par leur nom d’URL (?histoire=rencontre|couple). */
export const DEMO_STORY_IDS = { rencontre: RENCONTRE.story.id, couple: COUPLE.story.id } as const;

/** L’histoire de démo ouverte ; par défaut, celle des maquettes. */
export function demoStory(storyId: string | undefined): DemoStory {
  return [RENCONTRE, COUPLE, ...AUTRES].find((s) => s.story.id === storyId) ?? RENCONTRE;
}

/** Les convs du compte de démo quand il en a plusieurs : Sophie (celle des maquettes, ou en couple), Inès, Camille. */
export function demoConvs(storyId: string | undefined): ConvSummary[] {
  const ouverte = demoStory(storyId);
  const sophie = ouverte === COUPLE ? COUPLE : RENCONTRE;
  const resume = (d: DemoStory, lastLabel: string): ConvSummary => ({
    storyId: d.story.id,
    person: d.story.participants[1],
    verdict: { emoji: d.report.verdict.emoji, title: d.report.verdict.title },
    level: d.report.level,
    trend: d.report.trend,
    lastLabel,
    current: d === ouverte,
  });
  return [resume(sophie, "aujourd’hui"), ...AUTRES.map((d, i) => resume(d, AUTRES_CONVS[i].lastLabel))];
}

/** Simulation de l’analyse : « On est ensemble » ouvre l’histoire en couple. */
export function storyIdFor(guess: Guess): string {
  return guess === "ensemble" ? COUPLE.story.id : RENCONTRE.story.id;
}
