import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStory } from "@/services/serveur";
import { HistoireScreen } from "./HistoireScreen";

export const metadata: Metadata = { title: "Votre histoire réunie" };

export default async function Page() {
  const story = await getStory(undefined, { parcours: true });
  if (!story) redirect("/commencer");
  return <HistoireScreen story={story} />;
}
