import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BulleMini } from "@/components/article/bulle";
import { DateEnLettres } from "@/components/article/texte";
import { TitreSurligne } from "@/components/article/titre";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Jour } from "@/contenu/articles/types";
import { A_PROPOS, METHODE, PAGE_AIDE } from "@/contenu/pages-de-confiance";

/*
 * Les pages de confiance (/a-propos, /methode, /aide ; leurs textes : src/contenu/pages-de-confiance.ts), dans l’habit
 * des guides (le cadre « Magazine », src/components/article/cadre.tsx) : ici, leurs liens au pied des pages, et les
 * pièces qu’elles partagent, rendues sur le serveur : l’en-tête (le grand titre surligné, le chapeau, la signature),
 * la carte titrée avec sa description (une fiche produit), et la ligne qui mène à une autre page. À part des pages
 * légales (./pages.tsx) : « Mon compte », rendu dans le navigateur, importe les liens des pages légales, et n’emporte
 * ainsi rien des textes ni des pièces de celles-ci. Ce fichier n’importe pas le cadre, qui l’importe (ses liens).
 */

/** Les pages de confiance, dans l’ordre des pieds de page : le leur, celui des guides, celui de la landing. */
export const PAGES_DE_CONFIANCE: readonly { href: Route; nom: string }[] = [
  { href: "/a-propos", nom: A_PROPOS.court },
  { href: "/methode", nom: METHODE.court },
  { href: "/aide", nom: PAGE_AIDE.court },
];

/** Les liens vers les pages de confiance, au pied d’une page (sans celle où l’on est, `ici`). */
export function LiensDeConfiance({ ici, className }: { ici?: Route; className?: string }) {
  return (
    <nav aria-label="À propos de BLUSH" className={cn("flex flex-wrap justify-center gap-x-5 gap-y-2 text-note font-extrabold", className)}>
      {PAGES_DE_CONFIANCE.filter((p) => p.href !== ici).map((p) => (
        <Link key={p.href} href={p.href} className="text-soft no-underline hover:text-ink">
          {p.nom}
        </Link>
      ))}
    </nav>
  );
}

/**
 * L’en-tête d’une page de confiance : son titre en très grand (le seul h1, au texte de la page, son expression dans la
 * bulle de la landing), son chapeau, puis sa signature (`misAJourLe` : l’équipe et la date de sa version), écrite comme
 * sous un guide (« Mis à jour le 3 novembre 2026 », sans point final).
 */
export function EnTeteDeConfiance({
  titre,
  surligne,
  sous,
  misAJourLe,
  className,
}: {
  titre: string;
  surligne: { mots: string; ton: "rose" | "bleu" };
  sous: string;
  misAJourLe?: Jour;
  className?: string;
}) {
  return (
    <header className={className}>
      <h1 className="m-0 -ml-[0.02em] text-[clamp(36px,11.2vw,48px)] font-black leading-[1.12] tracking-[-0.04em] [text-wrap:balance] ordi:text-[72px] ordi:leading-[1.06]">
        <TitreSurligne texte={titre} surligne={surligne} />
      </h1>
      <p className="m-0 mt-4 max-w-[600px] text-[17px] font-bold leading-[1.55] text-soft [text-wrap:pretty] ordi:mt-7 ordi:text-[20px]">{sous}</p>
      {misAJourLe && (
        <div className="mt-6 flex items-center gap-3 ordi:mt-9">
          {/* Sous 360 px, l’avatar s’efface, comme sous un guide */}
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-soft max-[359px]:hidden">
            <BulleMini size={28} />
          </span>
          <p className="m-0 flex min-w-0 flex-col text-note font-extrabold leading-[1.45] text-grey">
            <span className="font-black text-ink">Par l’équipe BLUSH</span>
            <span className="sr-only"> · </span>
            <span>
              Mis à jour le <DateEnLettres jour={misAJourLe} />
            </span>
          </p>
        </div>
      )}
    </header>
  );
}

/** Le ton du pictogramme d’une carte ou d’une ligne : son fond pâle et son encre. */
const TONS = {
  encre: "bg-plaque text-ink",
  elle: "bg-[rgba(255,79,154,0.12)] text-elle-ink",
  toi: "bg-[rgba(61,139,255,0.12)] text-toi-ink",
  vrai: "bg-[rgba(18,192,138,0.13)] text-vrai-ink",
  danger: "bg-[rgba(194,54,59,0.1)] text-danger",
} as const;

/** Un ton de pictogramme (TONS). */
type TonDuPictogramme = keyof typeof TONS;

/** Un pictogramme dans son carré arrondi, à côté d’un titre ou d’une ligne. */
function Pictogramme({ icone, ton, taille = 44 }: { icone: IconName; ton: TonDuPictogramme; taille?: 40 | 44 }) {
  return (
    <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center", taille === 44 ? "size-11 rounded-[15px]" : "size-10 rounded-[13px]", TONS[ton])}>
      <Icon name={icone} size={taille === 44 ? 22 : 20} stroke={2.3} />
    </span>
  );
}

/**
 * Une carte titrée, comme une fiche produit : son pictogramme et son titre (un h2, ancre `id`, qu’un lien du sommaire
 * amène sous la barre du haut), la ligne qui dit ce qu’elle montre (`sous`), puis son contenu.
 */
export function CarteDeConfiance({
  id,
  titre,
  sous,
  icone,
  ton = "encre",
  className,
  children,
}: {
  id: string;
  titre: string;
  sous: string;
  icone: IconName;
  ton?: TonDuPictogramme;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn("overflow-hidden rounded-[28px] bg-white shadow-card ordi:rounded-[32px]", className)}>
      <div className="px-4 pt-5 min-[360px]:px-5 ordi:px-8 ordi:pt-8">
        <div className="flex items-center gap-3.5">
          <Pictogramme icone={icone} ton={ton} />
          <h2 id={id} className="m-0 min-w-0 scroll-mt-32 text-[21px] font-black leading-[1.15] tracking-[-0.02em] text-ink [text-wrap:balance] ordi:text-[26px]">
            {titre}
          </h2>
        </div>
        <p className="m-0 mt-3 text-[15px] font-bold leading-[1.5] text-grey [text-wrap:pretty] ordi:text-[16px]">{sous}</p>
      </div>
      {children}
    </section>
  );
}

/** Les lignes d’une carte, séparées d’un filet (sans marge : la carte ou la page la donne). */
export const LIGNES = "m-0 list-none p-0 [&>*+*]:border-t [&>*+*]:border-sep";

/** Les lignes sous l’en-tête d’une carte titrée : un filet, puis elles. */
export const LIGNES_DE_CARTE = cn(LIGNES, "mt-3 border-t border-sep ordi:mt-5");

/**
 * Une ligne qui mène ailleurs (une page, un email, un compte), toute la ligne à un toucher : son pictogramme, son titre
 * et sa ligne (le titre d’abord, puis sa phrase : le texte se lit dans cet ordre), et le chevron. Une adresse d’un autre
 * site s’ouvre à côté.
 */
export function LigneVers({ href, icone, ton = "encre", titre, sous }: { href: string; icone: IconName; ton?: TonDuPictogramme; titre: string; sous?: string }) {
  const classes = "row-hover group flex min-h-[68px] items-center gap-3.5 px-4 py-3.5 no-underline min-[360px]:px-5 ordi:px-8";
  const contenu = (
    <>
      <Pictogramme icone={icone} ton={ton} taille={40} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[17px] font-black leading-[1.3] tracking-[-0.01em] text-ink">{titre}</span>
        {sous && <span className="break-words text-[14.5px] font-bold leading-[1.45] text-grey">{sous}</span>}
      </span>
      <Icon name="chevron" size={18} stroke={2.6} className="lift-chev shrink-0 text-pale transition-[translate]" />
    </>
  );
  if (href.startsWith("/"))
    return (
      <Link href={href as Route} className={classes}>
        {contenu}
      </Link>
    );
  return (
    <a href={href} {...(href.startsWith("https:") ? { target: "_blank", rel: "noopener" } : {})} className={classes}>
      {contenu}
    </a>
  );
}
