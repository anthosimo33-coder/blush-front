import type { MetadataRoute } from "next";
import { PAGES_PUBLIQUES } from "@/lib/referencement";
import { URL_SITE } from "@/server/env";

/* Le plan du site : les pages publiques seulement (src/lib/referencement.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES_PUBLIQUES.map(({ chemin, priorite }) => ({
    url: `${URL_SITE}${chemin === "/" ? "" : chemin}`,
    changeFrequency: chemin === "/" ? "weekly" : "monthly",
    priority: priorite,
  }));
}
