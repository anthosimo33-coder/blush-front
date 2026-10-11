"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Icon } from "@/components/ui/icons";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { Sheet } from "@/components/ui/surfaces";
import type { Chapter } from "@/types";
import { ancreDuChapitre } from "./ancres";
import { ecritureInachevee, type PhaseDuRapport } from "./phase";
import { brancherBarre } from "./useReprise";

/*
 * Le sommaire du rapport : sur ordinateur, à gauche, il suit la lecture (chapitre en cours surligné, progression sous
 * son titre) ; sur téléphone, une feuille qu’ouvre la barre du haut. Les deux suivent la même règle (etatDeLaLigne) :
 * les chapitres ouverts y mènent, les fermés ouvrent le paiement, ou, l’écriture lancée et pas aboutie, ne mènent nulle
 * part (l’ordinateur y dit où elle en est).
 */

/* Ce qui ne sert que pendant l’écriture est chargé à part, quand il sert */
const BarreEcriture = dynamic(() => import("./Ecriture").then((m) => m.BarreEcriture));
const MarqueChapitre = dynamic(() => import("./Ecriture").then((m) => m.MarqueChapitre));

type EtatDuBadge = "read" | "current" | "open" | "locked";

/** L’état d’un chapitre ouvert, d’après le chapitre à l’écran : en cours, lu (avant lui), ou ouvert. */
const etatDuBadge = (n: number, current: number | null): EtatDuBadge => (n === current ? "current" : current && n < current ? "read" : "open");

/** La barre de progression de lecture : bleu toi → rose elle → vert vérité. Sa valeur est posée par la lecture suivie (useReprise), hors de React. */
export function ReadingBar({ className }: { className?: string }) {
  return (
    <div ref={brancherBarre} role="progressbar" aria-label="Progression de la lecture" aria-valuemin={0} aria-valuemax={100} className={cn("overflow-hidden", className)}>
      <div
        className="h-full origin-left rounded-full transition-transform duration-150 ease-out [transform:scaleX(0)]"
        style={{ background: "var(--degrade-lecture)" }}
      />
    </div>
  );
}

/**
 * Ce qu’une ligne du sommaire fait, d’après la phase du rapport : `ouvert`, elle mène au chapitre ; `paiement`, fermé,
 * elle ouvre le paiement ; `ecriture`, fermé alors que l’accès est là (l’écriture s’écrit, a échoué ou attend le budget
 * du lendemain), elle ne propose pas de payer encore et ne mène nulle part.
 */
export type EtatDeLaLigne = "ouvert" | "paiement" | "ecriture";
export const etatDeLaLigne = (c: Pick<Chapter, "locked">, phase: PhaseDuRapport): EtatDeLaLigne => (!c.locked ? "ouvert" : ecritureInachevee(phase) ? "ecriture" : "paiement");

/** Le numéro d’un chapitre : lu (coche), en cours (encre), ouvert, ou fermé (cadenas à côté). */
function ChapterBadge({ number, state, large }: { number: number; state: EtatDuBadge; large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-black",
        large ? "size-9 text-note" : "h-[26px] min-w-[26px] text-micro",
        state === "current" && "bg-ink text-white",
        state === "read" && "bg-vrai-ink text-white",
        state === "open" && "bg-white text-ink shadow-[inset_0_0_0_1.5px_rgba(17,17,20,0.16)]",
        state === "locked" && "bg-plaque text-grey",
      )}
    >
      {state === "read" ? <Icon name="check" size={large ? 15 : 12} stroke={3.2} className="text-white" /> : number}
    </span>
  );
}

/** Ce que les deux sommaires reçoivent : les chapitres, la phase du rapport, celui à l’écran, y aller, et ouvrir le paiement. */
type ProprietesSommaire = {
  chapters: Chapter[];
  phase: PhaseDuRapport;
  current: number | null;
  allerAuChapitre: (n: number) => void;
  ouvrirPaiement: () => void;
};

/** Ordinateur : le sommaire suit la lecture (chapitre en cours surligné, progression sous le titre). */
export function Sommaire({ chapters, current, allerAuChapitre, ouvrirPaiement, phase }: ProprietesSommaire) {
  /* Le rapport s’écrit : les chapitres à venir ne mènent pas au paiement, ils montrent où en est l’écriture */
  const ecriture = phase.nom === "ecriture" ? phase.ecriture : undefined;
  const enEcriture = (n: number) => ecriture?.chapitres.find((c) => c.number === n);
  return (
    <nav aria-label="Sommaire" className="flex flex-col gap-0.5 rounded-card bg-white p-[18px] shadow-card">
      <div className="text-legende font-black text-grey">Sommaire</div>
      {ecriture ? <BarreEcriture ecriture={ecriture} /> : <ReadingBar className="mb-2 mt-2.5 h-[3px] rounded-full bg-[#ECE9E2]" />}
      <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
        {chapters.map((c) => (
          <li key={c.number}>
            {etatDeLaLigne(c, phase) === "ecriture" ? (
              <div className="flex w-full items-center gap-2.5 py-[7px] text-left">
                <ChapterBadge number={c.number} state="locked" />
                <span className={cn("flex-1 text-note font-black", enEcriture(c.number)?.etat === "attente" || !ecriture ? "text-grey" : "text-ink")}>{enEcriture(c.number)?.title ?? c.tocTitle}</span>
                {phase.nom === "ecriture" && <MarqueChapitre etat={enEcriture(c.number)?.etat ?? "attente"} />}
              </div>
            ) : etatDeLaLigne(c, phase) === "paiement" ? (
              <button type="button" onClick={ouvrirPaiement} className="row-hover flex w-full items-center gap-2.5 py-[7px] text-left">
                <ChapterBadge number={c.number} state="locked" />
                <span className="flex-1 text-note font-black text-grey">{c.tocTitle}</span>
                <Icon name="lock" size={16} className="text-muted" />
                <span className="sr-only">(verrouillé)</span>
              </button>
            ) : (
              <a
                href={`#${ancreDuChapitre(c.number)}`}
                onClick={(e) => {
                  e.preventDefault();
                  allerAuChapitre(c.number);
                }}
                aria-current={c.number === current ? "location" : undefined}
                className={cn("row-hover flex items-center gap-2.5 py-[7px] text-ink no-underline", c.number === current && "before:!bg-plaque before:!opacity-100")}
              >
                <ChapterBadge number={c.number} state={etatDuBadge(c.number, current)} />
                <span className={cn("flex-1 text-note", c.number === current ? "font-black" : "font-extrabold")}>{c.tocTitle}</span>
              </a>
            )}
          </li>
        ))}
      </ol>
      {phase.nom === "complet" && (
        /* Le trait est hors de la ligne cliquable : le voile du survol reste centré sur elle, comme pour les chapitres */
        <div className="mt-2 border-t border-[rgba(17,17,20,0.06)] pt-1.5">
          <Link href="/rapport/question" className="row-hover flex items-center gap-2.5 py-[7px] text-ink no-underline">
            <span className="flex h-[26px] min-w-[26px] items-center justify-center rounded-[13px] bg-[rgba(61,139,255,0.12)]">
              <Icon name="bolt" size={14} color="#2F7BFF" stroke={2.4} />
            </span>
            <span className="flex-1 text-note font-black">Ta question</span>
            <Icon name="chevron" size={15} stroke={2.6} className="text-pale" />
          </Link>
        </div>
      )}
      {/* Le sommaire suit la lecture : l’adresse du site est sur chaque capture du rapport (ordinateur) */}
      <span className="mt-3 flex items-center gap-1.5 border-t border-[rgba(17,17,20,0.06)] pt-3 text-micro font-black text-grey">
        <BubbleLogo size={15} />
        askblush.com
      </span>
    </nav>
  );
}

/**
 * Téléphone : le sommaire en feuille, chaque chapitre ouvert à un toucher ; les fermés ouvrent le paiement, sauf
 * l’écriture lancée et pas aboutie (etatDeLaLigne). « Poser ma question à BLUSH » en bas, une fois le rapport écrit.
 */
export function FeuilleSommaire({ open, onClose, chapters, current, allerAuChapitre, ouvrirPaiement, phase }: ProprietesSommaire & { open: boolean; onClose: () => void }) {
  const idTitre = useId();
  return (
    <Sheet open={open} onClose={onClose} labelledBy={idTitre}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={idTitre} className="m-0 text-titre-3 font-black leading-[1.1] tracking-[-0.02em]">
            Sommaire
          </h2>
          <span className="text-legende font-extrabold text-grey">{current ? `Chapitre ${current} sur ${chapters.length}` : `${chapters.length} chapitres`}</span>
        </div>
        <button type="button" aria-label="Fermer" onClick={onClose} className="lift lift-sm flex size-10 shrink-0 items-center justify-center rounded-full bg-white shadow-soft">
          <Icon name="close" size={16} stroke={2.8} className="text-ink" />
        </button>
      </div>
      <ReadingBar className="h-1 rounded-full bg-line" />
      <InsetGroup>
        {chapters.map((c) =>
          c.locked ? (
            <InsetRow
              key={c.number}
              leading={<ChapterBadge number={c.number} state="locked" large />}
              title={
                <span className="text-grey">
                  {c.tocTitle}
                  <span className="sr-only"> (verrouillé)</span>
                </span>
              }
              trailing={<Icon name="lock" size={16} className="text-muted" />}
              /* Fermé pendant l’écriture (ou après un échec, ou le budget du jour atteint) : l’accès est là, pas de paiement */
              onClick={
                etatDeLaLigne(c, phase) === "paiement"
                  ? () => {
                      onClose();
                      ouvrirPaiement();
                    }
                  : undefined
              }
            />
          ) : (
            <InsetRow
              key={c.number}
              leading={<ChapterBadge number={c.number} state={etatDuBadge(c.number, current)} large />}
              title={c.tocTitle}
              sub={c.number === current ? "En cours" : undefined}
              onClick={() => allerAuChapitre(c.number)}
            />
          ),
        )}
      </InsetGroup>
      {/* Comme la suite du rapport (Suite.tsx) : pas pendant l’écriture, ni après un échec */}
      {phase.nom === "complet" && (
        <InsetGroup>
          <InsetRow leading={<RowIcon icon="bolt" tone="toi" />} title="Poser ma question à BLUSH" href="/rapport/question" chevron />
        </InsetGroup>
      )}
    </Sheet>
  );
}
