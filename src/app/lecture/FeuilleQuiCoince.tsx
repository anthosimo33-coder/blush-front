"use client";

import { useState } from "react";
import { QUI_COINCE, type EtatQuiCoince } from "@/contenu/mesures";
import { enEuros } from "@/contenu/offres";
import { MentionRenonciation } from "@/components/juridique/cases";
import { usePaiement } from "@/components/paiement/usePaiement";
import { Button } from "@/components/ui/Button";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { NotePrivee } from "@/components/ui/NotePrivee";
import { Sheet } from "@/components/ui/surfaces";
import type { OffreId } from "@/types";

/*
 * Proposition du 26 octobre (src/contenu/mesures.ts) : « Qu’est-ce qui coince ? » en un toucher, dans une feuille comme
 * les autres (« Ajoute un morceau »), et la suite de chaque réponse dans la même feuille :
 * - « C’est trop cher » : l’offre ① (le paywall la demande au serveur, OffreAvantDePartir prend la place de la feuille) ;
 *   sans elle (déjà montrée à ce compte, un lot de la roue) et Premium choisie, le rapport seul ; sinon, un merci ;
 * - « J’ai pas confiance » : ce que les questions du paywall et la page de confidentialité promettent déjà, puis retour
 *   au paiement ;
 * - « Pas maintenant » : rien à vendre, la conv attend ;
 * - « Ça a bugué » : la page de Whop, le chemin de secours du paiement (SurLaPageDeWhop), au même prix.
 * Rien n’est encore envoyé au serveur.
 */

/** Ce que le paywall fait de « C’est trop cher » : l’offre ① montrée, le rapport seul à proposer, ou juste merci. */
export type SuiteTropCher = "offre" | "rapport" | "merci";

/** La feuille « Qu’est-ce qui coince ? » et la suite de chaque réponse. Voir l’en-tête du fichier. */
export function FeuilleQuiCoince({
  open,
  onClose,
  onMerci,
  onTropCher,
  onRapportSeul,
  onRetour,
  offre,
  centimes,
  rapport,
  autre,
  relire,
  etatDAbord = "question",
}: {
  open: boolean;
  onClose: () => void;
  onMerci: () => void;
  /** « C’est trop cher » : le paywall demande l’offre ① et dit ce qu’il en fait. */
  onTropCher: () => Promise<SuiteTropCher>;
  /** « Passer au rapport » : le paywall choisit le rapport, la feuille se ferme sur le bouton qui paie. */
  onRapportSeul: () => void;
  /** Retour au paiement : la feuille se ferme, le bouton qui paie revient à l’écran. */
  onRetour: () => void;
  offre: OffreId;
  centimes: number;
  /** Le prix du rapport seul (au lot de la roue près), pour « Prends le rapport seul ». */
  rapport: { centimes: number; bulles: number };
  autre: string;
  relire: () => void;
  /** L’aperçu de l’équipe : la feuille ouverte d’avance sur une suite. */
  etatDAbord?: EtatQuiCoince;
}) {
  const [etat, setEtat] = useState<EtatQuiCoince>(etatDAbord);
  const [attente, setAttente] = useState(false);
  const paiement = usePaiement({ suite: "/lecture", quand: { deja: relire } });
  const choisir = async (id: (typeof QUI_COINCE.raisons)[number]["id"]) => {
    if (id === "bug") return setEtat("bug");
    if (id === "confiance") return setEtat("confiance");
    if (id === "plus_tard") return setEtat("plusTard");
    setAttente(true);
    const suite = await onTropCher();
    setAttente(false);
    if (suite === "rapport") setEtat("cher");
    else if (suite === "merci") onMerci();
  };
  const titre = { question: QUI_COINCE.titre, cher: QUI_COINCE.cher.titre, confiance: QUI_COINCE.confiance.titre, plusTard: QUI_COINCE.plusTard.titre, bug: QUI_COINCE.bug.titre }[
    etat
  ];
  return (
    <Sheet open={open} onClose={onClose} onClosed={() => setEtat("question")} title={titre} titleSize={26} titleClose>
      {etat === "question" && (
        <>
          <p className="m-0 text-detail font-bold leading-[1.4] text-soft">{QUI_COINCE.sous}</p>
          <InsetGroup>
            {QUI_COINCE.raisons.map((r) => (
              <InsetRow key={r.id} title={r.texte} onClick={() => void choisir(r.id)} disabled={attente} chevron />
            ))}
          </InsetGroup>
          <Button variant="link" onClick={onClose}>
            {QUI_COINCE.passer}
          </Button>
        </>
      )}

      {etat === "cher" && (
        <>
          <p className="m-0 text-detail font-bold leading-[1.4] text-soft">{QUI_COINCE.cher.sous(enEuros(rapport.centimes), rapport.bulles)}</p>
          <div className="flex flex-col gap-1">
            <Button arrow onClick={onRapportSeul}>
              {QUI_COINCE.cher.passer(enEuros(rapport.centimes))}
            </Button>
            <Button variant="link" onClick={onClose}>
              {QUI_COINCE.cher.plusTard}
            </Button>
          </div>
        </>
      )}

      {etat === "confiance" && (
        <>
          <InsetGroup>
            {QUI_COINCE.confiance.lignes(autre).map((l) => (
              <InsetRow key={l.titre} leading={<RowIcon icon={l.icone} tone="vrai" />} title={l.titre} sub={l.sous} />
            ))}
          </InsetGroup>
          {QUI_COINCE.confiance.avis && (
            <NotePrivee icone="shield" className="px-1">
              {QUI_COINCE.confiance.avis}
            </NotePrivee>
          )}
          <div className="flex flex-col gap-1">
            <Button arrow onClick={onRetour}>
              {QUI_COINCE.confiance.retour}
            </Button>
            <Button variant="link" onClick={onClose}>
              {QUI_COINCE.confiance.plusTard}
            </Button>
          </div>
        </>
      )}

      {etat === "plusTard" && (
        <>
          <p className="m-0 text-detail font-bold leading-[1.4] text-soft">{QUI_COINCE.plusTard.sous}</p>
          <div className="flex flex-col gap-1">
            <Button variant="secondary" onClick={onClose}>
              {QUI_COINCE.plusTard.ok}
            </Button>
            <Button variant="link" onClick={onRetour}>
              {QUI_COINCE.plusTard.enFait}
            </Button>
          </div>
        </>
      )}

      {etat === "bug" && (
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
      )}
    </Sheet>
  );
}
