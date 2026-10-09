import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { getReport, getStory, sansHistoire } from "@/services/serveur";
import { currentStoryId } from "@/services/session.server";
import { VerdictReveal } from "./VerdictReveal";
import { ConvDeLaPage } from "@/components/shell/ConvDeLaPage";

export const metadata: Metadata = { title: "Ton verdict" };

/* La scène est sombre : la barre du navigateur aussi */
export const viewport: Viewport = { themeColor: "#121214" };

/* La révélation du verdict, juste après l’analyse ; elle mène au rapport (/rapport), qui ne change pas. */
export default async function Page() {
  const storyId = await currentStoryId();
  const [initial, story] = await Promise.all([getReport(storyId), getStory(storyId)]);
  if (!story) redirect(await sansHistoire("/rapport"));
  if (!initial) redirect("/lecture");
  return (
    <>
      <ConvDeLaPage />
      <VerdictReveal initial={initial} story={story} />
    </>
  );
}
