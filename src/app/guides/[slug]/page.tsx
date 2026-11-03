import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageArticle } from "@/components/article/PageArticle";
import { articleDe, articlesDu, cheminDe, liesDe } from "@/contenu/articles";
import { DonneesStructurees, donneesDeLArticle } from "@/lib/donnees-structurees";
import { pagePublique } from "@/lib/referencement";
import { URL_SITE } from "@/server/env";

/*
 * Un guide du registre (src/contenu/articles), rendu au build : du HTML statique, servi depuis le cache et lisible sans
 * JavaScript. Seuls les guides du registre existent (dynamicParams) : toute autre adresse, la page introuvable.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return articlesDu("guide").map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const article = articleDe("guide", (await params).slug);
  if (!article) notFound();
  return pagePublique(cheminDe(article), { title: article.titre, description: article.description, article });
}

export default async function Page({ params }: PageProps<"/guides/[slug]">) {
  const article = articleDe("guide", (await params).slug);
  if (!article) notFound();
  return (
    <>
      <DonneesStructurees donnees={donneesDeLArticle(article, URL_SITE)} />
      <PageArticle article={article} lies={liesDe(article)} />
    </>
  );
}
