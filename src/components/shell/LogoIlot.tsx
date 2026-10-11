"use client";

import type { ComponentProps } from "react";
import { Logo } from "@/components/brand/Logo";

/*
 * Le logo en îlot client, pour les composants serveur (Screen, la landing). Rendu sur le serveur, il partait en entier
 * dans la charge de chaque page (ses dégradés, ses filtres, ses perles : quelque 7 Ko, et l’écran introuvable de Screen
 * l’ajoute à toutes les pages) ; son code est déjà dans le navigateur partout, la page n’en envoie plus que les props.
 */
export function LogoIlot(props: ComponentProps<typeof Logo>) {
  return <Logo {...props} />;
}
