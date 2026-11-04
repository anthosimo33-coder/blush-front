import type { Metadata } from "next";
import { PAGE_AIDE } from "@/contenu/pages-de-confiance";
import { DonneesStructurees, donneesDUnePage } from "@/lib/donnees-structurees";
import { pagePublique } from "@/lib/referencement";
import { URL_SITE } from "@/server/env";
import { AideScreen } from "./AideScreen";

/* Une page publique : indexée par les moteurs (src/lib/referencement.ts) */
export const metadata: Metadata = pagePublique("/aide", { title: PAGE_AIDE.court, description: PAGE_AIDE.description });

/** Statique : les numéros vivent dans src/contenu/aide.ts, la page les reprend tous (GROUPES_D_AIDE). */
export default function Page() {
  return (
    <>
      <DonneesStructurees donnees={donneesDUnePage({ genre: "WebPage", chemin: "/aide", nom: PAGE_AIDE.court, court: PAGE_AIDE.court }, URL_SITE)} />
      <AideScreen />
    </>
  );
}
