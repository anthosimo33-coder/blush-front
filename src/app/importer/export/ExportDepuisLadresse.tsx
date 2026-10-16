"use client";

import { useSearchParams } from "next/navigation";
import { ExportScreen } from "./ExportScreen";

/*
 * /importer/export statique : l’appli (?app=) se lit dans le navigateur. iMessage est redirigé avant (next.config.ts).
 * `tournage` : la variante du mode tournage (./tournage/page.tsx), où le bouton prend la conv du lien.
 */
export function ExportDepuisLadresse({ tournage = false }: { tournage?: boolean }) {
  return <ExportScreen initialApp={useSearchParams().get("app") === "instagram" ? "instagram" : "whatsapp"} tournage={tournage} />;
}
