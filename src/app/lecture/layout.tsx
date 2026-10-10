import { redirect } from "next/navigation";
import { getStory, quiAttendu, sansHistoire } from "@/services/serveur";

/*
 * Les gardes de la page, rendues avant elle : une vraie 307 (voir src/app/compte/layout.tsx). Pas d’écran de chargement
 * (loading.tsx) ici : on arrive sur la lecture juste après son lancement (le code, « Qui es-tu ? »), qui seul rend ces
 * gardes vraies, si bien qu’un préchargement fait avant garderait une redirection périmée ; et au chargement complet, le
 * squelette passait devant la page déjà rendue, le temps que React la révèle, avec un double caché de l’écran.
 */
export default async function Layout({ children }: LayoutProps<"/lecture">) {
  const [story, qui] = await Promise.all([getStory(), quiAttendu()]);
  if (!story) redirect(await sansHistoire("/lecture"));
  /* Une conv ouverte avant « Qui es-tu ? » (importée, puis une connexion) : pas de lecture sans, on y retourne */
  if (qui) redirect("/qui");
  return children;
}
