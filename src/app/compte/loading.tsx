import { Squelette } from "@/components/shell/Squelette";

/* Dès le toucher : la barre de « Mon compte », le temps que le serveur rende la page */
export default function Loading() {
  return <Squelette titre="Mon compte" />;
}
