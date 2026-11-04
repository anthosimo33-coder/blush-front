import type { Metadata } from "next";
import { HubArticles } from "@/components/article/HubArticles";
import { PageArticle } from "@/components/article/PageArticle";
import { liesDe } from "@/contenu/articles";
import { ENTREE_D_EXEMPLE, EXEMPLES } from "../guide/exemples";

export const metadata: Metadata = { title: "Aperçu d’une entrée du lexique" };

/**
 * Hors de Vercel seulement (src/proxy.ts) : le vrai gabarit d’une entrée du lexique (src/components/article), sur une
 * entrée d’exemple inventée (../guide/exemples.ts, en zone orange : son bloc d’aide), jamais publiée. `?vue=sommaire` :
 * le sommaire du lexique (/lexique), sur cette entrée, tant que le registre n’en a aucune.
 */
export default async function Page({ searchParams }: PageProps<"/apercu/lexique">) {
  const { vue } = await searchParams;
  if (vue === "sommaire") return <HubArticles genre="lexique" articles={[ENTREE_D_EXEMPLE]} voisine="guide" />;
  return <PageArticle article={ENTREE_D_EXEMPLE} lies={liesDe(ENTREE_D_EXEMPLE, EXEMPLES)} />;
}
