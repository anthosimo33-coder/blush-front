import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RepereTournage } from "@/components/shell/RepereTournage";
import { estConnecte, getStory } from "@/services/serveur";
import { QuiScreen } from "./QuiScreen";

export const metadata: Metadata = { title: "Qui est qui" };

export default async function Page() {
  const [story, connecte] = await Promise.all([getStory({ parcours: true }), estConnecte()]);
  /* Déjà gardé par layout.tsx (une vraie 307, avant le squelette) : reste pour le type, et une navigation qui ne rejoue pas le layout */
  if (!story) redirect("/commencer");
  return (
    <>
      <QuiScreen people={story.participants} captures={story.sources[0]?.mode === "captures"} connecte={connecte} />
      {/* Le mode tournage, pour l’équipe seulement (son layout est une garde, qui rend la page telle quelle) */}
      <RepereTournage />
    </>
  );
}
