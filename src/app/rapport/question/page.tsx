import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStory, questionsDeLaConv, sansHistoire } from "@/services/serveur";
import { QuestionChat } from "./QuestionChat";
import { PageDeConv } from "@/components/shell/PageDeConv";

export const metadata: Metadata = { title: "Ta question" };

/* Ta question, en conversation avec BLUSH */
export default async function Page() {
  const [ideas, story] = await Promise.all([questionsDeLaConv(), getStory()]);
  /* Déjà gardé par layout.tsx (une vraie 307, avant le squelette) : reste pour le type, et une navigation qui ne rejoue pas le layout */
  if (!story) redirect(await sansHistoire("/rapport/question"));
  return (
    <PageDeConv>
      <QuestionChat ideas={ideas} story={story} />
    </PageDeConv>
  );
}
