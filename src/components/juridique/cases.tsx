"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CaseACocher } from "@/components/ui/controls";
import { CASE_IMPORT, CASE_RENONCIATION, type AchatImmediat } from "@/contenu/consentements";

/*
 * Les cases que la loi demande avant d’avancer (leurs textes : src/contenu/consentements.ts). La case de l’import, sur
 * l’écran de l’export et sur celui des captures ; la case de la renonciation au droit de rétractation, dans la feuille
 * du paiement (la feuille « Ta formule » et la recharge, posées par les écrans des bulles). Chacune a son état (useCase) :
 * le geste qui avance (choisir le fichier, envoyer les captures, payer) demande `exiger()`, qui dit non tant qu’elle n’est
 * pas cochée, le montre et y met le focus.
 */

/** L’état d’une case : cochée ou non, son refus montré (un geste tenté sans elle), et le focus à y mettre. */
export function useCase() {
  const [coche, setCoche] = useState(false);
  const [refus, setRefus] = useState<"manquante" | "perimee" | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  return {
    coche,
    refus,
    ref,
    /** Cochée ou décochée à la main : cochée, son refus s’efface. */
    changer: (v: boolean) => {
      setCoche(v);
      if (v) setRefus(null);
    },
    /** Avant le geste qui avance : vrai si elle est cochée ; sinon, le refus se montre et le focus y va. */
    exiger: () => {
      if (coche) return true;
      setRefus("manquante");
      ref.current?.focus();
      return false;
    },
    /** Le serveur a refusé la case (une version qui n’est plus la sienne) : elle se décoche, et le dit. */
    perimer: () => {
      setCoche(false);
      setRefus("perimee");
    },
  };
}

/** Ce que rend useCase. */
type EtatCase = ReturnType<typeof useCase>;

/**
 * La case de l’import : 18 ans ou plus, les conditions (le lien s’ouvre dans un autre onglet : les captures choisies
 * restent là), et l’accord pour ce que la conv dit d’intime. Le serveur reçoit la version de son texte (CASE_IMPORT).
 */
export function CaseImport({ etat, className }: { etat: EtatCase; className?: string }) {
  return (
    <CaseACocher
      coche={etat.coche}
      onChange={etat.changer}
      refus={!!etat.refus}
      message={etat.refus === "perimee" ? CASE_IMPORT.perimee : CASE_IMPORT.manquante}
      inputRef={etat.ref}
      className={className}
    >
      {CASE_IMPORT.avant}
      <Link href="/conditions" target="_blank" rel="noopener" className="font-black text-ink underline decoration-[rgba(17,17,20,0.25)] underline-offset-2">
        {CASE_IMPORT.lien}
      </Link>
      {CASE_IMPORT.apres}
    </CaseACocher>
  );
}

/**
 * La case de la feuille du paiement : le contenu livré tout de suite, et la renonciation au droit de rétractation (Code
 * de la consommation, L221-28 13°). Sans elle, le bouton ne paie pas : `etat.exiger()` avant de payer. `quoi` : le
 * rapport (« Ta formule »), ou des bulles (la recharge). Le serveur du paiement peut garder sa version (CASE_RENONCIATION).
 */
export function CaseRenonciation({ etat, quoi, className }: { etat: EtatCase; quoi: AchatImmediat; className?: string }) {
  return (
    <CaseACocher coche={etat.coche} onChange={etat.changer} refus={!!etat.refus} message={CASE_RENONCIATION.manquante} inputRef={etat.ref} className={className}>
      {CASE_RENONCIATION.textes[quoi]}
    </CaseACocher>
  );
}
