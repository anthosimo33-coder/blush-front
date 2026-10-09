import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStory, quiAttendu, sansHistoire } from "@/services/serveur";
import { LectureScreen } from "./LectureScreen";
import { ConvDeLaPage } from "@/components/shell/ConvDeLaPage";

export const metadata: Metadata = { title: "BLUSH analyse votre histoire" };

export default async function Page({ searchParams }: PageProps<"/lecture">) {
  const { relance } = await searchParams;
  const [story, qui] = await Promise.all([getStory(), quiAttendu()]);
  if (!story) redirect(await sansHistoire("/lecture"));
  /* Une conv ouverte avant « Qui es-tu ? » (importée, puis une connexion) : pas de lecture sans, on y retourne */
  if (qui) redirect("/qui");
  return (
    <>
      <ConvDeLaPage />
      <LectureScreen total={story.totalMessages} restart={relance === "1"} />
    </>
  );
}
