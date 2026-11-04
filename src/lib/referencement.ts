import type { Metadata } from "next";
import { ARTICLES, articlesDu, cheminDe, RUBRIQUES } from "@/contenu/articles";
import type { Article, Genre, Jour } from "@/contenu/articles/types";
import { CONDITIONS } from "@/contenu/conditions";
import { CONFIDENTIALITE_MISE_A_JOUR } from "@/contenu/confidentialite";
import { MENTIONS } from "@/contenu/mentions-legales";
import { A_PROPOS, METHODE, PAGE_AIDE } from "@/contenu/pages-de-confiance";

/*
 * Ce que les moteurs de recherche voient de BLUSH. Le site entier est hors des moteurs par défaut (src/app/layout.tsx) :
 * une page publique le dit elle-même (pagePublique), avec son adresse canonique et son aperçu complet. Les mêmes pages
 * forment le plan du site (src/app/sitemap.ts) et /llms.txt, et robots.txt (src/app/robots.ts) écarte ce qui est privé.
 * Les pages publiques : les pages fixes (PAGES_PUBLIQUES), puis les guides et le lexique, tirés du registre des articles
 * (src/contenu/articles), avec leurs deux hubs dès qu’ils ont un article.
 */

/**
 * Le jour du dernier vrai changement de texte de la landing (src/contenu/landing.ts, src/components/landing), que le plan
 * du site donne aux moteurs. À changer avec un texte de la landing changé (une phrase, un avis, une question), jamais
 * pour un style ou un bouton déplacé : une date qui bouge sans raison, les moteurs cessent de la croire.
 */
const LANDING_MISE_A_JOUR: Jour = "2026-11-03";

/**
 * Les pages fixes à indexer : leur chemin, leur nom (/llms.txt), leur poids dans le plan du site, et le jour de leur
 * dernier changement de fond (celui que la page affiche, pour les pages légales et les pages de confiance).
 */
export const PAGES_PUBLIQUES = [
  { chemin: "/", nom: "Accueil", priorite: 1, misAJourLe: LANDING_MISE_A_JOUR },
  { chemin: "/confidentialite", nom: "Confidentialité", priorite: 0.5, misAJourLe: CONFIDENTIALITE_MISE_A_JOUR },
  { chemin: "/conditions", nom: "Conditions d’utilisation et de vente", priorite: 0.3, misAJourLe: CONDITIONS.misAJourLe },
  { chemin: "/mentions-legales", nom: "Mentions légales", priorite: 0.2, misAJourLe: MENTIONS.misAJourLe },
  /* Les pages de confiance (src/contenu/pages-de-confiance.ts) : qui est BLUSH, comment ses guides sont faits, les numéros d’aide */
  { chemin: "/a-propos", nom: A_PROPOS.titre, priorite: 0.4, misAJourLe: A_PROPOS.misAJourLe },
  { chemin: "/methode", nom: METHODE.titre, priorite: 0.4, misAJourLe: METHODE.misAJourLe },
  { chemin: "/aide", nom: PAGE_AIDE.court, priorite: 0.3, misAJourLe: PAGE_AIDE.misAJourLe },
] as const satisfies readonly { chemin: `/${string}`; nom: string; priorite: number; misAJourLe: Jour }[];

/** Le chemin d’une page publique : une page fixe, un hub (/guides, /lexique), ou un article du registre. */
type CheminPublic = (typeof PAGES_PUBLIQUES)[number]["chemin"] | (typeof RUBRIQUES)[Genre]["chemin"] | ReturnType<typeof cheminDe>;

/** Une page publique du plan du site : son chemin, son nom, son poids, et le jour de son dernier changement de fond. */
export type PagePublique = { chemin: CheminPublic; nom: string; priorite: number; misAJourLe: Jour };

/** Le jour le plus récent d’une liste (des jours « AAAA-MM-JJ », qui se comparent comme du texte). */
const plusRecent = (jours: readonly Jour[]) => jours.reduce((a, b) => (b > a ? b : a));

/**
 * Toutes les pages publiques, dans l’ordre du plan du site : les pages fixes, puis chaque rubrique qui a des articles
 * (son hub, à jour de son article le plus récent, puis ses articles). Une rubrique vide n’existe pas (404), ni dans le
 * plan du site, ni dans /llms.txt. `articles` : le registre (les tests en donnent d’autres).
 */
export function pagesPubliques(articles: readonly Article[] = ARTICLES): PagePublique[] {
  const rubriques = (Object.keys(RUBRIQUES) as Genre[]).flatMap((genre): PagePublique[] => {
    const liste = articlesDu(genre, articles);
    if (!liste.length) return [];
    const { chemin, nom } = RUBRIQUES[genre];
    return [
      { chemin, nom, priorite: 0.6, misAJourLe: plusRecent(liste.map((a) => a.misAJourLe)) },
      ...liste.map((a) => ({ chemin: cheminDe(a), nom: a.titre, priorite: genre === "guide" ? 0.7 : 0.5, misAJourLe: a.misAJourLe })),
    ];
  });
  return [...PAGES_PUBLIQUES, ...rubriques];
}

/** Les chemins privés que robots.txt écarte : l’API, le parcours, le rapport, le chat, le compte, et les outils de l’équipe. */
export const CHEMINS_PRIVES = [
  "/api/",
  "/app",
  "/rapport",
  "/compte",
  "/importer",
  "/commencer",
  "/qui",
  "/lecture",
  "/email",
  "/connexion",
  "/effacer",
  "/ouvrir/",
  "/paiement",
  "/attente",
  "/desinscription",
  "/retour",
  "/admin",
  "/apercu",
  "/styleguide",
  "/tournage",
] as const;

/** L’image d’aperçu du site (src/app/opengraph-image.tsx). */
const IMAGE_DU_SITE = { url: "/opengraph-image", width: 1200, height: 630, alt: "BLUSH · Ta conv en dit plus que tu crois" };

/**
 * Les métadonnées d’une page publique : indexée et suivie, son adresse canonique, et son aperçu dans les réseaux, complet
 * (le nom du site, la langue, le genre de la page : les moteurs lisent aussi le nom du site là). Le titre et la
 * description de la page ; l’image, celle du site (src/app/opengraph-image.tsx), ou celle de l’article (`article` : un
 * guide ou une entrée du lexique, son image à <chemin>/image, et ses dates de publication et de mise à jour).
 */
export function pagePublique(
  chemin: CheminPublic,
  { title, description, article }: { title: string; description: string; article?: Pick<Article, "publieLe" | "misAJourLe"> },
): Metadata {
  const image = article ? { url: `${chemin}/image`, width: 1200, height: 630, alt: title } : IMAGE_DU_SITE;
  return {
    title: chemin === "/" ? { absolute: title } : title,
    description,
    alternates: { canonical: chemin },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
    /* L’aperçu d’une page remplace celui du site en entier (src/app/layout.tsx) : le nom du site, la langue et l’image se redisent */
    openGraph: {
      title,
      description,
      url: chemin,
      siteName: "BLUSH",
      locale: "fr_FR",
      images: [image],
      ...(article ? { type: "article", publishedTime: article.publieLe, modifiedTime: article.misAJourLe } : { type: "website" }),
    },
    twitter: { title, description, images: [image.url] },
  };
}
