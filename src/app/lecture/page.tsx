import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStory, quiAttendu } from "@/services/serveur";
import { LectureScreen } from "./LectureScreen";

export const metadata: Metadata = { title: "BLUSH analyse votre histoire" };

export default async function Page({ searchParams }: PageProps<"/lecture">) {
  const { relance } = await searchParams;
  const [story, qui] = await Promise.all([getStory(), quiAttendu()]);
  if (!story) redirect("/commencer");
  /* Une conv ouverte avant « Qui es-tu ? » (importée, puis une connexion) : pas de lecture sans, on y retourne */
  if (qui) redirect("/qui");
  return <LectureScreen total={story.totalMessages} restart={relance === "1"} />;
}
