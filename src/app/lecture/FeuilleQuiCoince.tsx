"use client";

import { useState } from "react";
import { QUI_COINCE } from "@/contenu/mesures";
import { enEuros } from "@/contenu/offres";
import { MentionRenonciation } from "@/components/juridique/cases";
import { usePaiement } from "@/components/paiement/usePaiement";
import { Button } from "@/components/ui/Button";
import { InsetGroup, InsetRow } from "@/components/ui/inset";
import { Sheet } from "@/components/ui/surfaces";
import type { OffreId } from "@/types";

/*
 * Proposition du 26 octobre (src/contenu/mesures.ts) : la carte du paywall refermée sans payer, une fois par visite,
 * « Qu’est-ce qui coince ? » en un toucher, dans une feuille comme les autres (« Ajoute un morceau »). « Ça a bugué » ne
 * s’arrête pas à un merci : la même feuille propose la page de Whop, le chemin de secours du paiement (SurLaPageDeWhop),
 * au même prix. Rien n’est encore envoyé au serveur.
 */

/** La feuille « Qu’est-ce qui coince ? » ; `onMerci` : une réponse donnée (hors « Ça a bugué »), le paywall dit merci. */
export function FeuilleQuiCoince({
  open,
  onClose,
  onMerci,
  offre,
  centimes,
  relire,
  bugDAbord = false,
}: {
  open: boolean;
  onClose: () => void;
  onMerci: () => void;
  offre: OffreId;
  centimes: number;
  relire: () => void;
  /** L’aperçu de l’équipe : la feuille ouverte d’avance sur « Ça a bugué ». */
  bugDAbord?: boolean;
}) {
  const [bug, setBug] = useState(bugDAbord);
  const paiement = usePaiement({ suite: "/lecture", quand: { deja: relire } });
  const choisir = (id: (typeof QUI_COINCE.raisons)[number]["id"]) => {
    if (id === "bug") return setBug(true);
    onMerci();
  };
  return (
    <Sheet open={open} onClose={onClose} onClosed={() => setBug(false)} title={bug ? QUI_COINCE.bug.titre : QUI_COINCE.titre} titleSize={26} titleClose>
      {bug ? (
        <>
          <p className="m-0 text-detail font-bold leading-[1.4] text-soft">{QUI_COINCE.bug.sous}</p>
          <div className="flex flex-col gap-1">
            <Button arrow loading={paiement.occupe} loadingLabel="Paiement en cours" onClick={() => void paiement.payer(offre)}>
              {QUI_COINCE.bug.payer(enEuros(centimes))}
            </Button>
            <MentionRenonciation quoi="rapport" etat={paiement.renonciation} />
            <Button variant="link" disabled={paiement.occupe} onClick={onClose}>
              {QUI_COINCE.bug.plusTard}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 text-detail font-bold leading-[1.4] text-soft">{QUI_COINCE.sous}</p>
          <InsetGroup>
            {QUI_COINCE.raisons.map((r) => (
              <InsetRow key={r.id} title={r.texte} onClick={() => choisir(r.id)} chevron />
            ))}
          </InsetGroup>
          <Button variant="link" onClick={onClose}>
            {QUI_COINCE.passer}
          </Button>
        </>
      )}
    </Sheet>
  );
}
