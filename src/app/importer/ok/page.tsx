import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ajoutDUnMorceau, getStory } from "@/services/serveur";
import { ConvOkScreen } from "./ConvOkScreen";

export const metadata: Metadata = { title: "Ta conv est ajoutée" };

export default async function Page() {
  const [story, ajout] = await Promise.all([getStory({ parcours: true }), ajoutDUnMorceau()]);
  /* Déjà gardé par layout.tsx (une vraie 307, avant le squelette) : reste pour le type, et une navigation qui ne rejoue pas le layout */
  if (!story) redirect("/commencer");
  /* Plusieurs morceaux : l’histoire réunie les montre tous */
  if (story.sources.length > 1) redirect("/importer/histoire");
  const [source] = story.sources;
  if (!source) redirect("/commencer");
  return <ConvOkScreen story={story} source={source} ajout={ajout} />;
}
