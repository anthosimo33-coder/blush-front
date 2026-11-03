import type { Article, Genre } from "./types";

/*
 * Le registre des articles : la seule liste des guides et des entrées du lexique publiés. Les pages (/guides, /lexique
 * et leurs articles), le plan du site, /llms.txt et l’envoi à IndexNow après une mise en ligne la lisent toutes ; les
 * garde-fous de tests/unit/articles.test.ts la vérifient à chaque `npm run check` (la marque, les sujets sensibles, la
 * signature, les sources, les doublons, la cadence).
 * Vide tant qu’aucun article n’est signé : les deux rubriques répondent alors 404 et n’entrent pas dans le plan du site.
 * Ajouter un article : son fichier ici (`<slug>.ts`, qui exporte un `Article`, ./types.ts), ajouté à ARTICLES, signé par
 * son relecteur ; puis l’aperçu local (npm run dev, /guides/<slug>) et `npm run check`. Rien n’est poussé avant la
 * signature : le dépôt est public.
 */

/** Les articles publiés. */
export const ARTICLES: readonly Article[] = [];

/** Les deux rubriques : leur adresse, leur nom (le fil d’Ariane, le titre du hub) et la phrase de leur hub. */
export const RUBRIQUES = {
  guide: {
    chemin: "/guides",
    nom: "Guides",
    sous: "Ce qui se passe dans une conv, expliqué simplement\u00a0: ce que ça peut vouloir dire, des exemples inventés, et ce que BLUSH regarde.",
  },
  lexique: {
    chemin: "/lexique",
    nom: "Lexique",
    sous: "Les mots des convs et des crushs, définis en une phrase, avec un exemple inventé.",
  },
} as const satisfies Record<Genre, { chemin: `/${string}`; nom: string; sous: string }>;

/** L’adresse d’un article : /guides/<slug> ou /lexique/<slug>. */
export const cheminDe = ({ genre, slug }: Pick<Article, "genre" | "slug">) => `${RUBRIQUES[genre].chemin}/${slug}` as const;

/** Les articles d’une rubrique, du plus récent au plus ancien : son hub les liste tous. */
export const articlesDu = (genre: Genre, articles: readonly Article[] = ARTICLES) =>
  articles.filter((a) => a.genre === genre).sort((a, b) => b.publieLe.localeCompare(a.publieLe) || a.titre.localeCompare(b.titre, "fr"));

/** L’article d’une rubrique à ce slug, s’il existe. */
export const articleDe = (genre: Genre, slug: string, articles: readonly Article[] = ARTICLES) => articles.find((a) => a.genre === genre && a.slug === slug);

/** Les articles liés à un article, dans l’ordre de ses `lies` (un slug inconnu est sauté : les garde-fous le refusent). */
export const liesDe = (article: Article, articles: readonly Article[] = ARTICLES) => article.lies.flatMap((slug) => articles.find((a) => a.slug === slug) ?? []);
