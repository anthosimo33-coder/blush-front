import type { Metadata } from "next";
import { heureDuRendu } from "@/lib/rendu";
import { redirect } from "next/navigation";
import { getStory, sansHistoire } from "@/services/serveur";
import { LectureScreen } from "./LectureScreen";
import { PageDeConv } from "@/components/shell/PageDeConv";

export const metadata: Metadata = { title: "BLUSH analyse votre histoire" };

export default async function Page() {
  /* L’heure du rendu, avant les lectures : le compte posé par PageDeConv en part */
  const rendu = heureDuRendu();
  const story = await getStory();
  /*
   * Les gardes sont dans layout.tsx (une vraie 307) : celle-ci ne sert qu’au type, et à une navigation qui ne rejoue pas
   * le layout (la même page, d’autres paramètres)
   */
  if (!story) redirect(await sansHistoire("/lecture"));
  return (
    <PageDeConv rendu={rendu}>
      <LectureScreen total={story.totalMessages} />
    </PageDeConv>
  );
}
