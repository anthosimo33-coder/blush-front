"use client";

import { Icon } from "@/components/ui/icons";

/*
 * Ce que les feuilles de partage ont en commun : leur titre avec sa croix (EnTete), et le papier qui attend l’image
 * (PAPIER). Le partage du verdict et la confidentialité (src/app/rapport/Partage.tsx), « Partager en image »
 * (./PartageImageSheet.tsx).
 */

/** Le fond de la carte (le papier de la landing), le temps que l’image arrive. */
export const PAPIER = "radial-gradient(70% 55% at 50% 0%, #FFFFFF 0%, rgba(255,255,255,0) 70%), #F4F2ED";

/** Le titre d’une feuille de partage (`id`, pour son aria-labelledby), et sa croix. */
export function EnTete({ id, titre, onClose }: { id: string; titre: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="m-0 text-[24px] font-black leading-[1.1] tracking-[-0.02em]">
        {titre}
      </h2>
      <button type="button" aria-label="Fermer" onClick={onClose} className="lift lift-sm flex size-10 shrink-0 items-center justify-center rounded-full bg-white shadow-soft">
        <Icon name="close" size={16} color="#121214" stroke={2.8} />
      </button>
    </div>
  );
}
