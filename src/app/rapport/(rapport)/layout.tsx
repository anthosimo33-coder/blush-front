import type { Route } from "next";
import { redirect } from "next/navigation";
import { getStory, sansHistoire, verdictEcrit } from "@/services/serveur";

/*
 * Les gardes de /rapport, au-dessus de son squelette : une vraie 307 (voir src/app/compte/layout.tsx). Sans lire le
 * rapport (verdictEcrit) : ce layout se rend aussi à chaque préchargement du lien. Dans le groupe (rapport), comme le
 * squelette : le verdict, la question et le déblocage n’en dépendent pas.
 */
export default async function Layout({ children }: LayoutProps<"/rapport">) {
  const [story, ecrit] = await Promise.all([getStory(), verdictEcrit()]);
  if (!story) redirect((await sansHistoire("/rapport")) as Route);
  if (!ecrit) redirect("/lecture");
  return children;
}
