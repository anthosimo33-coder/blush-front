import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { heureDuRendu } from "@/lib/rendu";
import { getReport, getStory, sansHistoire } from "@/services/serveur";
import { VerdictReveal } from "./VerdictReveal";
import { PageDeConv } from "@/components/shell/PageDeConv";

export const metadata: Metadata = { title: "Ton verdict" };

/* La scène est sombre : la barre du navigateur aussi */
export const viewport: Viewport = { themeColor: "#121214" };

/* La révélation du verdict, juste après l’analyse ; elle mène au rapport (/rapport), qui ne change pas. */
export default async function Page() {
  /* Le rapport rendu ici n’est pas relu au montage de la scène (VerdictReveal, `rendu`) */
  const rendu = heureDuRendu();
  const [initial, story] = await Promise.all([getReport(), getStory()]);
  if (!story) redirect(await sansHistoire("/rapport"));
  if (!initial) redirect("/lecture");
  /* Mode sobre (une alerte de danger) : pas de scène, le rapport tout de suite (l’effet de VerdictReveal reste en secours) */
  if (initial.sober) redirect("/rapport");
  return (
    <PageDeConv rendu={rendu}>
      <VerdictReveal initial={initial} story={story} rendu={rendu} />
    </PageDeConv>
  );
}
