import type { MetadataRoute } from "next";
import { pagesPubliques } from "@/lib/referencement";
import { URL_SITE } from "@/server/env";

/*
 * Le plan du site : les pages publiques seulement (src/lib/referencement.ts), registre des articles compris, chacune avec
 * le jour de son dernier changement de fond (jamais celui du build : une date qui bouge à chaque mise en ligne, les
 * moteurs cessent de la lire). La mise en production en envoie aussi les adresses à IndexNow (.github/workflows/ci.yml).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return pagesPubliques().map(({ chemin, priorite, misAJourLe }) => ({
    url: `${URL_SITE}${chemin === "/" ? "" : chemin}`,
    lastModified: misAJourLe,
    changeFrequency: chemin === "/" ? "weekly" : "monthly",
    priority: priorite,
  }));
}
