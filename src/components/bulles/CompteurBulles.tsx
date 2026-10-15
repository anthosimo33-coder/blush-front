"use client";

import { cn } from "@/lib/cn";
import { COMPTEUR, SEUIL_PEU_DE_BULLES } from "@/contenu/bulles-du-chat";
import type { Account } from "@/types/api";
import { Perle, PerleVide } from "./perles";

/*
 * Le compteur de bulles du chat, à côté du bouton du compte (le prototype validé des bulles, 12 octobre), et de « Ta
 * question », à côté du retour : une perle et le solde. Rose quand il en reste peu, gris à zéro. Un toucher ouvre « C’est
 * quoi une bulle ? », d’où l’on recharge.
 */

/**
 * Le solde que montrent le compteur et les feuilles d’un écran qui fait parler BLUSH (le chat, « Ta question ») : null
 * pour l’équipe (illimitées), ou tant que le compte n’est pas lu.
 */
export const soldeAffiche = (compte: Account | undefined) => (compte && !compte.equipe ? compte.bulles : null);

/**
 * Le compteur : `bulles`, le solde, ou null pour l’équipe (illimitées). Un solde négatif (des bulles reprises après un
 * remboursement, les CGU le disent) se montre tel quel, en gris, comme « Mon compte » le montre : à 0, il cacherait
 * qu’une recharge ne suffit peut-être pas à rouvrir une réponse (SUP14-1). `ouvrir` : la feuille « C’est quoi une bulle ? ».
 */
export function CompteurBulles({ bulles, ouvrir }: { bulles: number | null; ouvrir: () => void }) {
  const solde = bulles;
  const vide = solde !== null && solde <= 0;
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
        vide ? "bg-plaque text-grey" : peu ? "bg-[#FFE6F2] text-elle-ink shadow-[inset_0_0_0_1.5px_rgba(232,53,138,0.35)]" : "bg-white text-ink shadow-soft",
      )}
    >
      {vide ? <PerleVide taille={18} /> : <Perle taille={18} />}
      {solde === null ? COMPTEUR.illimitees : solde < 0 ? `\u2212${-solde}` : solde}
    </button>
  );
}
