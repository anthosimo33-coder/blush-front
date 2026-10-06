import type { Metadata } from "next";
import { getStory } from "@/services/api";
import { LectureScreen } from "./LectureScreen";

export const metadata: Metadata = { title: "BLUSH analyse votre histoire" };

export default async function Page({ searchParams }: PageProps<"/lecture">) {
  const { relance } = await searchParams;
  const story = await getStory();
  return <LectureScreen total={story.totalMessages} restart={relance === "1"} />;
}
