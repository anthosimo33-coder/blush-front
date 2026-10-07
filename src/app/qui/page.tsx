import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStory } from "@/services/serveur";
import { QuiScreen } from "./QuiScreen";

export const metadata: Metadata = { title: "Qui est qui" };

export default async function Page() {
  const story = await getStory();
  if (!story) redirect("/commencer");
  return <QuiScreen people={story.participants} />;
}
