import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStory } from "@/services/serveur";
import { LectureScreen } from "./LectureScreen";

export const metadata: Metadata = { title: "BLUSH analyse votre histoire" };

export default async function Page({ searchParams }: PageProps<"/lecture">) {
  const { relance } = await searchParams;
  const story = await getStory();
  if (!story) redirect("/commencer");
  return <LectureScreen total={story.totalMessages} restart={relance === "1"} />;
}
