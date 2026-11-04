import type { Metadata } from "next";
import { A_PROPOS } from "@/contenu/pages-de-confiance";
import { DonneesStructurees, donneesDUnePage } from "@/lib/donnees-structurees";
import { pagePublique } from "@/lib/referencement";
import { URL_SITE } from "@/server/env";
import { AProposScreen } from "./AProposScreen";

/* Une page publique : indexée par les moteurs (src/lib/referencement.ts) */
export const metadata: Metadata = pagePublique("/a-propos", { title: A_PROPOS.court, description: A_PROPOS.description });

/** Statique : ses textes vivent dans src/contenu (pages-de-confiance.ts, et ce qu’elle reprend des autres pages). */
export default function Page() {
  return (
    <>
      <DonneesStructurees donnees={donneesDUnePage({ genre: "AboutPage", chemin: "/a-propos", nom: A_PROPOS.titre, court: A_PROPOS.court }, URL_SITE)} />
      <AProposScreen />
    </>
  );
}
