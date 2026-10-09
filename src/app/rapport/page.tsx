import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getReport, getStory, sansHistoire } from "@/services/serveur";
import { currentStoryId } from "@/services/session.server";
import { ReportScreen } from "./ReportScreen";
import { ConvDeLaPage } from "@/components/shell/ConvDeLaPage";

export const metadata: Metadata = { title: "Ton rapport" };

export default async function Page({ searchParams }: PageProps<"/rapport">) {
  const { paiement } = await searchParams;
  const storyId = await currentStoryId();
  const [initial, story] = await Promise.all([getReport(storyId), getStory(storyId)]);
  if (!story) redirect(await sansHistoire("/rapport"));
  if (!initial) redirect("/lecture");
  return (
    <>
      <ConvDeLaPage />
      <ReportScreen initial={initial} story={story} openPaywall={paiement === "1"} />
    </>
  );
}
