import { ViewTransition } from "react";
import { Squelette } from "@/components/shell/Squelette";

/*
 * Dès le toucher : la liste s’annonce, le temps que le serveur la rende. Elle arrive de la gauche comme la liste elle-même
 * (page.tsx) : le glissé depuis l’accueil part tout de suite, la liste remplace ensuite ses trois points sans bouger.
 * Seulement ici, jamais dans src/app/app/ : il envelopperait la fiche et casserait le glissé de l’avatar.
 */
export default function Loading() {
  return (
    <ViewTransition enter={{ "nav-back": "pop-in", default: "none" }} exit={{ "nav-forward": "push-out", default: "none" }} default="none">
      <div className="[background:var(--paper-light)]">
        <Squelette />
      </div>
    </ViewTransition>
  );
}
