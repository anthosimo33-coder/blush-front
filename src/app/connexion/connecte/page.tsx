import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { suiteSure } from "@/lib/suite";
import { compteRetireDeLaBeta } from "@/server/auth";
import { lireSession } from "@/server/cookies";
import { estConnecte } from "@/services/serveur";
import { ConnexionScreen } from "../ConnexionScreen";

export const metadata: Metadata = { title: "Se connecter" };

/**
 * /connexion avec un cookie de session (src/proxy.ts sert cette page à la même adresse) : déjà connecté, son accueil
 * (ou `?suite=`, la page où l’on allait). Sans cookie, personne n’est connecté : /connexion reste statique.
 */
export default async function Page({ searchParams }: PageProps<"/connexion/connecte">) {
  const suite = suiteSure((await searchParams).suite);
  /* Une session valide, pas seulement son cookie : un cookie périmé (compte supprimé ailleurs, bêta retirée) ferait boucler /app et /connexion */
  if (await estConnecte()) redirect(suite ?? "/app");
  /* Valide, mais la bêta ne le laisse plus entrer (un testeur retiré de la liste) : se connecter n’y changerait rien, il peut tout effacer */
  if (await compteRetireDeLaBeta(await lireSession())) redirect("/effacer");
  return <ConnexionScreen suite={suite} />;
}
