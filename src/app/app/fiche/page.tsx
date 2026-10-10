import type { Metadata } from "next";
import { ViewTransition } from "react";
import { redirect } from "next/navigation";
import { heureDuRendu } from "@/lib/rendu";
import { getFiche, sansHistoire } from "@/services/serveur";
import { currentStoryId } from "@/services/session.server";
import { FicheScreen } from "./FicheScreen";
import { ConvDeLaPage } from "@/components/shell/ConvDeLaPage";

export const metadata: Metadata = { title: "Sa fiche" };

/* Depuis l’accueil, sa fiche arrive par la droite ; « Retour » la renvoie à droite (globals.css, « Sophie, en glissé ») */
export default async function Page() {
  const rendu = heureDuRendu();
  const storyId = await currentStoryId();
  const fiche = await getFiche(storyId);
  if (!fiche) redirect(await sansHistoire("/app/fiche"));
  return (
    <>
      <ConvDeLaPage />
      <ViewTransition enter={{ "nav-forward": "push-in", default: "none" }} exit={{ "nav-back": "pop-out", default: "none" }} default="none">
        <div className="[background:var(--paper-light)]">
          {/* L’heure du rendu : préchargée, la page peut dater de plusieurs minutes (voir FicheScreen) */}
          <FicheScreen initial={fiche} storyId={storyId} rendu={rendu} />
        </div>
      </ViewTransition>
    </>
  );
}
