import type { Metadata } from "next";
import { ViewTransition } from "react";
import { redirect } from "next/navigation";
import { getConvs } from "@/services/serveur";
import { ConvsScreen } from "./ConvsScreen";

export const metadata: Metadata = { title: "Tes convs" };

/*
 * Les convs du compte. Une seule conv : pas de liste, on va droit à l’accueil.
 * La liste est au-dessus de l’accueil : il arrive par la droite quand on choisit une conv, et y repart au retour.
 */
export default async function Page() {
  const convs = await getConvs();
  /* Déjà gardé par layout.tsx (une vraie 307, avant le squelette) : reste pour le type, et une navigation qui ne rejoue pas le layout */
  if (convs.length < 2) redirect("/app");
  return (
    <ViewTransition enter={{ "nav-back": "pop-in", default: "none" }} exit={{ "nav-forward": "push-out", default: "none" }} default="none">
      <div className="[background:var(--paper-light)]">
        <ConvsScreen convs={convs} />
      </div>
    </ViewTransition>
  );
}
