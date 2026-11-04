import type { Route } from "next";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { Icon } from "@/components/ui/icons";
import { cheminDe, RUBRIQUES } from "@/contenu/articles";
import type { Article, Genre } from "@/contenu/articles/types";
import { COLONNE, CONTENEUR, PageEditoriale } from "./cadre";
import { minutesDeLecture } from "./lecture";
import { CarteArticle, Couverture } from "./pieces";
import { DateEnLettres, TitreDeBloc } from "./texte";
import { Surligne, TitreEnDeuxTemps } from "./titre";

/*
 * Le sommaire d’une rubrique (/guides, /lexique), rendu sur le serveur : son titre surligné et sa phrase, puis tous ses
 * articles, du plus récent au plus ancien (articlesDu, src/contenu/articles), chacun avec sa description, l’autre
 * rubrique quand elle a des articles, et la fin rose de la landing. Celui des guides est une une de magazine : le guide à
 * la une avec sa couverture (la même que sur sa page ; le plus récent, et à date égale le premier du registre), puis les
 * autres en cartes ; celui du lexique, un index de
 * dictionnaire, un mot par ligne. Il n’existe qu’avec un article : vide, la page répond 404 (src/app/guides/page.tsx).
 */

/**
 * Le guide à la une : son thème, son titre en deux temps, sa description, sa lecture, puis sa couverture. Toute la une
 * mène au guide (le lien de son titre s’étend sur elle ; la couverture, posée au-dessus, laisse passer le clic).
 */
function ALaUne({ article }: { article: Article }) {
  return (
    <article className="group relative grid items-center gap-10 ordi:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] ordi:gap-16">
      <div className="flex flex-col items-start">
        <p className="m-0 text-note font-black text-elle-ink">
          À la une <span className="font-extrabold text-grey">· {article.theme}</span>
        </p>
        <h2 className="m-0 mt-3">
          <Link href={cheminDe(article) as Route} className="text-ink no-underline after:absolute after:inset-0 after:rounded-[36px] after:content-['']">
            <TitreEnDeuxTemps
              article={article}
              sobre={article.zone === "rouge"}
              tete="text-[clamp(30px,9.4vw,40px)] font-black leading-[1.14] tracking-[-0.035em] ordi:text-[48px] ordi:leading-[1.1]"
              suite="mt-2.5 text-[19px] font-extrabold leading-[1.3] tracking-[-0.015em] text-grey ordi:mt-3 ordi:text-[24px]"
            />
          </Link>
        </h2>
        <p className="m-0 mt-5 max-w-[500px] text-[17px] font-bold leading-[1.55] text-soft ordi:text-[18px]">{article.description}</p>
        <p className="m-0 mt-4 text-note font-extrabold text-grey">
          {minutesDeLecture(article)}
          {NBSP}min de lecture · <DateEnLettres jour={article.misAJourLe} />
        </p>
        <span
          aria-hidden="true"
          className="arrow-nudge mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-white px-5 text-detail font-black text-ink shadow-soft transition-shadow group-hover:shadow-[var(--shadow-soft-hover)]"
        >
          Lire le guide
          <Icon name="arrow" size={16} stroke={2.6} className="arrow" />
        </span>
      </div>
      <Couverture article={article} className="pointer-events-none h-[440px] sm:h-[500px] ordi:h-[560px]" />
    </article>
  );
}

/** L’autre rubrique, en une ligne : son nom, sa phrase, et la flèche. Toute la ligne y mène. */
function Voisine({ genre }: { genre: Genre }) {
  const r = RUBRIQUES[genre];
  return (
    <Link href={r.chemin} className="lift lift-card group flex min-h-11 items-center gap-4 rounded-[26px] bg-white px-5 py-5 no-underline shadow-card ordi:px-7 ordi:py-6">
      <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-plaque text-ink">
        <Icon name={genre === "guide" ? "file" : "list"} size={21} stroke={2.4} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[19px] font-black tracking-[-0.015em] text-ink">{r.nom}</span>
        <span className="text-[15px] font-bold leading-[1.45] text-grey">{r.sous}</span>
      </span>
      <Icon name="chevron" size={18} stroke={2.6} className="shrink-0 text-pale transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Une entrée du sommaire du lexique : son titre en deux temps (le mot, puis ce que l’entrée promet), sa description, la flèche. */
function LigneDuLexique({ article }: { article: Article }) {
  return (
    <li className="border-t border-line first:border-t-0">
      <article className="group relative flex items-center gap-4 py-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="text-legende font-black text-elle-ink">{article.theme}</span>
          <h2 className="m-0">
            <Link href={cheminDe(article) as Route} className="text-ink no-underline after:absolute after:inset-0 after:content-['']">
              <TitreEnDeuxTemps
                article={article}
                sobre={article.zone === "rouge"}
                tete="text-[28px] font-black leading-[1.12] tracking-[-0.03em] ordi:text-[34px]"
                suite="mt-1 text-[17px] font-extrabold leading-[1.3] text-grey ordi:text-[19px]"
                petit
              />
            </Link>
          </h2>
          <p className="m-0 text-[15px] font-bold leading-[1.5] text-soft">{article.description}</p>
        </div>
        <Icon name="chevron" size={20} stroke={2.6} className="shrink-0 text-pale transition-transform group-hover:translate-x-0.5" />
      </article>
    </li>
  );
}

/** Le sommaire d’une rubrique : `articles`, les siens ; `voisine`, l’autre rubrique quand elle a des articles (un lien de plus). */
export function HubArticles({ genre, articles, voisine }: { genre: Genre; articles: readonly Article[]; voisine: Genre | null }) {
  const rubrique = RUBRIQUES[genre];
  const [une, ...suite] = articles;
  return (
    <PageEditoriale rubrique={{ nom: rubrique.nom, chemin: rubrique.chemin }} surLaRubrique fin="vente">
      <header className={cn(genre === "lexique" ? COLONNE : CONTENEUR, "pt-10 ordi:pt-20")}>
        {/* Le titre de la rubrique, tel quel (celui de la page), dans la bulle rose de la landing */}
        <h1 className="m-0 -ml-[0.04em] text-[clamp(50px,16vw,68px)] font-black leading-[1.05] tracking-[-0.045em] ordi:text-[104px]">
          <Surligne ton="rose">{rubrique.nom}</Surligne>
        </h1>
        <p className="m-0 mt-6 max-w-[620px] text-[18px] font-bold leading-[1.5] text-soft [text-wrap:pretty] ordi:mt-8 ordi:text-[21px]">{rubrique.sous}</p>
      </header>

      {genre === "guide" ? (
        <>
          {une && (
            <div className={cn(CONTENEUR, "mt-12 ordi:mt-20")}>
              <ALaUne article={une} />
            </div>
          )}
          {suite.length > 0 && (
            <section aria-labelledby="aussi" className={cn(CONTENEUR, "mt-20 ordi:mt-28")}>
              <div className="border-t border-line pt-8">
                <TitreDeBloc id="aussi" titre="Aussi dans les guides" sous="Chaque guide part d’une question qu’on se pose, avec des convs d’exemple inventées." grand />
              </div>
              <ul className={cn("m-0 mt-8 grid list-none gap-5 p-0 ordi:gap-7", suite.length > 1 && "sm:grid-cols-2", suite.length > 2 && "ordi:grid-cols-3")}>
                {suite.map((a) => (
                  <li key={a.slug}>
                    <CarteArticle article={a} niveau={3} enLigne={suite.length === 1} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <div className={cn(COLONNE, "mt-10 ordi:mt-14")}>
          <ul className="m-0 list-none border-y border-line p-0">
            {articles.map((a) => (
              <LigneDuLexique key={a.slug} article={a} />
            ))}
          </ul>
        </div>
      )}

      {voisine && (
        <div className={cn(genre === "lexique" ? COLONNE : CONTENEUR, "mt-16 ordi:mt-20")}>
          <Voisine genre={voisine} />
        </div>
      )}
    </PageEditoriale>
  );
}
