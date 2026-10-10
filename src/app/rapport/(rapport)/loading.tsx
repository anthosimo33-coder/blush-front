import { Squelette } from "@/components/shell/Squelette";

/*
 * Dès le toucher : la barre du rapport, le temps que le serveur rende la page. Le groupe (rapport) ne contient que
 * /rapport : un écran de chargement au-dessus envelopperait aussi le verdict, dont la scène sombre se charge en entier
 * exprès (Safari teinte ses barres) et ne doit pas passer d’abord par un squelette clair.
 */
export default function Loading() {
  return <Squelette titre="Ton rapport" />;
}
