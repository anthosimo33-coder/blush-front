"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { ERREURS_PARCOURS } from "@/lib/messages-erreur";
import { ErrorScreen } from "./ErrorScreen";

/**
 * L’écran d’erreur du parcours d’import : les écrans de l’import posent `?erreur=<code>` dans l’adresse (ExportScreen,
 * CapturesScreen), et il s’affiche par-dessus la page, rendue inerte tant qu’il est là. Monté dans le layout racine.
 */
export function ErreurDeParcours() {
  const erreur = useSearchParams().get("erreur");
  const kind = ERREURS_PARCOURS.find((e) => e === erreur) ?? null;

  useEffect(() => {
    const root = document.getElementById("app-root");
    if (!root) return;
    root.inert = !!kind;
    return () => {
      root.inert = false;
    };
  }, [kind]);

  return kind ? <ErrorScreen kind={kind} /> : null;
}
