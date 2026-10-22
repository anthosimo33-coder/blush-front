import { redirect } from "next/navigation";
import { tropCourte } from "@/lib/morceaux";
import { getStory } from "@/services/serveur";

/*
 * La garde de la page, au-dessus de son squelette : une vraie 307 (voir src/app/compte/layout.tsx). Une conv encore trop
 * courte (un premier morceau, qui attend son début) retourne à l’écran de la conv reçue : sa lecture ne partirait pas.
 */
export default async function Layout({ children }: LayoutProps<"/qui">) {
  const story = await getStory({ parcours: true });
  if (!story) redirect("/commencer");
  if (tropCourte(story)) redirect("/importer/ok");
  return children;
}
