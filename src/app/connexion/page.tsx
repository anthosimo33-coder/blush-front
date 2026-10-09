import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { suiteSure } from "@/lib/suite";
import { estConnecte } from "@/services/serveur";
import { ConnexionScreen } from "./ConnexionScreen";

export const metadata: Metadata = { title: "Se connecter" };

/**
 * Retrouver ses convs sur un autre appareil : l’email du compte, puis un code. Déjà connecté : son accueil.
 * `?suite=` : la page où l’on allait (le lien du mail, une page de l’appli sans session), rouverte après le code.
 */
export default async function Page({ searchParams }: PageProps<"/connexion">) {
  const suite = suiteSure((await searchParams).suite);
  /* Une session valide, pas seulement son cookie : un cookie périmé (compte supprimé ailleurs, bêta retirée) ferait boucler /app et /connexion */
  if (await estConnecte()) redirect(suite ?? "/app");
  return <ConnexionScreen suite={suite} />;
}
