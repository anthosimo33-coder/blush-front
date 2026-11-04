import type { Metadata, MetadataRoute } from "next";
import { expect } from "vitest";
import type { PagePublique } from "@/lib/referencement";

/*
 * Ce que les tests du référencement vérifient de chaque page publique (tests/unit/referencement*.test.ts) : ses
 * métadonnées, lues dans sa propre route de src/app (comme Next les lit), disent qu’elle s’indexe, avec son adresse
 * canonique et son aperçu complet, et le plan du site la donne avec le jour de son dernier changement de fond. Un
 * fichier de test qui importe les pages remplace les polices de next/font (vi.mock("@/lib/fonts")) : elles ne se
 * chargent que dans la compilation de Next.
 */

/** Les deux paramètres d’une page, tels que Next les passe. */
const props = <P extends object>(params: P) => ({ params: Promise.resolve(params), searchParams: Promise.resolve({}) });

/** Les métadonnées d’une page publique, telles que sa route (src/app/…/page.tsx) les donne. */
async function metadonneesDe(chemin: string): Promise<Metadata> {
  const article = /^\/(guides|lexique)\/([^/]+)$/.exec(chemin);
  if (article?.[1] === "guides") return (await import("@/app/guides/[slug]/page")).generateMetadata(props({ slug: article[2]! }));
  if (article?.[1] === "lexique") return (await import("@/app/lexique/[terme]/page")).generateMetadata(props({ terme: article[2]! }));
  switch (chemin) {
    case "/":
      return (await import("@/app/page")).metadata;
    case "/confidentialite":
      return (await import("@/app/confidentialite/page")).metadata;
    case "/conditions":
      return (await import("@/app/conditions/page")).metadata;
    case "/mentions-legales":
      return (await import("@/app/mentions-legales/page")).metadata;
    case "/a-propos":
      return (await import("@/app/a-propos/page")).metadata;
    case "/methode":
      return (await import("@/app/methode/page")).metadata;
    case "/aide":
      return (await import("@/app/aide/page")).metadata;
    case "/guides":
      return (await import("@/app/guides/page")).generateMetadata();
    case "/lexique":
      return (await import("@/app/lexique/page")).generateMetadata();
  }
  throw new Error(`${chemin} : une page publique sans route connue des tests (tests/aide/referencement.ts, metadonneesDe)`);
}

/**
 * Chaque page publique s’indexe et se suit, donne son adresse canonique (son propre chemin) et son aperçu complet (le
 * nom du site, la langue), et le plan du site `plan` la donne, avec le jour de son dernier changement de fond.
 */
export async function verifierLesPagesPubliques(pages: readonly PagePublique[], plan: MetadataRoute.Sitemap) {
  expect(plan.map((p) => new URL(p.url).pathname)).toEqual(pages.map((p) => p.chemin));
  for (const { chemin, misAJourLe } of pages) {
    const m = await metadonneesDe(chemin);
    expect(m.robots, chemin).toMatchObject({ index: true, follow: true });
    expect(m.alternates?.canonical, chemin).toBe(chemin);
    expect(m.openGraph, chemin).toMatchObject({ url: chemin, siteName: "BLUSH", locale: "fr_FR" });
    expect(plan.find((p) => new URL(p.url).pathname === chemin)?.lastModified, chemin).toBe(misAJourLe);
  }
}
