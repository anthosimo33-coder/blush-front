import type { Metadata } from "next";
import { getQuestionIdeas, getStory } from "@/services/api";
import { currentStoryId } from "@/services/session.server";
import { QuestionChat } from "./QuestionChat";
import { QuestionScreen } from "./QuestionScreen";

export const metadata: Metadata = { title: "Ta question" };

/* Proposition : la question en conversation avec BLUSH. L’écran actuel reste visible avec ?version=actuelle, pour comparer. */
export default async function Page({ searchParams }: PageProps<"/rapport/question">) {
  const { version } = await searchParams;
  if (version === "actuelle") return <QuestionScreen />;
  const storyId = await currentStoryId();
  const [ideas, story] = await Promise.all([getQuestionIdeas(storyId), getStory(storyId)]);
  return <QuestionChat ideas={ideas} story={story} />;
}
