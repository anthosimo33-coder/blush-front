import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { estConnecte, getStory } from "@/services/serveur";
import { QuiScreen } from "./QuiScreen";

export const metadata: Metadata = { title: "Qui est qui" };

export default async function Page() {
  const [story, connecte] = await Promise.all([getStory(undefined, { parcours: true }), estConnecte()]);
  if (!story) redirect("/commencer");
  return <QuiScreen people={story.participants} captures={story.sources[0]?.mode === "captures"} connecte={connecte} />;
}
