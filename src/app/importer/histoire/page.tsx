import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ajoutDUnMorceau, getStory } from "@/services/serveur";
import { HistoireScreen } from "./HistoireScreen";

export const metadata: Metadata = { title: "Votre histoire réunie" };

export default async function Page() {
  const [story, ajout] = await Promise.all([getStory({ parcours: true }), ajoutDUnMorceau()]);
  /* Déjà gardé par layout.tsx (une vraie 307, avant le squelette) : reste pour le type, et une navigation qui ne rejoue pas le layout */
  if (!story) redirect("/commencer");
  /* Un seul morceau : l’écran de la conv reçue */
  if (story.sources.length < 2) redirect("/importer/ok");
  return <HistoireScreen story={story} ajout={ajout} />;
}
