import { redirect } from "next/navigation";
import { getStory, sansHistoire } from "@/services/serveur";

/*
 * La garde de la page, au-dessus de son squelette : une vraie 307 (voir src/app/compte/layout.tsx). Pour les deux
 * versions : un layout ne voit pas ?version=actuelle, et sans conv il n’y a de question dans aucune.
 */
export default async function Layout({ children }: LayoutProps<"/rapport/question">) {
  if (!(await getStory())) redirect(await sansHistoire("/rapport/question"));
  return children;
}
