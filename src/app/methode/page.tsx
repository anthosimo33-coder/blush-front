import type { Metadata } from "next";
import { METHODE } from "@/contenu/pages-de-confiance";
import { DonneesStructurees, donneesDUnePage } from "@/lib/donnees-structurees";
import { pagePublique } from "@/lib/referencement";
import { URL_SITE } from "@/server/env";
import { MethodeScreen } from "./MethodeScreen";

/* Une page publique : indexée par les moteurs (src/lib/referencement.ts), et citée par l’éditeur (publishingPrinciples) */
export const metadata: Metadata = pagePublique("/methode", { title: METHODE.court, description: METHODE.description });

/** Statique : ses textes vivent dans src/contenu/pages-de-confiance.ts. */
export default function Page() {
  return (
    <>
      <DonneesStructurees donnees={donneesDUnePage({ genre: "WebPage", chemin: "/methode", nom: METHODE.titre, court: METHODE.court }, URL_SITE)} />
      <MethodeScreen />
    </>
  );
}
