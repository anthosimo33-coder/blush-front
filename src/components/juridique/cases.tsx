"use client";

import Link from "next/link";
import { useRef, useState, type Ref } from "react";
import { cn } from "@/lib/cn";
import { CASE_IMPORT, CASE_RENONCIATION, type AchatImmediat } from "@/contenu/consentements";

/*
 * Les accords que la loi demande avant d’avancer (leurs textes : src/contenu/consentements.ts), sans case à cocher : une
 * ligne les dit près du bouton, et le geste du bouton les donne. L’accord de l’import, juste au-dessus du bouton de
 * l’écran de l’export et de celui des captures (choisir le fichier, « Continuer ») ; la renonciation au délai de
 * rétractation, juste sous le bouton qui paie (la feuille « Ta formule », l’offre ①, l’offre ③, la recharge). Chacun a
 * son état (useAccord) : refusé par le serveur (`perimer()` : son texte a changé depuis l’ouverture de la page), plus
 * rien ne part jusqu’au rechargement de la page, l’onglet renverrait la version déjà refusée.
 */

/**
 * L’état d’un accord : rien à cocher, le geste du bouton le donne. Seul le refus du serveur le change (`perimer()`) ;
 * ensuite, `exiger()` dit non et met le focus sur le bouton qui recharge la page.
 */
export function useAccord() {
  const [perimee, setPerimee] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return {
    perimee,
    ref,
    /** Avant le geste qui avance : vrai, sauf une fois l’accord périmé (le focus va alors au bouton qui recharge la page). */
    exiger: () => {
      if (!perimee) return true;
      ref.current?.focus();
      return false;
    },
    /** Le serveur a refusé la version de l’accord : plus rien ne part, la page est à recharger. */
    perimer: () => setPerimee(true),
  };
}

/** Ce que rend useAccord. */
type EtatAccord = ReturnType<typeof useAccord>;

/** Le lien d’une ligne d’accord, vers les conditions (dans un autre onglet : rien de ce qu’on a choisi n’est perdu). */
const LIEN = "font-black text-ink underline decoration-[rgba(17,17,20,0.25)] underline-offset-2";

/**
 * La ligne de l’accord de l’import, juste au-dessus du bouton : en continuant, on accepte les conditions et que BLUSH
 * lise toute la conv. Le serveur reçoit la version de son texte (CASE_IMPORT) avec l’import. Refusée par le serveur,
 * elle laisse place au message qui fait recharger la page. Sur le fond de la page : posée dans le pied d’écran, dont le
 * haut est un dégradé, le texte de la page passerait derrière.
 */
export function MentionImport({ etat, className }: { etat: EtatAccord; className?: string }) {
  if (etat.perimee) return <Perimee etat={etat} className={cn("rounded-[12px] bg-paper px-1 text-center lg:bg-transparent", className)} />;
  return (
    <p className={cn("m-0 rounded-[12px] bg-paper px-1 text-center text-legende font-extrabold leading-[1.45] text-grey lg:bg-transparent", className)}>
      {CASE_IMPORT.avant}
      <Link href="/conditions" target="_blank" rel="noopener" className={LIEN}>
        {CASE_IMPORT.lien}
      </Link>
      {CASE_IMPORT.apres}
    </p>
  );
}

/**
 * La ligne de la renonciation, discrète, juste sous le bouton qui paie : en payant, on a son rapport (ou ses bulles)
 * tout de suite et on renonce au délai de rétractation (Code de la consommation, L221-28 13°), le lien menant à la
 * section des conditions qui l’explique. Le serveur du paiement garde sa version avec l’achat (CASE_RENONCIATION) ; il
 * refuse une version qui n’est plus la sienne, et la ligne laisse place au message qui fait recharger la page.
 */
export function MentionRenonciation({ etat, quoi, className }: { etat: EtatAccord; quoi: AchatImmediat; className?: string }) {
  if (etat.perimee) return <Perimee etat={etat} className={cn("text-center", className)} />;
  return (
    <p className={cn("m-0 text-center text-micro font-extrabold leading-[1.45] text-grey", className)}>
      {CASE_RENONCIATION.avant[quoi]}
      <Link href={CASE_RENONCIATION.ancre} target="_blank" rel="noopener" className={LIEN}>
        {CASE_RENONCIATION.lien}
      </Link>
      {CASE_RENONCIATION.apres}
    </p>
  );
}

/**
 * Le message d’un accord refusé par le serveur : la page est à recharger, par un bouton (l’appli posée sur l’écran
 * d’accueil n’a pas celui du navigateur), où va le focus quand on retente le geste.
 */
function Perimee({ etat, className }: { etat: EtatAccord; className?: string }) {
  return (
    <p role="alert" className={cn("m-0 text-legende font-black leading-[1.45] text-danger", className)}>
      {CASE_IMPORT.perimee} <Bouton boutonRef={etat.ref} />
    </p>
  );
}

/** Le bouton qui recharge la page. */
function Bouton({ boutonRef }: { boutonRef: Ref<HTMLButtonElement> }) {
  return (
    <button ref={boutonRef} type="button" onClick={() => window.location.reload()} className="font-black text-danger underline underline-offset-2">
      {CASE_IMPORT.recharger}
    </button>
  );
}
