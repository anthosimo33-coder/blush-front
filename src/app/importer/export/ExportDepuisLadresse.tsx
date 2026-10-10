"use client";

import { useSearchParams } from "next/navigation";
import { ExportScreen } from "./ExportScreen";

/* /importer/export statique : l’appli (?app=) se lit dans le navigateur. iMessage est redirigé avant (next.config.ts) */
export function ExportDepuisLadresse() {
  return <ExportScreen initialApp={useSearchParams().get("app") === "instagram" ? "instagram" : "whatsapp"} />;
}
