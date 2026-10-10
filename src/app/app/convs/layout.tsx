import { redirect } from "next/navigation";
import { nombreDeConvs } from "@/services/serveur";

/*
 * La garde de la page, au-dessus de son squelette : une vraie 307 (voir src/app/compte/layout.tsx). Une seule conv :
 * pas de liste, droit à l’accueil.
 */
export default async function Layout({ children }: LayoutProps<"/app/convs">) {
  if ((await nombreDeConvs()) < 2) redirect("/app");
  return children;
}
