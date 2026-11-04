import { cheminDe, RUBRIQUES } from "@/contenu/articles";
import type { Article, Genre, Personne } from "@/contenu/articles/types";
import { COMPTES_OFFICIELS, PHRASE_D_IDENTITE } from "@/contenu/identite";
import { EDITEUR } from "@/contenu/mentions-legales";

/*
 * Ce que les moteurs comprennent de BLUSH et de ses pages publiques : des données structurées schema.org, en JSON-LD,
 * rien d’affiché. Un graphe par page, dont les nœuds se citent par leur @id (l’éditeur, le site, la page). `site` :
 * l’adresse du site (URL_SITE, src/server/env.ts), que la page passe (ce module est aussi lu hors du serveur).
 * Ni FAQPage (Google ne montre plus ce résultat depuis le 7 mai 2026 : la FAQ des articles reste en texte), ni
 * aggregateRating (la note des avis, tant que la page ne dit pas comment ils ont été recueillis).
 */

/** L’@id de l’éditeur (l’Organization) : le même sur toutes les pages. */
const idEditeur = (site: string) => `${site}/#editeur`;
/** L’@id du site (le WebSite) : le même sur toutes les pages. */
const idSite = (site: string) => `${site}/#site`;

/**
 * L’éditeur : BLUSH, l’entreprise qui l’édite et son email (`legalName`, `email` : les mentions légales, comme /a-propos
 * les montre), son adresse, son logo, ses comptes officiels (src/contenu/identite.ts, `sameAs`), et la page qui dit
 * comment ses guides sont faits (`publishingPrinciples`, /methode).
 */
const editeur = (site: string) => ({
  "@type": "Organization",
  "@id": idEditeur(site),
  name: "BLUSH",
  legalName: EDITEUR.nom,
  email: EDITEUR.email,
  url: site,
  logo: `${site}/icon.svg`,
  sameAs: COMPTES_OFFICIELS.map((c) => c.url),
  publishingPrinciples: `${site}/methode`,
});

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

/** L’expert qui relit un article de la zone rouge (un psychologue, une association) : son nom et son rôle. */
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
 * Les données d’une page de confiance (/a-propos, /methode, /aide) : la page, de son genre schema.org (`genre` : AboutPage
 * pour /a-propos, qui parle de l’éditeur, `about` ; WebPage sinon), dans le site, et son fil d’Ariane, celui que sa
 * barre du haut affiche (« blush | À propos », le cadre des guides) : la landing, puis elle, sous son nom court (`court`).
 */
export function donneesDUnePage({ genre, chemin, nom, court }: { genre: "AboutPage" | "WebPage"; chemin: `/${string}`; nom: string; court: string }, site: string) {
  const url = `${site}${chemin}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      editeur(site),
      leSite(site),
      {
        "@type": genre,
        "@id": url,
        url,
        name: nom,
        inLanguage: "fr",
        isPartOf: { "@id": idSite(site) },
        ...(genre === "AboutPage" ? { about: { "@id": idEditeur(site) } } : {}),
        breadcrumb: { "@id": `${url}#fil` },
      },
      filDAriane(`${url}#fil`, [
        { nom: "BLUSH", url: site },
        { nom: court, url },
      ]),
    ],
  };
}

/**
 * Les données d’un article : l’article, écrit et publié par l’éditeur (l’Organization BLUSH, jamais une personne), avec
 * ses dates et son image ; sa page, avec le jour où son texte a été validé (`lastReviewed`, `valideLe`) et, en zone
 * rouge, l’expert qui l’a relue (`reviewedBy`, une propriété de la page dans schema.org, pas de l’article) : aucun autre
 * nom, celui du directeur de la publication ne vit que dans les mentions légales ; son thème (`articleSection`, le
 * surtitre de la page, pas une page à lui) ; et son fil d’Ariane.
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
        ...(article.expert ? { reviewedBy: personne(article.expert) } : {}),
        lastReviewed: article.valideLe,
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
        articleSection: article.theme,
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
