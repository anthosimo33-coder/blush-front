import { cheminDe, RUBRIQUES } from "@/contenu/articles";
import type { Article, Genre, Personne } from "@/contenu/articles/types";
import { PHRASE_D_IDENTITE } from "@/contenu/identite";

/*
 * Ce que les moteurs comprennent de BLUSH et de ses pages publiques : des données structurées schema.org, en JSON-LD,
 * rien d’affiché. Un graphe par page, dont les nœuds se citent par leur @id (l’éditeur, le site, la page). `site` :
 * l’adresse du site (URL_SITE, src/server/env.ts), que la page passe (ce module est aussi lu hors du serveur).
 * Ni FAQPage (Google ne montre plus ce résultat depuis le 7 mai 2026 : la FAQ des articles reste en texte), ni
 * aggregateRating (la note des avis, tant que la page ne dit pas comment ils ont été recueillis).
 */

/**
 * Les comptes officiels de BLUSH (`sameAs`) : seulement ceux qu’on sait être à nous.
 * TODO(produit): le compte TikTok officiel et les autres (YouTube, Snapchat…), quand leur adresse exacte est confirmée :
 * jamais une adresse devinée, elle relierait BLUSH au compte de quelqu’un d’autre.
 */
const COMPTES_OFFICIELS = ["https://www.instagram.com/askblush_/"];

/** L’@id de l’éditeur (l’Organization) et celui du site (le WebSite) : les mêmes sur toutes les pages. */
const idEditeur = (site: string) => `${site}/#editeur`;
const idSite = (site: string) => `${site}/#site`;

/** L’éditeur : BLUSH, son adresse, son logo et ses comptes officiels. */
const editeur = (site: string) => ({ "@type": "Organization", "@id": idEditeur(site), name: "BLUSH", url: site, logo: `${site}/icon.svg`, sameAs: COMPTES_OFFICIELS });

/**
 * Le site, avec les noms sous lesquels on le cherche (`alternateName`) : Google en tire le nom qu’il montre au-dessus
 * du lien, BLUSH plutôt que le fard à joues.
 */
const leSite = (site: string) => ({
  "@type": "WebSite",
  "@id": idSite(site),
  name: "BLUSH",
  alternateName: ["askblush", "Ask Blush", "askblush.com"],
  url: site,
  inLanguage: "fr",
  publisher: { "@id": idEditeur(site) },
});

/** Une personne qui relit : son nom et son rôle. */
const personne = ({ nom, role }: Personne) => ({ "@type": "Person", name: nom, jobTitle: role });

/** Le fil d’Ariane d’une page : ses étapes, de la landing à elle, chacune son nom et son adresse. */
const filDAriane = (id: string, etapes: readonly { nom: string; url: string }[]) => ({
  "@type": "BreadcrumbList",
  "@id": id,
  itemListElement: etapes.map(({ nom, url }, k) => ({ "@type": "ListItem", position: k + 1, name: nom, item: url })),
});

/**
 * Les données de la landing : l’éditeur, le site, et l’appli web, décrite par la phrase de BLUSH (src/contenu/identite.ts)
 * avec son prix de départ (`prix`, celui du rapport en euros, lu dans le catalogue par la page).
 */
export function donneesDuSite(site: string, prix: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      editeur(site),
      leSite(site),
      {
        "@type": "WebApplication",
        name: "BLUSH",
        url: site,
        inLanguage: "fr",
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Web, iOS, Android",
        description: PHRASE_D_IDENTITE,
        publisher: { "@id": idEditeur(site) },
        offers: { "@type": "Offer", price: prix, priceCurrency: "EUR" },
      },
    ],
  };
}

/** Les données d’un hub (/guides, /lexique) : une page qui rassemble les articles de sa rubrique, et son fil d’Ariane. */
export function donneesDuHub(genre: Genre, site: string) {
  const { chemin, nom } = RUBRIQUES[genre];
  const url = `${site}${chemin}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      editeur(site),
      leSite(site),
      { "@type": "CollectionPage", "@id": url, url, name: nom, inLanguage: "fr", isPartOf: { "@id": idSite(site) }, breadcrumb: { "@id": `${url}#fil` } },
      filDAriane(`${url}#fil`, [
        { nom: "BLUSH", url: site },
        { nom, url },
      ]),
    ],
  };
}

/**
 * Les données d’un article : l’article, écrit par l’éditeur (l’équipe BLUSH, jamais une personne inventée), avec ses
 * dates et son image ; sa page, relue par son relecteur (et son expert) : `reviewedBy` est une propriété de la page dans
 * schema.org, pas de l’article ; et son fil d’Ariane.
 */
export function donneesDeLArticle(article: Article, site: string) {
  const url = `${site}${cheminDe(article)}`;
  const { chemin, nom } = RUBRIQUES[article.genre];
  return {
    "@context": "https://schema.org",
    "@graph": [
      editeur(site),
      leSite(site),
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name: article.titre,
        inLanguage: "fr",
        isPartOf: { "@id": idSite(site) },
        breadcrumb: { "@id": `${url}#fil` },
        mainEntity: { "@id": `${url}#article` },
        reviewedBy: [article.relecteur, ...(article.expert ? [article.expert] : [])].map(personne),
        lastReviewed: article.misAJourLe,
      },
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: article.titre,
        description: article.description,
        inLanguage: "fr",
        datePublished: article.publieLe,
        dateModified: article.misAJourLe,
        author: { "@id": idEditeur(site) },
        publisher: { "@id": idEditeur(site) },
        image: `${url}/image`,
        keywords: article.motCle,
        mainEntityOfPage: { "@id": url },
      },
      filDAriane(`${url}#fil`, [
        { nom: "BLUSH", url: site },
        { nom, url: `${site}${chemin}` },
        { nom: article.titre, url },
      ]),
    ],
  };
}

/** Un graphe de données structurées dans la page : du JSON écrit par nous, « < » échappé pour qu’aucune balise ne s’y ferme. */
export function DonneesStructurees({ donnees }: { donnees: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(donnees).replace(/</g, "\\u003c") }} />;
}
