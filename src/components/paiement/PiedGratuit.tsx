"use client";

import { PIED_GRATUIT } from "@/contenu/paiement";
import { useFeuilleDuPaiement } from "@/lib/requetes";
import { Grappe } from "@/components/bulles/perles";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";

/**
 * Le bas de l’aperçu gratuit (le prototype des bulles), après les chapitres fermés : « Lire la suite », son prix, qui
 * ouvre la feuille « Ta formule » (`ouvrirPaiement`), et les bulles offertes avec le rapport, en rose, qui ouvrent « C’est
 * quoi une bulle ? » (`expliquer`). Les avoirs du compte changent le bouton : un rapport d’avance débloque sans payer, le
 * −50 % gardé dit son prix.
 */
export function PiedGratuit({ ouvrirPaiement, expliquer }: { ouvrirPaiement: () => void; expliquer: () => void }) {
  const avoirs = useFeuilleDuPaiement().data;
  return (
    <div className="flex flex-col gap-3">
      <Button arrow onClick={ouvrirPaiement} aria-haspopup="dialog">
        {avoirs?.avance ? PIED_GRATUIT.lireAvance : avoirs?.garde ? PIED_GRATUIT.lireGarde : PIED_GRATUIT.lire}
      </Button>
      <button
        type="button"
        onClick={expliquer}
        aria-haspopup="dialog"
        className="row-hover flex items-center gap-2.5 rounded-2xl bg-[#FFE6F2] px-3.5 py-2.5 text-left shadow-[inset_0_0_0_1px_rgba(232,53,138,0.22)]"
      >
        <Grappe taille={30} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-note font-black text-ink">{PIED_GRATUIT.offertes}</span>
          <span className="text-legende font-extrabold text-soft">{PIED_GRATUIT.regle}</span>
        </span>
        <Icon name="chevron" size={15} stroke={2.8} className="shrink-0 text-elle-ink" />
      </button>
    </div>
  );
}
