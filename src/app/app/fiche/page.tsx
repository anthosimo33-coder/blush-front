import type { Metadata } from "next";
import { ViewTransition } from "react";
import { redirect } from "next/navigation";
import { getFiche, sansHistoire } from "@/services/serveur";
import { currentStoryId } from "@/services/session.server";
import { FicheScreen } from "./FicheScreen";
import { ConvDeLaPage } from "@/components/shell/ConvDeLaPage";

export const metadata: Metadata = { title: "Sa fiche" };

/* Depuis l’accueil, sa fiche arrive par la droite ; « Retour » la renvoie à droite (globals.css, « Sophie, en glissé ») */
export default async function Page() {
  const fiche = await getFiche(await currentStoryId());
  if (!fiche) redirect(await sansHistoire("/app/fiche"));
  return (
    <>
      <ConvDeLaPage />
      <ViewTransition enter={{ "nav-forward": "push-in", default: "none" }} exit={{ "nav-back": "pop-out", default: "none" }} default="none">
        <div className="[background:var(--paper-light)]">
          <FicheScreen initial={fiche} />
        </div>
      </ViewTransition>
    </>
  );
}
