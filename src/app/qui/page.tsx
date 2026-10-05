import type { Metadata } from "next";
import { getStory } from "@/services/api";
import { QuiScreen } from "./QuiScreen";

export const metadata: Metadata = { title: "Qui est qui" };

export default async function Page() {
  const story = await getStory();
  return <QuiScreen people={story.participants} />;
}
