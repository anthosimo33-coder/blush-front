"use client";

import { useSearchParams } from "next/navigation";
import { adresseDesCaptures } from "./adresse";
import { CapturesScreen } from "./CapturesScreen";

/* /importer/captures statique : l’appli et le mode (?app=, ?mode=) se lisent dans le navigateur */
export function CapturesDepuisLadresse() {
  const params = useSearchParams();
  const { appli, ajout } = adresseDesCaptures(params.get("app"), params.get("mode"));
  return <CapturesScreen app={appli} addMode={ajout} />;
}
