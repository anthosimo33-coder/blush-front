import type { Route } from "next";
import { redirect } from "next/navigation";
import { getStory, sansHistoire } from "@/services/serveur";

/* La garde de la page, au-dessus de son squelette : une vraie 307 (voir src/app/compte/layout.tsx). Sans conv, pas de question */
export default async function Layout({ children }: LayoutProps<"/rapport/question">) {
  if (!(await getStory())) redirect((await sansHistoire("/rapport/question")) as Route);
  return children;
}
