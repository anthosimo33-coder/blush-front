import type { Metadata } from "next";
import { ViewTransition } from "react";
import { getFiche } from "@/services/api";
import { currentStoryId } from "@/services/session.server";
import { FicheScreen } from "./FicheScreen";

export const metadata: Metadata = { title: "Sa fiche" };

/* Depuis l’accueil, sa fiche arrive par la droite ; « Retour » la renvoie à droite (globals.css, « Sophie, en glissé ») */
export default async function Page() {
  return (
    <ViewTransition enter={{ "nav-forward": "push-in", default: "none" }} exit={{ "nav-back": "pop-out", default: "none" }} default="none">
      <div className="[background:var(--paper-light)]">
        <FicheScreen initial={await getFiche(await currentStoryId())} />
      </div>
    </ViewTransition>
  );
}
