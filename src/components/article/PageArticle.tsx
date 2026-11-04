import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { RUBRIQUES } from "@/contenu/articles";
import type { Article } from "@/contenu/articles/types";
import { BlocsArticle } from "./blocs";
import { COLONNE, CONTENEUR, GRILLE_DE_LECTURE, PageEditoriale } from "./cadre";
import { ancre, attaqueDe, couvertureDe, minutesDeLecture } from "./lecture";
import { BlocAide, CarteArticle, chiffresDe, Couverture, FicheDeLArticle, Signature } from "./pieces";
import { DansCeGuide, Intertitre, TitreDeBloc, type EntreeDuSommaire } from "./texte";
import { Compose, ROSE_VIF, TitreEnDeuxTemps } from "./titre";

/*
 * La page d’un guide ou d’une entrée du lexique (src/contenu/articles), rendue sur le serveur : du HTML statique, lisible
 * sans JavaScript (les robots des assistants n’en exécutent pas), habillée comme la landing (le papier crème, l’encre,
 * Nunito 900, BLUSH dans ses bulles roses, toi en bleu). Le gabarit de la charte, dans l’ordre du texte : le thème, le
 * titre (la requête telle qu’on la tape, un seul h1, ses mots surlignés), la signature (et son lien vers /methode), le
 * bloc d’aide en zone rouge (en tête, avant tout le texte), « La réponse courte », « Dans ce guide », les sections aux
 * intertitres en questions, la FAQ en texte, les articles liés, la fiche de l’article (ses sources datées, l’historique
 * de ses changements de fond, ce que /methode promet), puis la fin de la page : l’appel à importer sa conv (tiré du
 * code), ou, en zone rouge, un simple lien.
 * Un guide se lit comme un magazine : sa couverture à côté du titre, un sommaire collé à gauche de la colonne de lecture
 * et ses figures dans un téléphone (sur un ordinateur). Une entrée du lexique, plus courte, en est la version d’une
 * colonne : ni couverture, ni sommaire, ses figures à plat.
 * La zone rouge (la violence, la détresse, les mineurs) reste sobre partout, pas seulement à la fin : ni couverture, ni
 * bulle dans le titre, BLUSH sans autocollant, et le bloc d’aide à la place de la couverture (à droite du titre sur un
 * ordinateur, sous lui sur un téléphone), ses numéros d’urgence dans le premier écran.
 * TODO(produit): l’habit sobre de la zone rouge (le titre à l’encre, les bulles de BLUSH blanches et droites, le bloc
 * d’aide à côté du titre), recommandé par la relecture adverse, à valider sur une vraie page rouge.
 * Les mêmes écrans servent aux aperçus de l’équipe (/apercu/guide, /apercu/lexique), sur des articles d’exemple.
 */

/** La ligne qui décrit « Pour aller plus loin », d’après ce qu’on y trouve : des guides, des mots du lexique, ou les deux. */
function sousDesLies(lies: readonly Article[]): string {
  const guides = lies.filter((a) => a.genre === "guide").length;
  if (guides === lies.length) return `${guides > 1 ? "D’autres guides" : "Un autre guide"} sur ce qui se passe dans une conv.`;
  if (!guides) return "Les mots de cette page, définis en une phrase.";
  return "D’autres guides, et les mots de cette page définis en une phrase.";
}

/** La page d’un article. `lies` : ses articles liés, déjà retrouvés dans le registre (liesDe, src/contenu/articles). */
export function PageArticle({ article, lies }: { article: Article; lies: readonly Article[] }) {
  const rubrique = RUBRIQUES[article.genre];
  const guide = article.genre === "guide";
  const sections = article.sections.map((s, k) => ({
    ...s,
    id: ancre(s.question),
    rang: k + 1,
    /* Le rang de sa première mini-conv parmi celles de la page : l’appli de chacune en dépend */
    rangDesConvs: article.sections.slice(0, k).flatMap((x) => x.blocs.filter((b) => b.type === "conv")).length,
  }));
  const faq = article.faq.length > 0;
  const entrees: EntreeDuSommaire[] = [
    ...sections.map((s) => ({ id: s.id, titre: s.question, rang: s.rang, numero: s.rang })),
    ...(faq ? [{ id: "questions", titre: "Les questions qu’on se pose", rang: sections.length + 1 }] : []),
  ];
  const colonne = guide ? "ordi:col-start-2" : "";
  const rouge = article.zone === "rouge";
  /* La conv de la couverture (un guide, hors zone rouge) : la page la garde à plat, pour ne pas montrer deux fois le même téléphone */
  const rangDeCouverture = guide && !rouge ? (couvertureDe(article)?.rang ?? null) : null;
  /* Les sections et la FAQ se touchent (leur écart en rembourrage, pas en marge) : la bande où le sommaire lit la section en cours ne tombe jamais entre deux */
  const ecart = guide ? "pt-16 ordi:pt-24" : "pt-12 ordi:pt-16";
  const reponse = attaqueDe(article.reponseCourte);
  return (
    <PageEditoriale rubrique={{ nom: rubrique.nom, chemin: rubrique.chemin }} lecture fin={rouge ? "sobre" : "vente"}>
      <article>
        {/* ———— La une : le thème, le titre en deux temps, le chapeau, la signature ; la couverture d’un guide à droite
                 (ordinateur), ou, en zone rouge, le bloc d’aide : à droite du titre, qui reste en vue, sinon dessous ———— */}
        <header
          className={cn(
            guide ? cn(CONTENEUR, "ordi:grid ordi:grid-cols-[minmax(0,1fr)_420px] ordi:gap-x-16", rouge ? "ordi:items-start" : "ordi:items-center") : COLONNE,
            "pt-7 ordi:pt-16",
          )}
        >
          <div className={cn(guide && rouge && "ordi:sticky ordi:top-28")}>
            <p className="m-0 text-note font-black text-elle-ink">
              {article.theme}
              {!guide && (
                <span className="font-extrabold text-grey">
                  {" "}
                  · {minutesDeLecture(article)}
                  {NBSP}min de lecture
                </span>
              )}
            </p>
            <h1 className="m-0 mt-3 ordi:mt-4">
              <TitreEnDeuxTemps
                article={article}
                sobre={rouge}
                tete={
                  guide
                    ? "text-[clamp(31px,10.2vw,46px)] font-black leading-[1.12] tracking-[-0.038em] ordi:text-[62px] ordi:leading-[1.08]"
                    : "text-[clamp(30px,9.4vw,40px)] font-black leading-[1.12] tracking-[-0.035em] ordi:text-[52px] ordi:leading-[1.08]"
                }
                suite={cn("mt-3 font-extrabold leading-[1.3] tracking-[-0.02em] text-grey ordi:mt-4", guide ? "text-[21px] ordi:text-[27px]" : "text-[19px] ordi:text-[24px]")}
              />
            </h1>
            {/* Le chapeau : à partir d’une tablette. Au premier écran du téléphone, on enlève plutôt qu’on empile : la réponse courte monte */}
            <p className="m-0 mt-5 hidden max-w-[560px] text-[17px] font-bold leading-[1.55] text-soft sm:block ordi:mt-6 ordi:text-[19px]">{article.description}</p>
            <div className="mt-6 ordi:mt-9">
              <Signature article={article} />
            </div>
          </div>
          {guide && !rouge && <Couverture article={article} className="hidden h-[540px] ordi:block" />}
          {/* La zone rouge : les numéros d’abord, avant la moindre ligne (charte, règle 27). Posé ici, il ne peut pas manquer
              ni descendre : un article rouge n’en met pas dans ses sections (tests/aide/articles.ts) */}
          {rouge && (
            <div className={cn("mt-6", guide ? "ordi:mt-0" : "ordi:mt-14")}>
              <BlocAide niveau={2} />
            </div>
          )}
        </header>

        {/* ———— La lecture : la réponse courte, le sommaire, les sections, la FAQ, les liés, la fiche ———— */}
        <div data-lecture="" className={cn(guide ? cn(CONTENEUR, GRILLE_DE_LECTURE) : COLONNE, "mt-8 ordi:mt-20")}>
          <section
            aria-labelledby="reponse-courte"
            className={cn("relative overflow-hidden rounded-[28px] bg-white px-6 pb-7 pt-6 shadow-card ordi:rounded-[32px] ordi:px-10 ordi:pb-10 ordi:pt-9", colonne)}
          >
            <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-[3px]", ROSE_VIF)} />
            <h2 id="reponse-courte" className="m-0 text-note font-black text-elle-ink">
              La réponse courte
            </h2>
            {/* Sa première phrase en gras, qui répond seule ; la suite en gras doux, à l’encre adoucie : pas un mur de gras */}
            <p className="m-0 mt-3 text-[19px] font-semibold leading-[1.55] tracking-[-0.005em] text-ink/80 [text-wrap:pretty] ordi:mt-4 ordi:text-[22px] ordi:leading-[1.5]">
              <span className="font-extrabold text-ink">{reponse.attaque}</span>
              {reponse.suite && ` ${reponse.suite}`}
            </p>
          </section>

          {/* Sur un téléphone, juste après la réponse courte ; sur un ordinateur, collé à gauche de la lecture, jusqu’à la FAQ */}
          {guide && (
            <div className="mt-12 ordi:col-start-1 ordi:row-start-1 ordi:mt-0" style={{ gridRowEnd: `span ${entrees.length + 1}` }}>
              <DansCeGuide entrees={entrees} chiffres={chiffresDe(article)} className="ordi:sticky ordi:top-28" />
            </div>
          )}

          {sections.map((s) => (
            <section key={s.id} aria-labelledby={s.id} data-section={s.rang} className={cn(ecart, colonne)}>
              <Intertitre id={s.id} numero={guide ? s.rang : null}>
                {s.question}
              </Intertitre>
              <BlocsArticle blocs={s.blocs} rangDesConvs={s.rangDesConvs} telephone={guide} rangDeCouverture={rangDeCouverture} sobre={rouge} />
            </section>
          ))}

          {faq && (
            <section aria-labelledby="questions" data-section={sections.length + 1} className={cn(ecart, colonne)}>
              <TitreDeBloc id="questions" titre="Les questions qu’on se pose" sous="Ce qu’on se demande aussi, et la réponse en deux ou trois phrases." grand={guide} />
              <div className="mt-6 border-b border-line ordi:mt-8">
                {article.faq.map((q) => (
                  <div key={q.question} className="border-t border-line py-6 ordi:py-7">
                    <h3 className="m-0 text-[18px] font-black leading-[1.3] tracking-[-0.01em] text-ink ordi:text-[20px]">
                      <Compose texte={q.question} />
                    </h3>
                    <p className="m-0 mt-2 text-[16px] font-semibold leading-[1.65] text-ink/75 ordi:text-[17px]">{q.reponse}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {lies.length > 0 && (
            <section aria-labelledby="plus-loin" className={cn("mt-16 ordi:mt-24", colonne)}>
              <TitreDeBloc id="plus-loin" titre="Pour aller plus loin" sous={sousDesLies(lies)} grand={false} />
              <ul className={cn("m-0 mt-6 grid list-none gap-4 p-0", lies.length > 1 && "sm:grid-cols-2")}>
                {lies.map((a) => (
                  <li key={a.slug}>
                    <CarteArticle article={a} niveau={3} enLigne={lies.length === 1} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className={cn("mt-16 ordi:mt-24", colonne)}>
            <FicheDeLArticle article={article} />
          </div>
        </div>
      </article>
    </PageEditoriale>
  );
}
