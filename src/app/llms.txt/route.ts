import { articlesDu, cheminDe, RUBRIQUES } from "@/contenu/articles";
import type { Genre } from "@/contenu/articles/types";
import { PHRASE_D_IDENTITE } from "@/contenu/identite";
import { PAGES_PUBLIQUES } from "@/lib/referencement";
import { URL_SITE } from "@/server/env";

/*
 * /llms.txt : BLUSH présenté aux assistants, en Markdown (le format proposé sur llmstxt.org) : sa phrase, puis ses pages
 * publiques et ses articles, tirés des mêmes listes que le plan du site (src/lib/referencement.ts, src/contenu/articles).
 * Statique, refait à chaque build. Aucun effet attendu sur Google, qui ne lit pas ce fichier (son journal, 15 juin
 * 2026) : il sert aux assistants qui le lisent. Pas de nom d’IA ici non plus.
 */
export const dynamic = "force-static";

/** L’adresse complète d’un chemin du site. */
const adresse = (chemin: string) => `${URL_SITE}${chemin === "/" ? "" : chemin}`;

/** La partie d’une rubrique : son hub, puis ses articles et leur description ; rien tant qu’elle est vide. */
function rubrique(genre: Genre): string[] {
  const articles = articlesDu(genre);
  if (!articles.length) return [];
  const { chemin, nom } = RUBRIQUES[genre];
  return ["", `## ${nom}`, "", `- [${nom}](${adresse(chemin)})`, ...articles.map((a) => `- [${a.titre}](${adresse(cheminDe(a))}): ${a.description}`)];
}

/** Le texte du fichier. */
function texteLlms(): string {
  return [
    "# BLUSH",
    "",
    `> ${PHRASE_D_IDENTITE}`,
    "",
    `BLUSH (askblush.com) est une appli web en français. Le site\u00a0: ${URL_SITE}`,
    "",
    "## Pages",
    "",
    ...PAGES_PUBLIQUES.map(({ chemin, nom }) => `- [${nom}](${adresse(chemin)})`),
    ...rubrique("guide"),
    ...rubrique("lexique"),
    "",
  ].join("\n");
}

export function GET() {
  return new Response(texteLlms(), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
