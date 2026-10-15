import type { Metadata } from "next";

/*
 * Ce que les moteurs de recherche voient de BLUSH. Le site entier est hors des moteurs par défaut (src/app/layout.tsx) :
 * une page publique le dit elle-même (pagePublique), avec son adresse canonique. Les mêmes pages forment le plan du
 * site (src/app/sitemap.ts), et robots.txt (src/app/robots.ts) écarte ce qui est privé.
 */

/** Les pages publiques, à indexer : leur chemin, et leur poids dans le plan du site. */
export const PAGES_PUBLIQUES = [
  { chemin: "/", priorite: 1 },
  { chemin: "/confidentialite", priorite: 0.5 },
  { chemin: "/conditions", priorite: 0.3 },
  { chemin: "/mentions-legales", priorite: 0.2 },
] as const;

type CheminPublic = (typeof PAGES_PUBLIQUES)[number]["chemin"];

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
 * Les métadonnées d’une page publique : indexée et suivie, son adresse canonique, et son aperçu dans les réseaux (le
 * titre et la description de la page ; l’image, celle du site, src/app/opengraph-image.tsx).
 */
export function pagePublique(chemin: CheminPublic, { title, description }: { title: string; description: string }): Metadata {
  return {
    title: chemin === "/" ? { absolute: title } : title,
    description,
    alternates: { canonical: chemin },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
    /* L’image du site (src/app/opengraph-image.tsx) redite : l’aperçu d’une page remplace celui du site en entier, image comprise */
    openGraph: { title, description, url: chemin, images: [IMAGE_DU_SITE] },
    twitter: { title, description, images: [IMAGE_DU_SITE.url] },
  };
}
