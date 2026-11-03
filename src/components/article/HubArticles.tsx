import type { Route } from "next";
import { MobileTopBar, Screen, ScreenTitle, Lead } from "@/components/shell/Screen";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { cheminDe, RUBRIQUES } from "@/contenu/articles";
import type { Article, Genre } from "@/contenu/articles/types";
import { AppelImport, FilDAriane, PiedArticle } from "./pieces";

/*
 * Le hub d’une rubrique (/guides, /lexique), rendu sur le serveur : son titre, sa phrase, et tous ses articles, du plus
 * récent au plus ancien (articlesDu, src/contenu/articles), chacun avec sa description. Il n’existe qu’avec un article :
 * vide, la page répond 404 (src/app/guides/page.tsx).
 */

/** Le hub d’une rubrique : `articles`, les siens ; `voisine`, l’autre rubrique quand elle a des articles (un lien de plus). */
export function HubArticles({ genre, articles, voisine }: { genre: Genre; articles: readonly Article[]; voisine: Genre | null }) {
  const rubrique = RUBRIQUES[genre];
  return (
    <Screen mobileTop={<MobileTopBar back={{ repli: "/" }} title={rubrique.nom} />} desktopBack={{ target: { repli: "/" } }} mainWidth={680}>
      <header>
        <FilDAriane etapes={[{ nom: "BLUSH", href: "/" }, { nom: rubrique.nom }]} />
        <ScreenTitle size={32} desktopSize={44} className="pt-1.5">
          {rubrique.nom}
        </ScreenTitle>
        <Lead className="mt-3">{rubrique.sous}</Lead>
      </header>

      <InsetGroup className="mt-4">
        {articles.map((a) => (
          <InsetRow key={a.slug} title={a.titre} sub={a.description} href={cheminDe(a) as Route} chevron />
        ))}
      </InsetGroup>

      {voisine && (
        <InsetGroup className="mt-2">
          <InsetRow
            leading={<RowIcon icon={voisine === "guide" ? "file" : "list"} tone={voisine === "guide" ? "elle" : "toi"} />}
            title={RUBRIQUES[voisine].nom}
            sub={RUBRIQUES[voisine].sous}
            href={RUBRIQUES[voisine].chemin}
            chevron
          />
        </InsetGroup>
      )}

      <div className="mt-6">
        <AppelImport zone="verte" />
      </div>
      <PiedArticle />
    </Screen>
  );
}
