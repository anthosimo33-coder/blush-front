import type { Metadata, Viewport } from "next";
import { getReport, getStory } from "@/services/api";
import { VerdictReveal } from "./VerdictReveal";

export const metadata: Metadata = { title: "Ton verdict" };

/* La scène est sombre : la barre du navigateur aussi */
export const viewport: Viewport = { themeColor: "#121214" };

/* La révélation du verdict, juste après l’analyse ; elle mène au rapport (/rapport), qui ne change pas. */
export default async function Page() {
  const [initial, story] = await Promise.all([getReport(), getStory()]);
  return <VerdictReveal initial={initial} story={story} />;
}
