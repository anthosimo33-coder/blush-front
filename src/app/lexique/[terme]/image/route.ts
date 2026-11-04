import { articleDe, articlesDu } from "@/contenu/articles";
import { carteDArticle } from "@/server/carte-verdict";

/* L’image d’aperçu d’une entrée du lexique (src/server/carte-verdict.tsx), dessinée au build pour chaque entrée du registre, et seulement elles. */
export const dynamicParams = false;

export function generateStaticParams() {
  return articlesDu("lexique").map(({ slug }) => ({ terme: slug }));
}

export async function GET(_req: Request, { params }: RouteContext<"/lexique/[terme]/image">) {
  const article = articleDe("lexique", (await params).terme);
  if (!article) return new Response(null, { status: 404 });
  return carteDArticle(article);
}
