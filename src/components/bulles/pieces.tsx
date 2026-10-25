"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icons";
import { CEST_QUOI, PIECES } from "@/contenu/bulles";
import { recu } from "@/contenu/bulles-du-chat";
import { Perle } from "./perles";

/*
 * Les pièces communes des écrans des bulles (la feuille « Ta formule », la recharge, l’offre ①, « C’est débloqué », le
 * chat, « Ta question ») : une option à cocher, ce qu’elle contient, la ligne de ce qui est offert, les pastilles, la
 * carte au-dessus du champ et son petit bouton, « C’est quoi une bulle ? » en une ligne, et le reçu sous une réponse de
 * BLUSH. Le dessin et les textes sont ceux du prototype validé des bulles (12 octobre) ; les textes vivent dans
 * src/contenu/bulles.ts (et ceux du chat dans src/contenu/bulles-du-chat.ts).
 */

/** Le rose pâle de ce qui est offert, et son filet : les lignes offertes, les pastilles roses, la carte qui appelle à agir. */
const ROSE = "bg-[#FFE6F2] shadow-[inset_0_0_0_1px_rgba(232,53,138,0.22)]";

/** Le rond à cocher d’une option, comme ceux du paiement de l’appli : plein d’encre, un point blanc au centre, une fois choisie. */
export function RondACocher({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex size-6 shrink-0 items-center justify-center rounded-full transition-colors", on ? "bg-ink" : "bg-white shadow-[inset_0_0_0_2px_#D6D2C8]")}
    >
      {on && <span className="size-2 rounded-full bg-white" />}
    </span>
  );
}

/**
 * Une option d’une feuille (une formule, un pack), à poser dans un RadioGroup (src/components/ui/controls.tsx), qui la
 * mène aux flèches : un rond à cocher, son titre et sa note, le prix à droite (le prix barré dessous), et son contenu
 * (`children`) ouvert une fois choisie. `badge` se pose sur le bord haut de la carte (« Conseillé »), comme sur une
 * fiche produit ; `tag` suit le titre (« +10 offertes »).
 */
export function Option({
  on,
  choisir,
  titre,
  tag,
  badge,
  note,
  prix,
  barre,
  children,
}: {
  on: boolean;
  choisir: () => void;
  titre: ReactNode;
  tag?: ReactNode;
  badge?: ReactNode;
  note: ReactNode;
  prix: string;
  barre?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={choisir}
      /* Sous 400 px de large, la ligne se resserre (les marges, les écarts, le prix) : « 60 bulles » et « 34,90 € » tiennent sur une ligne, même avec les textes plus larges de Chrome sous Linux */
      className={cn("lift relative flex flex-col gap-2.5 rounded-[20px] bg-white px-4 py-3.5 text-left text-ink max-[399px]:px-3", on ? "shadow-selected" : "shadow-soft")}
    >
      {badge && <span className="absolute -top-[13px] right-4">{badge}</span>}
      <span className="flex w-full items-center gap-3.5 max-[399px]:gap-2.5">
        <RondACocher on={on} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-corps font-black leading-[1.25]">{titre}</span>
            {tag}
          </span>
          <span className="text-legende font-extrabold leading-[1.4]">{note}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="text-[21px] font-black leading-none tracking-[-0.01em] max-[399px]:text-[18px]">{prix}</span>
          {barre && <s className="mt-1 text-micro font-extrabold text-grey">{barre}</s>}
        </span>
      </span>
      {on && children && <span className="flex w-full flex-col gap-1.5 pl-[38px] max-[399px]:pl-[34px]">{children}</span>}
    </button>
  );
}

/** Une ligne de ce que contient une formule : une coche verte (ou une perle, `perle`) et son texte. */
export function Contenu({ children, perle = false }: { children: ReactNode; perle?: boolean }) {
  return (
    <span className="flex items-center gap-2 text-detail font-extrabold leading-[1.35] text-ink">
      {perle ? <Perle taille={16} /> : <Icon name="check" size={16} stroke={3} className="text-vrai-ink" />}
      <span>{children}</span>
    </span>
  );
}

/** La ligne « + N bulles offertes · 0 € », en rose : l’offert se voit comme un article de la commande. `libelle` : « offertes » par défaut. */
export function LigneOfferte({ bulles, libelle = PIECES.offertes }: { bulles: number; libelle?: string }) {
  return (
    <span className={cn("flex items-center gap-2 rounded-2xl py-2 pl-2.5 pr-2", ROSE)}>
      <Perle taille={18} />
      <span className="flex-1 text-detail font-black text-ink">
        + {bulles} bulles <span className="text-elle-ink">{libelle}</span>
      </span>
      <span className="rounded-lg bg-elle-ink px-2 py-0.5 text-legende font-black text-white">{PIECES.gratuit}</span>
    </span>
  );
}

/** Une pastille de ce que contient une offre (« 7 chapitres », « Ton vocal ») : blanche, ou rose (`rose`) pour ce qui est offert. */
export function Pastille({ children, rose = false }: { children: ReactNode; rose?: boolean }) {
  return (
    <span className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-legende font-black", rose ? cn(ROSE, "text-elle-ink") : "bg-white text-ink shadow-soft")}>
      {children}
    </span>
  );
}

/** Une carte au-dessus du champ du chat, comme « Tu creuses » : blanche, bordée. `rose` : elle appelle à agir (plus que N bulles, une réponse prête). */
export function Carte({ rose = false, children }: { rose?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl bg-white py-2.5 pl-3 pr-2.5",
        rose ? "shadow-[inset_0_0_0_1.5px_rgba(232,53,138,0.35),0_10px_24px_-16px_rgba(200,29,107,0.5)]" : "shadow-[inset_0_0_0_1px_rgba(17,17,20,0.08)]",
      )}
    >
      {children}
    </div>
  );
}

/** Le petit bouton encre d’une carte (comme « Copier ») : « Recharger », « La lire ». */
export function PetitBouton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="lift lift-sm lift-ink inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[17px] bg-ink px-3.5 text-legende font-black text-white"
    >
      {children}
    </button>
  );
}

/** « C’est quoi une bulle ? », en une ligne : la règle, et un toucher (`ouvrir`) qui ouvre sa feuille (FeuilleBulle). */
export function CestQuoiUneBulle({ ouvrir }: { ouvrir: () => void }) {
  return (
    <button
      type="button"
      onClick={ouvrir}
      aria-label={CEST_QUOI.nom}
      aria-haspopup="dialog"
      className="row-hover flex items-center gap-2 rounded-2xl bg-plaque px-3.5 py-2.5 text-left"
    >
      <Perle taille={18} />
      <span className="flex-1 text-note font-black text-ink">{CEST_QUOI.texte}</span>
      <Icon name="chevron" size={14} stroke={2.8} className="shrink-0 text-toi-ink" />
    </button>
  );
}

/**
 * Le reçu sous une réponse de BLUSH (le chat, « Ta question ») : une petite perle et « 1 bulle · il t’en reste 9 », ce
 * que la réponse a coûté et ce qu’il reste, dits par le serveur avec elle. En petit gris, comme l’heure à côté de laquelle
 * le chat le pose.
 */
export function RecuDeLaReponse({ depensees, restantes }: { depensees: number; restantes: number }) {
  return (
    <span data-recu="" className="inline-flex items-center gap-1 text-[11px] font-bold leading-[14px] text-grey">
      <Perle taille={11} />
      {recu(depensees, restantes)}
    </span>
  );
}
