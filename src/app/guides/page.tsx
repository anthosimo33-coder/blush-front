import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HubArticles } from "@/components/article/HubArticles";
import { articlesDu, RUBRIQUES } from "@/contenu/articles";
import { DonneesStructurees, donneesDuHub } from "@/lib/donnees-structurees";
import { pagePublique } from "@/lib/referencement";
import { URL_SITE } from "@/server/env";

/*
 * Le hub des guides, statique : une page publique (src/lib/referencement.ts) dès le premier guide du registre
 * (src/contenu/articles). Sans guide, la page introuvable (404), hors des moteurs et du plan du site.
 */
export function generateMetadata(): Metadata {
  if (!articlesDu("guide").length) return {};
  return pagePublique(RUBRIQUES.guide.chemin, { title: RUBRIQUES.guide.nom, description: RUBRIQUES.guide.sous });
}

export default function Page() {
  const guides = articlesDu("guide");
  if (!guides.length) notFound();
  return (
    <>
      <DonneesStructurees donnees={donneesDuHub("guide", URL_SITE)} />
      <HubArticles genre="guide" articles={guides} voisine={articlesDu("lexique").length ? "lexique" : null} />
    </>
  );
}
