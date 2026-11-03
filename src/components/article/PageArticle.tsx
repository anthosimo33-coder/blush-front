import type { Route } from "next";
import { NBSP } from "@/lib/format";
import { MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { cheminDe, RUBRIQUES } from "@/contenu/articles";
import type { Article } from "@/contenu/articles/types";
import { BlocsArticle } from "./blocs";
import { AppelImport, DateEnLettres, FilDAriane, PiedArticle } from "./pieces";

/*
 * La page d’un guide ou d’une entrée du lexique (src/contenu/articles), rendue sur le serveur : du HTML statique, lisible
 * sans JavaScript (les robots des assistants n’en exécutent pas), dans l’habit des pages légales (le papier crème,
 * l’encre, Nunito, les cartes blanches) et les bulles de BLUSH. Le gabarit de la charte : le titre (la requête telle
 * qu’on la tape), la signature, « La réponse courte », les sections aux intertitres en questions, la FAQ en texte,
 * l’appel à importer sa conv (tiré du code), les articles liés et les sources datées.
 * Les mêmes écrans servent aux aperçus de l’équipe (/apercu/guide, /apercu/lexique), sur un article d’exemple.
 */

/** L’ancre d’un intertitre, tirée de son texte : « Il lit sans répondre ? » → « il-lit-sans-repondre ». */
const ancre = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** « Par l’équipe BLUSH · relu par …, … · mis à jour le … » : une vraie signature, jamais un personnage inventé. */
function Signature({ article }: { article: Article }) {
  const { relecteur, expert } = article;
  return (
    <p className="m-0 mt-3 text-note font-extrabold leading-[1.5] text-grey">
      Par l’équipe BLUSH · relu par {[relecteur, ...(expert ? [expert] : [])].map(({ nom, role }) => (role ? `${nom}, ${role}` : nom)).join(" et ")} · mis à jour le{" "}
      <DateEnLettres jour={article.misAJourLe} />
    </p>
  );
}

/** Un intertitre de l’article (h2), en question, avec son ancre. */
function Intertitre({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="m-0 scroll-mt-6 text-[23px] font-black leading-[1.15] tracking-[-0.02em] [text-wrap:balance] lg:text-[27px]">
      {children}
    </h2>
  );
}

/** La page d’un article. `lies` : ses articles liés, déjà retrouvés dans le registre (liesDe, src/contenu/articles). */
export function PageArticle({ article, lies }: { article: Article; lies: readonly Article[] }) {
  const rubrique = RUBRIQUES[article.genre];
  return (
    <Screen mobileTop={<MobileTopBar back={{ repli: rubrique.chemin }} title={rubrique.nom} />} desktopBack={{ target: { repli: rubrique.chemin } }} mainWidth={680}>
      <article className="flex flex-col">
        <header>
          <FilDAriane etapes={[{ nom: "BLUSH", href: "/" }, { nom: rubrique.nom, href: rubrique.chemin }, { nom: article.titre }]} />
          <ScreenTitle size={30} desktopSize={42} className="pt-1.5">
            {article.titre}
          </ScreenTitle>
          <Signature article={article} />
        </header>

        <section aria-labelledby="reponse-courte" className="mt-6 flex flex-col gap-2 rounded-[22px] bg-white px-5 py-4 shadow-card">
          <h2 id="reponse-courte" className="m-0 text-legende font-black text-elle-ink">
            La réponse courte
          </h2>
          <p className="m-0 text-[17px] font-extrabold leading-[1.55] text-ink lg:text-[18px]">{article.reponseCourte}</p>
        </section>

        {article.sections.map((s) => {
          const id = ancre(s.question);
          return (
            <section key={id} aria-labelledby={id} className="mt-10 flex flex-col gap-4">
              <Intertitre id={id}>{s.question}</Intertitre>
              <BlocsArticle blocs={s.blocs} />
            </section>
          );
        })}

        {article.faq.length > 0 && (
          <section aria-labelledby="questions" className="mt-10 flex flex-col gap-4">
            <Intertitre id="questions">Les questions qu’on se pose</Intertitre>
            <div className="flex flex-col gap-2.5 rounded-[22px] bg-white px-4 py-4 shadow-card [&>*+*]:border-t [&>*+*]:border-sep [&>*+*]:pt-3">
              {article.faq.map((q) => (
                <div key={q.question} className="flex flex-col gap-1">
                  <h3 className="m-0 text-corps font-black leading-[1.3] text-ink">{q.question}</h3>
                  <p className="m-0 text-detail font-extrabold leading-[1.5] text-soft">{q.reponse}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-10">
          <AppelImport zone={article.zone} />
        </div>

        {lies.length > 0 && (
          <InsetGroup title="Pour aller plus loin" id="plus-loin" className="mt-10">
            {lies.map((a) => (
              <InsetRow
                key={a.slug}
                leading={<RowIcon icon={a.genre === "guide" ? "file" : "list"} tone={a.genre === "guide" ? "elle" : "toi"} />}
                title={a.titre}
                sub={RUBRIQUES[a.genre].nom}
                href={cheminDe(a) as Route}
                chevron
              />
            ))}
          </InsetGroup>
        )}

        <section aria-labelledby="sources" className="mt-10 flex flex-col gap-2">
          <h2 id="sources" className="m-0 pl-4 text-legende font-black text-grey">
            Sources
          </h2>
          <ol className="m-0 flex list-decimal flex-col gap-1.5 rounded-[20px] bg-white py-3.5 pl-9 pr-4 text-legende font-extrabold leading-[1.45] text-soft shadow-card marker:text-pale">
            {article.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} rel="noopener" className="text-ink underline decoration-[rgba(17,17,20,0.25)] underline-offset-2 hover:decoration-ink">
                  {s.titre}
                </a>
                , consultée le <DateEnLettres jour={s.consulteLe} />
              </li>
            ))}
          </ol>
          {article.sections.some((s) => s.blocs.some((b) => b.type === "conv")) && (
            <p className="m-0 px-4 text-legende font-extrabold leading-[1.45] text-grey">Les convs de cette page sont inventées{NBSP}: aucune ne vient d’une vraie personne.</p>
          )}
        </section>

        <PiedArticle />
      </article>
    </Screen>
  );
}
