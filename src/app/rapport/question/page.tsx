import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getQuestion, getQuestionIdeas, getStory, sansHistoire } from "@/services/serveur";
import { currentStoryId } from "@/services/session.server";
import { QuestionChat } from "./QuestionChat";
import { QuestionScreen } from "./QuestionScreen";
import { ConvDeLaPage } from "@/components/shell/ConvDeLaPage";

export const metadata: Metadata = { title: "Ta question" };

/* Proposition : la question en conversation avec BLUSH. L’écran actuel reste visible avec ?version=actuelle, pour comparer. */
export default async function Page({ searchParams }: PageProps<"/rapport/question">) {
  const { version } = await searchParams;
  if (version === "actuelle")
    return (
      <>
        <ConvDeLaPage />
        <QuestionScreen />
      </>
    );
  const storyId = await currentStoryId();
  const [ideas, story, posee] = await Promise.all([getQuestionIdeas(storyId), getStory(storyId), getQuestion(storyId)]);
  /* Déjà gardé par layout.tsx (une vraie 307, avant le squelette) : reste pour le type, et une navigation qui ne rejoue pas le layout */
  if (!story) redirect(await sansHistoire("/rapport/question"));
  return (
    <>
      <ConvDeLaPage />
      <QuestionChat ideas={ideas} story={story} posee={posee} />
    </>
  );
}
