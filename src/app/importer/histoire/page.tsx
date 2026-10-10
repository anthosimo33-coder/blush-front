import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStory } from "@/services/serveur";
import { HistoireScreen } from "./HistoireScreen";

export const metadata: Metadata = { title: "Votre histoire réunie" };

export default async function Page() {
  const story = await getStory({ parcours: true });
  /* Déjà gardé par layout.tsx (une vraie 307, avant le squelette) : reste pour le type, et une navigation qui ne rejoue pas le layout */
  if (!story) redirect("/commencer");
  return <HistoireScreen story={story} />;
}
