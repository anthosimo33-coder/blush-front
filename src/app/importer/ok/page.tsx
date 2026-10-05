import type { Metadata } from "next";
import { getStory } from "@/services/api";
import { ConvOkScreen } from "./ConvOkScreen";

export const metadata: Metadata = { title: "Ta conv est ajoutée" };

export default async function Page() {
  const story = await getStory();
  const source = story.sources.find((s) => s.mode === "export") ?? story.sources[0];
  return <ConvOkScreen source={source} />;
}
