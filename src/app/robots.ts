import type { MetadataRoute } from "next";
import { CHEMINS_PRIVES } from "@/lib/referencement";
import { surVercel } from "@/server/drapeaux";
import { URL_SITE } from "@/server/env";

/*
 * robots.txt : les moteurs peuvent lire les pages publiques, pas ce qui est privé (src/lib/referencement.ts). Les
 * verdicts partagés (/v/…) restent lisibles par les robots des aperçus (WhatsApp, iMessage, X) : leur page dit
 * elle-même de ne pas l’indexer. Hors de Vercel (en local, dans les tests), rien ne s’indexe.
 */
export default function robots(): MetadataRoute.Robots {
  if (!surVercel()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...CHEMINS_PRIVES] },
    sitemap: `${URL_SITE}/sitemap.xml`,
    host: URL_SITE,
  };
}
