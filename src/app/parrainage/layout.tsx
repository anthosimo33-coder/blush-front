import { redirect } from "next/navigation";
import { connexionPuis } from "@/lib/suite";
import { compteRetireDeLaBeta } from "@/server/auth";
import { lireSession } from "@/server/cookies";
import { estConnecte } from "@/services/serveur";

/* La garde de la page, comme pour Mon compte (src/app/compte/layout.tsx) : sans compte connecté, la connexion, puis retour ici */
export default async function Layout({ children }: LayoutProps<"/parrainage">) {
  if (!(await estConnecte())) redirect((await compteRetireDeLaBeta(await lireSession())) ? "/effacer" : connexionPuis("/parrainage"));
  return children;
}
