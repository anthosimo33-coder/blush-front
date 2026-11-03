import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HubArticles } from "@/components/article/HubArticles";
import { articlesDu, RUBRIQUES } from "@/contenu/articles";
import { DonneesStructurees, donneesDuHub } from "@/lib/donnees-structurees";
import { pagePublique } from "@/lib/referencement";
import { URL_SITE } from "@/server/env";

/*
 * Le hub du lexique, statique : une page publique (src/lib/referencement.ts) dès la première entrée du registre
 * (src/contenu/articles). Sans entrée, la page introuvable (404), hors des moteurs et du plan du site.
 */
export function generateMetadata(): Metadata {
  if (!articlesDu("lexique").length) return {};
  return pagePublique(RUBRIQUES.lexique.chemin, { title: RUBRIQUES.lexique.nom, description: RUBRIQUES.lexique.sous });
}

export default function Page() {
  const entrees = articlesDu("lexique");
  if (!entrees.length) notFound();
  return (
    <>
      <DonneesStructurees donnees={donneesDuHub("lexique", URL_SITE)} />
      <HubArticles genre="lexique" articles={entrees} voisine={articlesDu("guide").length ? "guide" : null} />
    </>
  );
}
