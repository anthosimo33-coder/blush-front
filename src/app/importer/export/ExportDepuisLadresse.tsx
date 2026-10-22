"use client";

import { useSearchParams } from "next/navigation";
import { ExportScreen } from "./ExportScreen";

/*
 * /importer/export statique : l’appli (?app=) se lit dans le navigateur. iMessage est redirigé avant (next.config.ts).
 * `tournage` : la variante du mode tournage (./tournage/page.tsx), où le bouton prend la conv du lien. ?mode=ajout : un
 * autre export, ajouté à la conv qu’on importe (pas en mode tournage).
 */
export function ExportDepuisLadresse({ tournage = false }: { tournage?: boolean }) {
  const params = useSearchParams();
  return <ExportScreen initialApp={params.get("app") === "instagram" ? "instagram" : "whatsapp"} tournage={tournage} ajout={!tournage && params.get("mode") === "ajout"} />;
}
