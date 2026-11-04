import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageArticle } from "@/components/article/PageArticle";
import { articleDe, articlesDu, cheminDe, liesDe } from "@/contenu/articles";
import { DonneesStructurees, donneesDeLArticle } from "@/lib/donnees-structurees";
import { pagePublique } from "@/lib/referencement";
import { URL_SITE } from "@/server/env";

/*
 * Une entrée du lexique (src/contenu/articles), rendue au build : du HTML statique, servi depuis le cache et lisible
 * sans JavaScript. Seules les entrées du registre existent (dynamicParams) : toute autre adresse, la page introuvable.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return articlesDu("lexique").map(({ slug }) => ({ terme: slug }));
}

export async function generateMetadata({ params }: PageProps<"/lexique/[terme]">): Promise<Metadata> {
  const article = articleDe("lexique", (await params).terme);
  if (!article) notFound();
  return pagePublique(cheminDe(article), { title: article.titre, description: article.description, article });
}

export default async function Page({ params }: PageProps<"/lexique/[terme]">) {
  const article = articleDe("lexique", (await params).terme);
  if (!article) notFound();
  return (
    <>
      <DonneesStructurees donnees={donneesDeLArticle(article, URL_SITE)} />
      <PageArticle article={article} lies={liesDe(article)} />
    </>
  );
}
