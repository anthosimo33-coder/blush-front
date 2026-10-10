import { redirect } from "next/navigation";
import { getStory } from "@/services/serveur";

/* La garde de la page, au-dessus de son squelette : une vraie 307 (voir src/app/compte/layout.tsx) */
export default async function Layout({ children }: LayoutProps<"/qui">) {
  if (!(await getStory(undefined, { parcours: true }))) redirect("/commencer");
  return children;
}
