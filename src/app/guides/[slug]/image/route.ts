import { articleDe, articlesDu } from "@/contenu/articles";
import { carteDArticle } from "@/server/carte-verdict";

/* L’image d’aperçu d’un guide (src/server/carte-verdict.tsx), dessinée au build pour chaque guide du registre, et seulement eux. */
export const dynamicParams = false;

export function generateStaticParams() {
  return articlesDu("guide").map(({ slug }) => ({ slug }));
}

export async function GET(_req: Request, { params }: RouteContext<"/guides/[slug]/image">) {
  const article = articleDe("guide", (await params).slug);
  if (!article) return new Response(null, { status: 404 });
  return carteDArticle(article);
}
