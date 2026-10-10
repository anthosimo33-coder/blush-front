import { redirect } from "next/navigation";
import { connexionPuis } from "@/lib/suite";
import { BACKEND } from "@/services/mode";
import { estConnecte } from "@/services/serveur";

/*
 * La garde de la page, ici plutôt que dans page.tsx : sous un écran de chargement (loading.tsx), la page part en flux,
 * et sa redirection n’est plus une 307 mais une réponse 200 avec le squelette, puis un saut côté navigateur (un document
 * de plus à chaque chargement complet). Le layout se rend avant le squelette : une vraie 307. Il se rend aussi au
 * préchargement du lien, d’où des gardes légères ; les données de la page restent lues dans page.tsx, et ce qu’ils
 * lisent tous les deux n’est lu qu’une fois (contexteRequete est mémorisé le temps de la requête).
 */
export default async function Layout({ children }: LayoutProps<"/compte">) {
  /* Sans compte connecté (session expirée, autre appareil) : la connexion d’abord, puis retour ici */
  if (BACKEND && !(await estConnecte())) redirect(connexionPuis("/compte"));
  return children;
}
