import { redirect } from "next/navigation";
import { BACKEND } from "@/services/mode";
import { nombreDeConvs } from "@/services/serveur";

/*
 * La garde de la page, au-dessus de son squelette : une vraie 307 (voir src/app/compte/layout.tsx). Une seule conv :
 * pas de liste, droit à l’accueil. Démo : la page garde elle-même, ?convs=plusieurs n’arrive pas jusqu’à un layout.
 */
export default async function Layout({ children }: LayoutProps<"/app/convs">) {
  if (BACKEND && (await nombreDeConvs()) < 2) redirect("/app");
  return children;
}
