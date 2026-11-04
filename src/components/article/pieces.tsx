import type { Route } from "next";
import Link from "next/link";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { figtree } from "@/lib/fonts";
import { NBSP } from "@/lib/format";
import { BoutonDUrgence, LigneDUrgence, lignesAvecPhrase, numerosSeuls } from "@/components/juridique/urgences";
import { Icon } from "@/components/ui/icons";
import { cheminDe, EXEMPLE_INVENTE } from "@/contenu/articles";
import type { Article } from "@/contenu/articles/types";
import { GROUPES_D_AIDE, METHODE } from "@/contenu/pages-de-confiance";
import { BulleMini } from "./bulle";
import { BullesDeConv, EnTeteDeConv, fondDe, Telephone, TexteDecor } from "./ecran";
import { couvertureDe, minutesDeLecture } from "./lecture";
import { DateEnLettres, LigneDeFiche, TitreDeBloc } from "./texte";
import { ROSE_PROFOND, ROSE_VIF, TitreEnDeuxTemps } from "./titre";

/*
 * Les pièces des pages des guides et du lexique (PageArticle, HubArticles), rendues sur le serveur : la signature, le
 * bloc d’aide, la fiche de l’article, sa couverture et sa carte. Les pièces de texte que les pages de confiance
 * partagent avec eux (les intertitres, le sommaire, les lignes de fiche) sont dans ./texte.tsx, qui ne dessine aucun
 * écran. Rien ici ne tourne dans le navigateur.
 */

/** « 6 min de lecture · 5 questions » : ce que coûte un guide à lire, et combien de questions il traite (ses sections). */
export function chiffresDe(article: Article): string {
  const n = article.sections.length;
  return `${minutesDeLecture(article)}\u00a0min de lecture · ${n}\u00a0question${n > 1 ? "s" : ""}`;
}

/**
 * Un lien dans le texte, souligné discrètement, et touchable au doigt : 44 px de haut par ses marges intérieures, qui ne
 * bougent pas la ligne (un élément en ligne).
 */
const LIEN_EN_LIGNE = "py-3.5 text-soft underline decoration-[rgba(17,17,20,0.25)] underline-offset-2 hover:text-ink hover:decoration-ink";

/**
 * La signature, sous le titre : « Par l’équipe BLUSH · mis à jour le … · Notre méthode », sans aucun nom (le directeur
 * de la publication répond des guides depuis les mentions légales, /methode le dit) ; en zone rouge, l’expert qui a relu
 * aussi (« relu par …, … »), une vraie personne. Le texte suit cet ordre, pour les moteurs et les lecteurs d’écran ; à
 * l’œil, deux lignes : l’équipe et sa méthode, puis la date (et l’expert au-dessus d’elle).
 */
export function Signature({ article }: { article: Article }) {
  const { expert } = article;
  return (
    <div className="flex items-center gap-3">
      {/* Sous 360 px, l’avatar s’efface : l’équipe et sa méthode tiennent sur la première ligne */}
      <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-soft max-[359px]:hidden">
        <BulleMini size={28} />
      </span>
      <p className="m-0 flex min-w-0 flex-wrap items-baseline text-note font-extrabold leading-[1.45] text-grey">
        <span className="order-1 font-black text-ink">Par l’équipe BLUSH</span>
        <span className="sr-only"> · </span>
        {expert && (
          <>
            <span className="order-4 basis-full first-letter:uppercase">relu par {expert.role ? `${expert.nom}, ${expert.role}` : expert.nom}</span>
            <span className="sr-only"> · </span>
          </>
        )}
        <span className="order-5 basis-full first-letter:uppercase">
          mis à jour le <DateEnLettres jour={article.misAJourLe} />
        </span>
        {/* Le point et la méthode, d’un bloc : jamais un point seul en bout de ligne */}
        <span className="order-2 whitespace-nowrap pl-[0.3em]">
          {" "}
          ·{" "}
          <Link href="/methode" className={LIEN_EN_LIGNE}>
            {METHODE.court}
          </Link>
        </span>
      </p>
    </div>
  );
}

/**
 * Le bloc d’aide d’une page orange ou rouge, l’habit de /aide (ses gestes : src/components/juridique/urgences.tsx) : la
 * phrase des urgences, puis le 17, le 112 et le 3114 en grands boutons bleus, le 114 par SMS ; puis les lignes d’écoute
 * et les lignes par situation, chacune à un toucher (le 3018 a aussi son tchat, comme sur la feuille du rapport doux).
 * Tout vient de src/contenu/aide.ts par GROUPES_D_AIDE, tel quel : un numéro changé là change ici et sur /aide. `niveau` :
 * celui de son titre, h3 dans une section (la zone orange), h2 en tête de page (la zone rouge, qui le surmonte du
 * surtitre rouge de /aide, « En danger, tout de suite »), pour que les titres se suivent sans sauter de marche.
 */
export function BlocAide({ niveau = 3 }: { niveau?: 2 | 3 }) {
  const titre = useId();
  const Titre = niveau === 2 ? "h2" : "h3";
  const [urgences, ...autres] = GROUPES_D_AIDE;
  const ligne = "block py-3 no-underline";
  if (!urgences) return null;
  return (
    <aside aria-labelledby={titre} className="relative overflow-hidden rounded-[26px] bg-white pb-2 shadow-card ordi:rounded-[32px]">
      {niveau === 2 && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-danger" />}
      <div className="px-4 pt-5 min-[360px]:px-5 ordi:px-8 ordi:pt-7">
        {niveau === 2 && (
          <p className="m-0 mb-2 flex items-center gap-1.5 text-detail font-black text-danger">
            <Icon name="alert" size={17} stroke={2.5} />
            {urgences.titre}
          </p>
        )}
        <div className="flex items-start gap-3.5">
          {/* En zone rouge, le surtitre et son triangle le disent déjà : la phrase des urgences prend toute la largeur, et les
              numéros montent dans le premier écran du téléphone */}
          {niveau === 3 && (
            <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[rgba(18,192,138,0.13)] text-vrai-ink">
              <Icon name="shield" size={22} stroke={2.3} />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <Titre id={titre} className="m-0 text-[21px] font-black leading-[1.15] tracking-[-0.02em] text-ink ordi:text-[24px]">
              Besoin d’en parler{NBSP}?
            </Titre>
            <p className="m-0 text-[15px] font-bold leading-[1.5] text-soft [text-wrap:pretty] ordi:text-[16px]">{urgences.texte}</p>
          </div>
        </div>
      </div>
      {/* Les numéros seuls en grands boutons, côte à côte, puis ceux qui ont leur phrase (le 114 par SMS), comme sur /aide */}
      <ul className="m-0 grid list-none grid-cols-3 gap-2 px-4 pt-4 min-[360px]:px-5 ordi:gap-3 ordi:px-8 ordi:pt-5">
        {numerosSeuls(urgences.lignes).map((l) => (
          <li key={l.lien} className="flex">
            <BoutonDUrgence ligne={l} />
          </li>
        ))}
      </ul>
      <ul className="m-0 flex list-none flex-col gap-2 px-4 pt-2 min-[360px]:px-5 ordi:px-8 ordi:pt-3">
        {lignesAvecPhrase(urgences.lignes).map((l) => (
          <li key={l.lien}>
            <LigneDUrgence ligne={l} />
          </li>
        ))}
      </ul>
      <ul className="m-0 mt-3 list-none px-4 min-[360px]:px-5 ordi:px-8">
        {autres
          .flatMap((g) => g.lignes)
          .map((l) => (
            <li key={l.lien} className="border-t border-sep first:border-t-0">
              <a href={l.lien} {...(l.lien.startsWith("https:") ? { target: "_blank", rel: "noreferrer" } : {})} className={ligne}>
                <span className="block text-[16px] font-black text-toi-ink">
                  {l.nom} · {l.label}
                </span>
                {l.pour && <span className="block text-note font-extrabold leading-[1.45] text-ink">{l.pour}</span>}
                {l.detail && <span className="block text-note font-bold leading-[1.45] text-grey">{l.detail}</span>}
              </a>
              {l.tchat && (
                <a
                  href={l.tchat}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Écrire en tchat au ${l.label}`}
                  className="-mt-2 mb-1 inline-flex min-h-11 items-center gap-1.5 text-note font-black text-toi-ink no-underline"
                >
                  Écrire en tchat
                  <Icon name="arrow" size={14} stroke={2.6} />
                </a>
              )}
            </li>
          ))}
      </ul>
    </aside>
  );
}

/**
 * La fiche d’un article, en tableau titré (une fiche produit) : qui l’a écrit (l’équipe BLUSH, et comment : /methode),
 * sa mise à jour, ses sources datées, ses exemples inventés (que /methode promet sous les sources), et l’historique de
 * ses changements de fond, le plus récent d’abord.
 */
export function FicheDeLArticle({ article }: { article: Article }) {
  const convs = article.sections.some((s) => s.blocs.some((b) => b.type === "conv"));
  return (
    <section aria-labelledby="fiche">
      {/* À la taille de « Pour aller plus loin », le bloc de fin juste au-dessus */}
      <TitreDeBloc
        id="fiche"
        titre={article.genre === "guide" ? "La fiche du guide" : "La fiche du mot"}
        sous="Qui l’a écrit, ses sources datées, ce qui a changé depuis sa publication."
        grand={false}
      />
      <dl className="m-0 mt-5 rounded-[26px] bg-white px-5 text-[15px] font-bold leading-[1.55] text-soft shadow-card ordi:px-7">
        <LigneDeFiche titre="Écrit par">
          <span className="font-extrabold text-ink">L’équipe BLUSH</span> ·{" "}
          <Link href="/methode" className={LIEN_EN_LIGNE}>
            {METHODE.court}
          </Link>
        </LigneDeFiche>
        <LigneDeFiche titre="Mis à jour">
          <DateEnLettres jour={article.misAJourLe} />
        </LigneDeFiche>
        <LigneDeFiche titre="Sources">
          <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 marker:font-black marker:text-pale">
            {article.sources.map((s) => (
              <li key={s.url} className="pl-1">
                <a href={s.url} rel="noopener" className="py-3 font-extrabold text-ink underline decoration-[rgba(17,17,20,0.2)] underline-offset-2 hover:decoration-ink">
                  {s.titre}
                </a>
                , consultée le <DateEnLettres jour={s.consulteLe} />
              </li>
            ))}
          </ol>
        </LigneDeFiche>
        {convs && <LigneDeFiche titre="Exemples">Les convs de cette page sont inventées{NBSP}: aucune ne vient d’une vraie personne.</LigneDeFiche>}
        <LigneDeFiche titre="Historique">
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {[...article.changements]
              .sort((a, b) => b.le.localeCompare(a.le))
              .map((c) => (
                <li key={`${c.le} ${c.quoi}`}>
                  <DateEnLettres jour={c.le} /> · {c.quoi}
                </li>
              ))}
          </ol>
        </LigneDeFiche>
      </dl>
    </section>
  );
}

/* Le fond d’une couverture : le papier qui s’éclaire, une lueur rose en haut (BLUSH), une bleue en bas (toi) */
const FOND_COUVERTURE =
  "[background:radial-gradient(70%_55%_at_80%_6%,rgba(255,155,203,0.45),rgba(255,155,203,0)_70%),radial-gradient(70%_55%_at_8%_100%,rgba(61,139,255,0.18),rgba(61,139,255,0)_70%),linear-gradient(180deg,#ffffff,#f3efe9)]";

/**
 * La couverture d’un guide (couvertureDe) : le téléphone de sa conv (ses trois dernières répliques, dans son appli),
 * coupé par le bas de son cadre, et une bulle de BLUSH collée en autocollant sous les messages. Une illustration : cachée
 * aux lecteurs d’écran (le même texte est dans l’article), jamais à la place d’un texte, ses textes en décor (le texte
 * de la page passe du titre à la réponse courte, sans elle) ; la conv y garde sa pastille « exemple inventé ».
 */
export function Couverture({ article, className }: { article: Article; className?: string }) {
  const c = couvertureDe(article);
  if (!c) return null;
  return (
    <div aria-hidden="true" data-couverture="" data-nosnippet="" className={cn("relative", className)}>
      <div className={cn("relative flex h-full justify-center overflow-hidden rounded-[36px] px-8 pt-10 shadow-card ordi:rounded-[44px] ordi:pt-12", FOND_COUVERTURE)}>
        <Telephone mode="telephone" fond={fondDe(c.appli)} etire>
          <EnTeteDeConv appli={c.appli} mode="telephone" decor />
          <BullesDeConv appli={c.appli} repliques={c.repliques} mode="telephone" compte={3} decor />
        </Telephone>
      </div>
      {c.bulle && (
        <span className="absolute -bottom-5 left-3 flex max-w-[86%] items-end gap-2 ordi:-left-10 ordi:bottom-10 ordi:max-w-[80%]">
          <BulleMini size={44} className="-mb-1" />
          <span
            className={cn(
              "-rotate-3 rounded-[22px] rounded-bl-[6px] px-4 pb-2.5 pt-2 text-[19px] font-black leading-[1.2] tracking-[-0.01em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_22px_40px_-16px_rgba(232,53,138,0.8)] [text-wrap:balance] ordi:text-[22px]",
              ROSE_VIF,
            )}
          >
            <TexteDecor texte={c.bulle} />
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * L’« image » d’une carte, comme celle d’un produit : la fin d’une mini-conv de l’article (deux répliques, marquées
 * « exemple inventé ») et une bulle de BLUSH. Plus légère qu’un téléphone réduit ; un décor (la page de l’article les
 * donne en entier), ses textes en CSS, comme la couverture : la carte se lit par son titre.
 */
function ApercuDeCarte({ article, enLigne }: { article: Article; enLigne: boolean }) {
  const c = couvertureDe(article);
  if (!c) return null;
  return (
    <div
      aria-hidden="true"
      data-nosnippet=""
      className={cn(
        "relative flex flex-col justify-end gap-1.5 overflow-hidden px-5 pb-6 pt-14 [background:var(--paper-light)] ordi:px-6",
        enLigne ? "sm:justify-center sm:py-12" : "ordi:h-[248px]",
        figtree.variable,
      )}
    >
      <TexteDecor texte={EXEMPLE_INVENTE} className="absolute left-5 top-4 z-[1] rounded-full bg-white px-2.5 py-1 text-micro font-black text-grey shadow-thin ordi:left-6" />
      {c.repliques.slice(-2).map((r, k) => (
        <span
          key={k}
          className={cn(
            "max-w-[84%] px-3 py-2 font-message text-note font-bold leading-[1.35]",
            r.de === "moi" ? "self-end rounded-[17px_17px_5px_17px] bg-bubble-me text-white" : "self-start rounded-[17px_17px_17px_5px] bg-white text-ink shadow-thin",
          )}
        >
          <TexteDecor texte={r.texte} />
        </span>
      ))}
      {c.bulle && (
        <span className="mt-2 flex items-end gap-1.5">
          <BulleMini size={28} className="-mb-0.5" />
          {/* 14 px : le rose profond, pour que le blanc garde 4,5:1 */}
          <span
            className={cn(
              "max-w-[84%] -rotate-[1.6deg] rounded-[18px] rounded-bl-[6px] px-3.5 pb-2 pt-1.5 text-note font-black leading-[1.3] text-white [text-wrap:balance]",
              ROSE_PROFOND,
            )}
          >
            <TexteDecor texte={c.bulle} />
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * La carte d’un article, comme celle d’un produit : son image (ApercuDeCarte), son thème, son titre en deux temps, sa
 * description, son temps de lecture et le rond flèche. Toute la carte mène à l’article. `niveau` : celui de son titre
 * (h2 dans un sommaire, h3 sous « Pour aller plus loin ») ; `enLigne` : l’image à gauche dès qu’il y a la place (une
 * carte seule sur sa ligne).
 */
export function CarteArticle({ article, niveau, enLigne = false }: { article: Article; niveau: 2 | 3; enLigne?: boolean }) {
  const Titre = niveau === 2 ? "h2" : "h3";
  return (
    <article
      className={cn(
        "lift lift-card group relative flex h-full flex-col overflow-hidden rounded-[28px] bg-white shadow-card",
        enLigne && "sm:grid sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]",
      )}
    >
      <ApercuDeCarte article={article} enLigne={enLigne} />
      <div className={cn("flex flex-1 flex-col gap-2 px-5 pb-5 pt-4 ordi:pb-6", enLigne ? "sm:justify-center sm:py-7 ordi:px-9" : "ordi:px-6")}>
        <span className="text-legende font-black text-elle-ink">{article.theme}</span>
        <Titre className="m-0 text-[20px] font-black leading-[1.2] tracking-[-0.02em] ordi:text-[23px]">
          <Link href={cheminDe(article) as Route} className="text-ink no-underline after:absolute after:inset-0 after:rounded-[28px] after:content-['']">
            <TitreEnDeuxTemps article={article} tete="" suite="mt-1 text-[0.82em] font-extrabold leading-[1.3] text-grey" petit sobre={article.zone === "rouge"} />
          </Link>
        </Titre>
        {/* Entière : sa longueur est bornée (la description des moteurs), une coupe finissait sur « .… » */}
        <p className="m-0 text-[15px] font-bold leading-[1.5] text-soft">{article.description}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <span className="text-legende font-extrabold text-grey">
            {minutesDeLecture(article)}
            {NBSP}min de lecture
          </span>
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-white">
            <Icon name="arrow" size={17} stroke={2.6} className="lift-chev" />
          </span>
        </div>
      </div>
    </article>
  );
}
