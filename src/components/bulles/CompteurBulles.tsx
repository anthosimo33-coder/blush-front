"use client";

import { cn } from "@/lib/cn";
import { COMPTEUR, SEUIL_PEU_DE_BULLES } from "@/contenu/bulles-du-chat";
import { Perle, PerleVide } from "./perles";

/*
 * Le compteur de bulles du chat, à côté du bouton du compte (le prototype validé des bulles, 12 octobre) : une perle et
 * le solde. Rose quand il en reste peu, gris à zéro. Un toucher ouvre « C’est quoi une bulle ? », d’où l’on recharge.
 */

/**
 * Le compteur : `bulles`, le solde (un solde négatif, après un remboursement, se montre à 0), ou null pour l’équipe
 * (illimitées). `ouvrir` : la feuille « C’est quoi une bulle ? ».
 */
export function CompteurBulles({ bulles, ouvrir }: { bulles: number | null; ouvrir: () => void }) {
  const solde = bulles === null ? null : Math.max(0, bulles);
  const peu = solde !== null && solde > 0 && solde <= SEUIL_PEU_DE_BULLES;
  return (
    <button
      type="button"
      onClick={ouvrir}
      aria-haspopup="dialog"
      aria-label={solde === null ? COMPTEUR.nomIllimitees : COMPTEUR.nom(solde)}
      data-bulles={solde ?? "illimitees"}
      className={cn(
        "lift lift-sm lift-card inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full pl-2 pr-3 text-detail font-black tabular-nums",
        solde === 0 ? "bg-plaque text-grey" : peu ? "bg-[#FFE6F2] text-elle-ink shadow-[inset_0_0_0_1.5px_rgba(232,53,138,0.35)]" : "bg-white text-ink shadow-soft",
      )}
    >
      {solde === 0 ? <PerleVide taille={18} /> : <Perle taille={18} />}
      {solde ?? COMPTEUR.illimitees}
    </button>
  );
}
