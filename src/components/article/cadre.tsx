import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { CtaButton } from "@/components/landing/CtaButton";
import { ctaDe } from "@/components/landing/cta";
import { LiensDeConfiance } from "@/components/juridique/confiance";
import { LiensJuridiques } from "@/components/juridique/pages";
import { LogoIlot } from "@/components/shell/LogoIlot";
import { Icon } from "@/components/ui/icons";
import { PHRASE_D_IDENTITE } from "@/contenu/identite";
import { prixDe } from "@/contenu/offres";
import { BulleMini, DefsBulle } from "./bulle";

/*
 * Le cadre des pages éditoriales de BLUSH (les guides, le lexique, leurs sommaires, et les pages de confiance : /a-propos,
 * /methode, /aide), rendu sur le serveur : le papier crème et sa lueur blanche de la landing, la barre du haut en titre
 * de magazine (« blush | Guides », le fil d’Ariane, et le bouton blanc de la landing), une barre de lecture sous elle,
 * le contenu, puis la fin de la landing : un bloc rose plein, l’autocollant de BLUSH, le bouton blanc, et « blush » en
 * très grand. En zone rouge, ni bouton ni prix ni rose : un simple lien, et le pied sur le papier ; sur /aide, qui ne
 * vend rien, le pied seul. Aucun îlot à soi : seul le logo en est un, comme partout.
 */

/** La largeur de la landing : 1120 px au plus, ses marges sur les côtés. À poser sur l’élément qui porte le contenu. */
export const CONTENEUR = "mx-auto w-full max-w-[1120px] px-[22px] ordi:px-8";

/**
 * La grille de lecture d’un guide (et des pages de confiance) sur un ordinateur : le sommaire collé à gauche (220 px),
 * l’écart, puis la colonne de lecture (660 px). Sur un téléphone, une colonne.
 */
export const GRILLE_DE_LECTURE = "ordi:grid ordi:grid-cols-[220px_minmax(0,660px)] ordi:gap-x-16";

/**
 * La colonne étroite d’une page éditoriale (une entrée du lexique, son sommaire) : 724 px au plus, marges comprises,
 * centrée ; 660 px de texte sur un ordinateur, la colonne de lecture d’un guide (environ 65 signes par ligne).
 */
export const COLONNE = "mx-auto w-full max-w-[724px] px-[22px] ordi:px-8";

/**
 * Ce qui décide de la fin d’une page : « vente », la fin rose et son bouton (le prix lu dans le catalogue) ; « sobre »,
 * un simple lien vers l’import et le pied sur le papier (la zone rouge : ni bouton ni prix ni bloc rose) ; « pied », le
 * pied seul, sans un mot sur l’import (/aide : rien à vendre, pas même un lien).
 */
type Fin = "vente" | "sobre" | "pied";

/**
 * Une page éditoriale : le papier, le dessin de la bulle de BLUSH (une fois, pour toutes ses BulleMini), la barre du
 * haut, le contenu, puis sa fin. La police des bulles des convs (Figtree) n’est pas posée ici : chaque écran de conv la
 * pose lui-même (./ecran.tsx), et les pages qui n’en dessinent pas (/aide, /a-propos, /methode) ne la préchargent pas. `rubrique` : la seconde étape du fil d’Ariane (Guides,
 * Lexique, ou la page de confiance elle-même) ; `surLaRubrique` : on est sur sa page ; `lecture` : la barre de lecture
 * (un article) ; `ici` : la page de confiance où l’on est, que son pied ne relie pas à elle-même ; `bouton` : le bouton
 * blanc dans la barre, partout où la page finit en rose, sauf sur une page de confiance (son seul appel est sa fin).
 */
export function PageEditoriale({
  rubrique,
  surLaRubrique = false,
  lecture = false,
  fin,
  ici,
  bouton = fin === "vente",
  children,
}: {
  rubrique: { nom: string; chemin: Route };
  surLaRubrique?: boolean;
  lecture?: boolean;
  fin: Fin;
  ici?: Route;
  bouton?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="isolate flex min-h-dvh flex-col overflow-x-clip [background:var(--paper-light)]">
      <DefsBulle />
      <BarreDuHaut rubrique={rubrique} surLaRubrique={surLaRubrique} lecture={lecture} bouton={bouton} />
      <main className="flex-1">{children}</main>
      {fin === "vente" ? <FinRose ici={ici} /> : fin === "sobre" ? <FinSobre ici={ici} /> : <FinPied ici={ici} />}
    </div>
  );
}

/**
 * La barre du haut, en titre de magazine : la bulle et « blush », puis la rubrique (le fil d’Ariane, jusqu’au sommaire),
 * et le bouton blanc de la landing (pas en zone rouge, `bouton`). Givrée sur un téléphone ; sur un ordinateur presque
 * opaque, pour que les ronds noirs des intertitres ne deviennent pas des taches grises en passant dessous. Sur un
 * article, un filet rose sous la barre suit la lecture : une animation liée au défilement, sans script, absente des
 * navigateurs qui ne la connaissent pas.
 */
function BarreDuHaut({ rubrique, surLaRubrique, lecture, bouton }: { rubrique: { nom: string; chemin: Route }; surLaRubrique: boolean; lecture: boolean; bouton: boolean }) {
  const cta = ctaDe(null);
  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(17,17,20,0.06)] bg-[rgba(244,242,237,0.84)] backdrop-blur-xl ordi:bg-[rgba(247,246,242,0.97)] ordi:backdrop-blur-none">
      <div className={cn(CONTENEUR, "flex h-14 items-center justify-between gap-3 ordi:h-16")}>
        <nav aria-label="Fil d’Ariane" className="min-w-0">
          <ol className="m-0 flex list-none items-center gap-3 p-0 max-[359px]:gap-2">
            <li className="shrink-0">
              <LogoIlot size={28} fontSize={21} href="/" />
            </li>
            <li aria-hidden="true" className="h-[18px] w-px shrink-0 bg-[rgba(17,17,20,0.16)]" />
            <li className="min-w-0">
              <Link
                href={rubrique.chemin}
                aria-current={surLaRubrique ? "page" : undefined}
                className="inline-flex h-11 items-center truncate text-[17px] font-extrabold tracking-[-0.02em] text-soft no-underline transition-colors hover:text-ink"
              >
                {rubrique.nom}
              </Link>
            </li>
          </ol>
        </nav>
        {bouton && (
          <Link
            href={cta.href}
            className="arrow-nudge lift lift-sm inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white pl-4 pr-3.5 text-note font-black text-ink no-underline shadow-soft max-[359px]:px-3.5"
          >
            {cta.header}
            {/* Sous 360 px de large, la flèche s’efface : la rubrique et le bouton tiennent sur la ligne */}
            <span className="inline-flex max-[359px]:hidden">
              <Icon name="arrow" size={15} stroke={2.6} className="arrow text-ink" />
            </span>
          </Link>
        )}
      </div>
      {lecture && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -bottom-px hidden h-[2px] origin-left [animation-duration:auto] [animation-fill-mode:both] [animation-name:jGrow] [animation-timeline:scroll(root)] [animation-timing-function:linear] [background:var(--rose-blush)] supports-[animation-timeline:scroll()]:block"
        />
      )}
    </header>
  );
}

/**
 * Le pied commun aux fins : la phrase de BLUSH (`phrase` : sous le lien discret de la zone rouge ; la fin rose la dit
 * déjà sous son titre, /aide ne la dit pas, elle parle d’importer sa conv), puis les pages de confiance (sans celle où
 * l’on est, `ici`) et les pages légales, chaque lien à 44 px.
 */
function Pied({ surRose, ici, phrase }: { surRose: boolean; ici?: Route; phrase: boolean }) {
  const lien = surRose ? "[&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:text-white [&_a:hover]:text-white" : "[&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center";
  return (
    <>
      {phrase && <p className={cn("m-0 max-w-[480px] text-note font-extrabold leading-[1.5]", surRose ? "text-white" : "text-grey")}>{PHRASE_D_IDENTITE}</p>}
      <LiensDeConfiance ici={ici} className={lien} />
      <LiensJuridiques className={cn("-mt-4", lien, surRose && "[&_a]:font-bold")} />
    </>
  );
}

/**
 * L’appel à importer, sous le titre de la fin rose de /a-propos, qui dit déjà la phrase de BLUSH en tête. Partout
 * ailleurs, la fin rose dit cette phrase (identite.ts), la même sur toutes les pages où le site se présente, pour les
 * moteurs et les assistants.
 */
const APPEL = `Importe ta conv\u00a0: captures d’écran, export Instagram ou WhatsApp. BLUSH la lit et te dit ce qui se passe vraiment entre vous.`;

/**
 * La fin d’une page, dans le rose du pied de la landing (src/components/landing/PiedDePage.tsx) : BLUSH qui t’invite
 * (sa bulle blanche, inclinée), sa phrase (dite une fois : le pied ne la redit pas), le bouton blanc de la landing, ses
 * deux promesses l’une sous l’autre, le prix du rapport lu dans le catalogue (jamais écrit ici), puis le pied et
 * « blush » en très grand, coupé par le bas. Le blanc, mesuré au plus clair sous chaque texte, sa lueur comprise (de
 * 320 à 1280 px) : le titre à 3,3:1 au moins et la phrase à 4:1, deux grands textes ; les petits textes, plus bas sur le
 * rose profond, à 4,8:1 au moins. Le contour du clavier y est blanc (le bleu ne se voyait pas sur le rose).
 */
function FinRose({ ici }: { ici?: Route }) {
  const cta = ctaDe(null);
  return (
    <footer className="relative isolate mt-24 overflow-hidden rounded-t-[36px] text-white [background:linear-gradient(180deg,var(--elle)_0%,#e8358a_22%,#d4317e_34%,var(--color-elle-ink)_58%,#a50f55_100%)] ordi:mt-32 ordi:rounded-t-[48px] [&_:focus-visible]:outline-white">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[420px] w-[900px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(255,255,255,0.1),rgba(255,255,255,0))]"
      />
      <section aria-labelledby="importer-titre" className="mx-auto flex max-w-[760px] flex-col items-center px-[22px] pt-16 text-center ordi:pt-24">
        <p aria-hidden="true" className="m-0 flex -rotate-[4deg] items-end gap-1.5">
          <BulleMini size={34} className="-mb-1" />
          <span className="rounded-[20px] rounded-bl-[6px] bg-white px-4 pb-2 pt-1.5 text-[17px] font-black text-elle-ink shadow-[0_14px_30px_-14px_rgba(110,0,50,0.6)] ordi:text-[20px]">
            envoie la conv, je te dis tout
          </span>
        </p>
        <h2
          id="importer-titre"
          className="m-0 mt-7 text-[44px] font-black leading-[0.98] tracking-[-0.04em] [text-shadow:0_0.04em_0_rgba(140,0,70,0.2)] [text-wrap:balance] sm:text-[60px] ordi:text-[84px]"
        >
          Tu veux savoir pour toi{NBSP}?
        </h2>
        {/* 19 px en gras : un grand texte, lisible sur tout le dégradé */}
        <p className="m-0 mt-5 max-w-[520px] text-[19px] font-extrabold leading-[1.5] text-white [text-wrap:balance] ordi:text-[20px]">
          {ici === "/a-propos" ? APPEL : PHRASE_D_IDENTITE}
        </p>
        <CtaButton
          retour={null}
          blanc
          className="mt-8 w-full max-w-[340px] sm:w-auto sm:h-[64px] sm:px-10 sm:text-[19px] ordi:h-[68px] ordi:rounded-[34px] ordi:px-11 ordi:text-[20px]"
        />
        {/* Ses deux promesses, l’une sous l’autre : aucun point qui pend en bout de ligne (le texte, lui, garde « · ») */}
        <p className="m-0 mt-4 flex flex-col items-center text-note font-extrabold leading-[1.6] text-white">
          {(cta.note ?? "").split(" · ").map((promesse, k) => (
            <span key={promesse}>
              {k > 0 && <span className="sr-only"> · </span>}
              {promesse}
            </span>
          ))}
        </p>
        <p className="m-0 mt-1.5 text-note font-extrabold text-white">
          Le rapport{NBSP}: {prixDe("rapport")}
        </p>
      </section>

      <div className={cn(CONTENEUR, "mt-16 flex flex-col items-center gap-4 text-center ordi:mt-24")}>
        <span aria-hidden="true" className="h-0.5 w-full rounded-full bg-white/35" />
        <LogoIlot size={28} fontSize={20} href="/" onInk />
        <Pied surRose ici={ici} phrase={false} />
      </div>
      <p
        aria-hidden="true"
        className="pointer-events-none m-0 mb-[-0.111em] mt-6 select-none whitespace-nowrap text-center text-[34vw] font-black leading-[0.72] tracking-[-0.05em] text-white ordi:mt-10 ordi:text-[min(30vw,420px)]"
      >
        blush
      </p>
    </footer>
  );
}

/**
 * La fin d’une page de la zone rouge (violence, détresse, mineurs) : ni bouton, ni prix, ni bloc rose. Une phrase et un
 * simple lien vers l’import, pour qui en veut une lecture, puis le pied sur le papier.
 * TODO(produit): l’appel sur les pages sensibles (décision n° 6 du plan SEO) ; en attendant, la recommandation : ce
 * simple lien en zone rouge, le bouton ailleurs.
 */
function FinSobre({ ici }: { ici?: Route }) {
  const cta = ctaDe(null);
  return (
    <footer className={cn(CONTENEUR, "mt-20 pb-12 ordi:mt-28")}>
      <div className="flex flex-col items-center gap-5 border-t border-line pt-10 text-center">
        <p className="m-0 max-w-[480px] text-[16px] font-bold leading-[1.55] text-soft">
          Tu veux une lecture de ta conv{NBSP}?{" "}
          <Link href={cta.href} className="whitespace-nowrap py-3.5 font-black text-ink underline decoration-[rgba(17,17,20,0.25)] underline-offset-2">
            Importe-la sur BLUSH
          </Link>
          .
        </p>
        <BulleMini size={36} />
        <Pied surRose={false} ici={ici} phrase />
      </div>
    </footer>
  );
}

/**
 * La fin d’une page qui ne vend rien (/aide) : ni bouton, ni prix, ni rose, ni lien vers l’import, pas même la phrase
 * de BLUSH (elle parle d’importer sa conv). La bulle de BLUSH, puis les pages de confiance et les pages légales, sur le
 * papier.
 */
function FinPied({ ici }: { ici?: Route }) {
  return (
    <footer className={cn(CONTENEUR, "mt-20 pb-12 ordi:mt-28")}>
      <div className="flex flex-col items-center gap-5 border-t border-line pt-10 text-center">
        <BulleMini size={36} />
        <Pied surRose={false} ici={ici} phrase={false} />
      </div>
    </footer>
  );
}
