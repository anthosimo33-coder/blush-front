import type { Metadata } from "next";
import { getStory } from "@/services/api";
import { HistoireScreen } from "./HistoireScreen";

export const metadata: Metadata = { title: "Votre histoire réunie" };

export default async function Page() {
  return <HistoireScreen story={await getStory()} />;
}
