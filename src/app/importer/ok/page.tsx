import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStory } from "@/services/serveur";
import { ConvOkScreen } from "./ConvOkScreen";

export const metadata: Metadata = { title: "Ta conv est ajoutée" };

export default async function Page() {
  const story = await getStory();
  if (!story) redirect("/commencer");
  const source = story.sources.find((s) => s.mode === "export") ?? story.sources[0];
  return <ConvOkScreen source={source} />;
}
