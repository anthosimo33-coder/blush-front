"use client";

import type { CSSProperties, ReactNode } from "react";
import { OFFRE_SECOND } from "@/contenu/paiement";
import { cn } from "@/lib/cn";
import { delai } from "@/lib/motion";
import { Perle } from "@/components/bulles/perles";
import { Icon } from "@/components/ui/icons";

/*
 * Le billet du 2e rapport (l’offre ⑤, sur « C’est débloqué ») : un ticket détachable, ce que le rapport contient à gauche,
 * le prix sur sa souche à droite, séparés par un pointillé et ses deux encoches. Pris, un tampon « À toi » s’y pose. Son
 * petit frère (PetitBillet) dit le rapport d’avance dans une liste et dans « Ta formule ».
 */

/** Le petit billet rose, pour une ligne (« 1 rapport d’avance ») : pour l’œil, le texte à côté le dit. */
export function PetitBillet({ taille = 20 }: { taille?: number }) {
  return (
    <svg aria-hidden="true" width={taille} height={taille} viewBox="0 0 24 24" fill="none" className="shrink-0 text-elle">
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5V9a3 3 0 0 0 0 6v1.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5V15a3 3 0 0 0 0-6V7.5Z" fill="currentColor" />
      <path d="M15 6.5v11" stroke="white" strokeWidth="1.6" strokeDasharray="1.6 1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Le tampon « À toi », penché, posé d’un coup sur le billet. */
const TAMPON = { ...delai(0.05), "--r": "-12deg" } satisfies CSSProperties;

/**
 * Le billet. `souche` : ce qu’il y a sur sa souche (le prix, par défaut ; « jusqu’au … » pour le −50 % gardé).
 * `tamponne` : le 2e rapport est pris, le tampon se pose. Pour l’œil : le titre et le texte de l’offre le disent.
 */
export function Billet({ souche, tamponne = false, className }: { souche?: ReactNode; tamponne?: boolean; className?: string }) {
  const b = OFFRE_SECOND.billet;
  return (
    <span className={cn("relative flex rounded-[18px] bg-[linear-gradient(135deg,#FFF2F8,#F6EFFF)] shadow-[inset_0_0_0_1px_rgba(232,53,138,0.2)]", className)}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-2.5 pl-3.5 pr-3">
        <span className="text-detail font-black leading-[1.2]">{b.titre}</span>
        <span className="text-legende font-extrabold leading-[1.25] text-soft">{b.sous}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-micro font-black leading-[1.3] text-ink">
          {b.contenu.map((c, i) => (
            <span key={c} className="flex items-center gap-1">
              {i === b.contenu.length - 1 ? <Perle taille={12} /> : <Icon name="check" size={12} stroke={3.2} className="text-vrai-ink" />}
              {c}
            </span>
          ))}
        </span>
      </span>
      {/* Le pointillé de la souche, et ses deux encoches, du blanc de la carte autour */}
      <span aria-hidden="true" className="relative my-2.5 w-0 border-l-2 border-dashed border-[rgba(232,53,138,0.35)]">
        <span className="absolute -left-[10px] -top-[19px] size-[18px] rounded-full bg-white shadow-[inset_0_-1px_0_rgba(232,53,138,0.2)]" />
        <span className="absolute -bottom-[19px] -left-[10px] size-[18px] rounded-full bg-white shadow-[inset_0_1px_0_rgba(232,53,138,0.2)]" />
      </span>
      <span className="flex w-[84px] shrink-0 flex-col items-center justify-center gap-0.5 px-2 text-center">
        {souche ?? (
          <>
            <span className="rounded-[7px] bg-elle-ink px-1.5 py-0.5 text-micro font-black text-white">{OFFRE_SECOND.remise}</span>
            <span className="mt-0.5 text-[21px] font-black leading-none tracking-[-0.02em]">{b.prix}</span>
            <s className="text-micro font-extrabold text-grey">
              <span className="sr-only">au lieu de </span>
              {b.barre}
            </s>
          </>
        )}
      </span>
      {tamponne && (
        <span
          data-popin=""
          aria-hidden="true"
          style={TAMPON}
          className="absolute right-[58px] top-1/2 -mt-[19px] rounded-[10px] bg-white/70 px-3 py-1 text-[22px] font-black uppercase leading-none tracking-[0.04em] text-elle-ink shadow-[inset_0_0_0_3px_var(--color-elle-ink)] backdrop-blur-[1px]"
        >
          {b.tampon}
        </span>
      )}
    </span>
  );
}
