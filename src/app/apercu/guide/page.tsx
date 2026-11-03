import type { Metadata } from "next";
import { PageArticle } from "@/components/article/PageArticle";
import { liesDe } from "@/contenu/articles";
import { EXEMPLES, GUIDE_D_EXEMPLE } from "./exemples";

export const metadata: Metadata = { title: "Aperçu d’un guide" };

/**
 * Hors de Vercel seulement (src/proxy.ts) : le vrai gabarit d’un guide (src/components/article), sur un guide d’exemple
 * inventé (./exemples.ts), jamais publié. Pour relire le gabarit et ses captures avant le premier article signé.
 */
export default function Page() {
  return <PageArticle article={GUIDE_D_EXEMPLE} lies={liesDe(GUIDE_D_EXEMPLE, EXEMPLES)} />;
}
