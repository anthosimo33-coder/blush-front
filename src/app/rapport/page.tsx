import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getReport, getStory } from "@/services/serveur";
import { currentStoryId } from "@/services/session.server";
import { ReportScreen } from "./ReportScreen";

export const metadata: Metadata = { title: "Ton rapport" };

export default async function Page({ searchParams }: PageProps<"/rapport">) {
  const { paiement } = await searchParams;
  const storyId = await currentStoryId();
  const [initial, story] = await Promise.all([getReport(storyId), getStory(storyId)]);
  if (!story) redirect("/commencer");
  if (!initial) redirect("/lecture");
  return <ReportScreen initial={initial} story={story} openPaywall={paiement === "1"} />;
}
