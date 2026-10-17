import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnexionDepuisLadresse, ConnexionScreen } from "./ConnexionScreen";

export const metadata: Metadata = { title: "Se connecter" };

/**
 * Retrouver ses convs sur un autre appareil : l’email du compte, puis un code.
 * `?suite=` : la page où l’on allait (le lien du mail, une page de l’appli sans session), rouverte après le code. Lue dans
 * le navigateur : la page reste statique (servie et préchargée tout de suite). Avec un cookie de session, src/proxy.ts
 * sert à la place /connexion/connecte, qui envoie qui est vraiment connecté vers son accueil.
 */
export default function Page() {
  return (
    <Suspense fallback={<ConnexionScreen />}>
      <ConnexionDepuisLadresse />
    </Suspense>
  );
}
