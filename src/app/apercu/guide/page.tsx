import type { Metadata } from "next";
import { PageArticle } from "@/components/article/PageArticle";
import { liesDe } from "@/contenu/articles";
import type { Article } from "@/contenu/articles/types";
import { EXEMPLES, GUIDE_D_EXEMPLE, GUIDE_ORANGE_D_EXEMPLE, GUIDE_ROUGE_D_EXEMPLE } from "./exemples";

export const metadata: Metadata = { title: "Aperçu d’un guide" };

/** Le guide d’exemple de chaque zone : vert par défaut, `?zone=orange` (son bloc d’aide), `?zone=rouge` (l’aide en tête, un simple lien). */
const PAR_ZONE: Record<Article["zone"], Article> = { verte: GUIDE_D_EXEMPLE, orange: GUIDE_ORANGE_D_EXEMPLE, rouge: GUIDE_ROUGE_D_EXEMPLE };

/**
 * Hors de Vercel seulement (src/proxy.ts) : le vrai gabarit d’un guide (src/components/article), sur un guide d’exemple
 * inventé (./exemples.ts), jamais publié, dans la zone demandée. Pour relire le gabarit et ses captures, zone par zone.
 */
export default async function Page({ searchParams }: PageProps<"/apercu/guide">) {
  const { zone } = await searchParams;
  const article = zone === "orange" || zone === "rouge" ? PAR_ZONE[zone] : PAR_ZONE.verte;
  return <PageArticle article={article} lies={liesDe(article, EXEMPLES)} />;
}
