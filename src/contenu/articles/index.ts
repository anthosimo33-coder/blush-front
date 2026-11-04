import { IL_MET_DU_TEMPS_A_REPONDRE } from "./il-met-du-temps-a-repondre";
import { IL_NE_REPOND_PLUS } from "./il-ne-repond-plus";
import type { Article, Genre } from "./types";

/*
 * Le registre des articles : la seule liste des guides et des entrées du lexique publiés. Les pages (/guides, /lexique
 * et leurs articles), le plan du site, /llms.txt et l’envoi à IndexNow après une mise en ligne la lisent toutes ; les
 * garde-fous de tests/unit/articles.test.ts la vérifient à chaque `npm run check` (la marque, les sujets sensibles, la
 * validation datée, les sources, les doublons, la cadence).
 * Vide tant qu’aucun article n’est signé : les deux rubriques répondent alors 404 et n’entrent pas dans le plan du site.
 * Ajouter un article : son fichier ici (`<slug>.ts`, qui exporte un `Article`, ./types.ts : son thème et les deux mots
 * surlignés de son titre compris, que le gabarit met en page), ajouté à ARTICLES, avec le
 * jour où le directeur de la publication a validé son texte final (`valideLe`, sa signature : aucun nom ne s’écrit dans
 * l’article) ; puis l’aperçu local (npm run dev, /guides/<slug>) et `npm run check`. Rien n’est poussé avant la
 * signature : le dépôt est public.
 */

/** Les articles publiés. */
export const ARTICLES: readonly Article[] = [IL_NE_REPOND_PLUS, IL_MET_DU_TEMPS_A_REPONDRE];

/** Combien de sources datées cite un article (charte, règle 15) : les garde-fous l’exigent (tests/aide/articles.ts), /methode le dit. */
export const SOURCES = { min: 2, max: 5 } as const;

/** La pastille de chaque mini-conv d’un article (src/components/article/blocs.tsx), que /methode cite. */
export const EXEMPLE_INVENTE = "exemple inventé";

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

/**
 * Les articles d’une rubrique, du plus récent au plus ancien, et à date égale dans l’ordre du registre (le premier
 * écrit, le principal, d’abord : le tri garde l’ordre des égaux) : son hub les liste tous, le premier à la une.
 */
export const articlesDu = (genre: Genre, articles: readonly Article[] = ARTICLES) => articles.filter((a) => a.genre === genre).sort((a, b) => b.publieLe.localeCompare(a.publieLe));

/** L’article d’une rubrique à ce slug, s’il existe. */
export const articleDe = (genre: Genre, slug: string, articles: readonly Article[] = ARTICLES) => articles.find((a) => a.genre === genre && a.slug === slug);

/** Les articles liés à un article, dans l’ordre de ses `lies` (un slug inconnu est sauté : les garde-fous le refusent). */
export const liesDe = (article: Article, articles: readonly Article[] = ARTICLES) => article.lies.flatMap((slug) => articles.find((a) => a.slug === slug) ?? []);
