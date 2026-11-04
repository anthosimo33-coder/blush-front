import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { jourEnLettres } from "@/lib/format";
import { Icon } from "@/components/ui/icons";
import type { Jour } from "@/contenu/articles/types";
import { attaqueDe } from "./lecture";
import { Compose, ROSE_VIF } from "./titre";

/*
 * Les pièces de texte des pages éditoriales, rendues sur le serveur, que les guides, le lexique et les pages de
 * confiance (/a-propos, /methode) partagent : les intertitres et les titres de bloc, la date, le sommaire « Dans ce
 * guide », les lignes de fiche, et le corps du texte (paragraphes, listes). Rien ici ne dessine d’écran de conv : ce
 * module n’importe ni ./ecran ni la police des bulles, que les pages de confiance n’ont pas à précharger (une police
 * n’est préchargée que sur les routes qui l’importent, doc de next/font).
 */

/**
 * Un intertitre (h2) : en guide (et dans les règles de /methode), son numéro (comme les chapitres du rapport), puis la
 * question en grand ; en lexique (et sur /a-propos), la question seule.
 */
export function Intertitre({ id, numero, children }: { id: string; numero: number | null; children: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-4", numero ? "mb-6 ordi:mb-8" : "mb-4")}>
      {numero && (
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-ink text-note font-black text-white shadow-ink">
          {numero}
        </span>
      )}
      <h2
        id={id}
        className={cn(
          "m-0 scroll-mt-24 font-black tracking-[-0.03em] [text-wrap:balance]",
          numero ? "text-[29px] leading-[1.1] ordi:text-[40px] ordi:leading-[1.06]" : "text-[25px] leading-[1.12] ordi:text-[30px]",
        )}
      >
        <Compose texte={children} />
      </h2>
    </div>
  );
}

/**
 * Un titre de bloc (h2) et sa ligne de description : la fin d’un article, les blocs des pages de confiance. Composé et
 * équilibré comme un intertitre (« pose » ne reste pas seul sur sa ligne) ; `grand` : à la taille des intertitres
 * numérotés (la FAQ d’un guide, qui est dans son sommaire), sinon à celle des blocs de fin.
 */
export function TitreDeBloc({ id, titre, sous, grand }: { id: string; titre: string; sous: string; grand: boolean }) {
  return (
    <>
      <h2
        id={id}
        className={cn(
          "m-0 scroll-mt-24 font-black tracking-[-0.03em] [text-wrap:balance]",
          grand ? "text-[29px] leading-[1.1] ordi:text-[40px]" : "text-[25px] leading-[1.12] ordi:text-[30px]",
        )}
      >
        <Compose texte={titre} />
      </h2>
      <p className="m-0 mt-2 text-[15px] font-bold leading-[1.5] text-grey ordi:text-[16px]">{sous}</p>
    </>
  );
}

/** Une date d’article, en lettres (« 3 novembre 2026 »), lisible par les machines (`dateTime`), d’un bloc sur sa ligne. */
export function DateEnLettres({ jour }: { jour: Jour }) {
  return (
    <time dateTime={jour} className="whitespace-nowrap">
      {jourEnLettres(jour, { annee: true })}
    </time>
  );
}

/** Une entrée du sommaire : l’ancre de son intertitre, son texte, et son rang dans la page (le data-section de sa section). */
export type EntreeDuSommaire = { id: string; titre: string; rang: number; numero?: number };

/**
 * « Dans ce guide » : le sommaire d’un guide, ses chiffres en description (« 6 min de lecture · 5 questions »), puis
 * chaque question, à un toucher de son intertitre. Sur un téléphone, juste après la réponse courte, en rangées numérotées
 * de 44 px ; sur un ordinateur, collé à gauche de la colonne de lecture, ses liens à 44 px aussi, et la section qu’on lit
 * s’y allume (une animation liée au défilement, sans script : src/app/globals.css, [data-sommaire]). `titre` : « Dans
 * cette page » sur une page de confiance, qui le montre sur un ordinateur seulement (sans chiffres).
 */
export function DansCeGuide({
  entrees,
  chiffres,
  titre = "Dans ce guide",
  className,
}: {
  entrees: readonly EntreeDuSommaire[];
  chiffres?: string;
  titre?: string;
  className?: string;
}) {
  const id = useId();
  /* Un sommaire sans numéro (celui de /a-propos) n’a pas de place à leur garder : ses entrées s’alignent sur le filet */
  const numerote = entrees.some((e) => e.numero);
  return (
    <nav aria-labelledby={id} className={className}>
      <p id={id} className="m-0 text-[21px] font-black leading-[1.15] tracking-[-0.02em] text-ink ordi:text-legende ordi:tracking-normal ordi:text-grey">
        {titre}
      </p>
      {chiffres && <p className="m-0 mt-1 text-note font-extrabold text-grey ordi:mt-0.5 ordi:text-legende">{chiffres}</p>}
      <ol data-sommaire="" className="m-0 mt-4 list-none border-y border-line p-0 ordi:mt-3 ordi:border-y-0 ordi:border-l">
        {entrees.map((e) => (
          <li key={e.id} className="border-t border-line first:border-t-0 ordi:border-t-0">
            {/* Sur un ordinateur, 44 px de haut aussi : le numéro reste sur la première ligne d’une question qui en prend deux */}
            <a
              href={`#${e.id}`}
              className="group flex min-h-11 items-center gap-3 py-3 text-[15px] font-extrabold leading-[1.35] text-ink no-underline ordi:-ml-px ordi:items-start ordi:gap-2.5 ordi:border-l-2 ordi:border-transparent ordi:py-3 ordi:pl-4 ordi:pr-2 ordi:text-note ordi:text-grey ordi:transition-colors ordi:hover:border-elle ordi:hover:text-ink"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-legende font-black tabular-nums text-ink shadow-thin ordi:size-auto ordi:w-3.5 ordi:justify-start ordi:bg-transparent ordi:text-note ordi:font-extrabold ordi:text-current ordi:opacity-60 ordi:shadow-none",
                  !e.numero && (numerote ? "ordi:invisible" : "ordi:hidden"),
                )}
              >
                {e.numero ?? <Icon name="list" size={13} stroke={2.6} />}
              </span>
              <span className="min-w-0 flex-1">{e.titre}</span>
              <Icon name="chevron" size={16} stroke={2.4} className="shrink-0 text-pale ordi:hidden" />
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Une ligne de fiche (celle d’un article, l’éditeur de /a-propos) : son intitulé à gauche (au-dessus sur un téléphone), sa valeur à droite. */
export function LigneDeFiche({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-sep py-4 first:border-t-0 sm:flex-row sm:gap-6">
      <dt className="shrink-0 text-legende font-black text-grey sm:w-[104px] sm:pt-0.5">{titre}</dt>
      <dd className="m-0 min-w-0 flex-1">{children}</dd>
    </div>
  );
}

/** Le corps du texte : une colonne de lecture d’environ 65 signes, un interligne ample, l’encre adoucie (10:1 sur le papier). */
const TEXTE = "text-[17px] font-semibold leading-[1.7] text-ink/80 ordi:text-[18.5px] ordi:leading-[1.72]";

/** L’attaque : la première phrase de la section, qui répond seule à l’intertitre. Plus grande, en gras doux, à l’encre pleine. */
const ATTAQUE = "mb-2 block text-[19px] font-bold leading-[1.5] tracking-[-0.005em] text-ink ordi:text-[21px]";

/** Un morceau de texte d’une section : un paragraphe, ou une liste à puces. */
export type MorceauDeTexte = { type: "paragraphe"; texte: string } | { type: "liste"; elements: readonly string[] };

/**
 * Un paragraphe ou une liste du corps du texte. `attaque` : le premier paragraphe de sa section, dont la première phrase
 * passe en attaque (le texte reste entier, dans l’ordre).
 */
export function MorceauDuTexte({ morceau, attaque = false }: { morceau: MorceauDeTexte; attaque?: boolean }) {
  if (morceau.type === "liste")
    return (
      <ul className={cn("m-0 mt-5 flex list-none flex-col gap-2 p-0", TEXTE)}>
        {morceau.elements.map((e) => (
          <li key={e} className="flex gap-3">
            <span aria-hidden="true" className={cn("mt-[0.62em] size-[7px] shrink-0 rounded-full", ROSE_VIF)} />
            <span>{e}</span>
          </li>
        ))}
      </ul>
    );
  if (!attaque) return <p className={cn("m-0 mt-5 first:mt-0", TEXTE)}>{morceau.texte}</p>;
  const { attaque: phrase, suite } = attaqueDe(morceau.texte);
  return (
    <p className={cn("m-0 mt-5 first:mt-0", TEXTE)}>
      <span className={ATTAQUE}>{phrase}</span>
      {suite && ` ${suite}`}
    </p>
  );
}

/**
 * Le texte d’une section des pages de confiance (/a-propos, /methode) : ses paragraphes et ses listes, dans l’ordre, la
 * première phrase de son premier paragraphe en attaque, comme dans un guide.
 */
export function TexteDeSection({ morceaux }: { morceaux: readonly MorceauDeTexte[] }) {
  const premier = morceaux.findIndex((m) => m.type === "paragraphe");
  return morceaux.map((m, k) => <MorceauDuTexte key={k} morceau={m} attaque={k === premier} />);
}
