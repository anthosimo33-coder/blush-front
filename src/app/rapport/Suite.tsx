"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { setQueryData } from "@/lib/query";
import { messageErreur, SOUFFLE } from "@/lib/messages-erreur";
import { relancerRapport } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/cards";
import { TypingDots } from "@/components/ui/feedback";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { LockRow } from "@/components/ui/progress";
import { ChapterRule } from "@/components/ui/report";
import type { Chapter, Echec, Plan } from "@/types";
import { SUITE_ECRITURE } from "./ancres";
import type { PhaseDuRapport } from "./phase";

/*
 * Après les chapitres ouverts, la suite du rapport, selon sa phase : les chapitres fermés qui mènent au paiement
 * (l’aperçu), ceux qui s’écrivent, l’écriture en échec ou en pause, puis, le rapport écrit, « Ta question ».
 */

/* Ce qui ne sert que pendant l’écriture est chargé à part, quand il sert */
const LigneEcriture = dynamic(() => import("./Ecriture").then((m) => m.LigneEcriture));

/** Ce que dit l’écriture en échec, selon pourquoi. */
const TEXTES_ECHEC: Record<Echec, string> = {
  refus: "BLUSH ne peut pas écrire la suite à partir de cette conv. Ton verdict, lui, reste juste.",
  souffle: `${SOUFFLE} Ta conv est toujours là\u00a0: l’écriture reprendra quand tu reviendras.`,
  panne: "BLUSH a buté en l’écrivant. Ta conv est toujours là\u00a0: relance, et tout repart de zéro.",
};

/**
 * L’écriture a échoué pour de bon : on le dit, au lieu d’une attente sans fin. Une panne se relance (de zéro, quelques
 * fois par jour) ; un refus du modèle reviendrait à chaque essai, il n’y a rien à relancer ; le budget de l’IA du jour
 * atteint (« souffle ») non plus : l’écriture repart d’elle-même après minuit, quand on rouvre le rapport. `sobre` :
 * le rapport doux du mode sobre (AttenteSobre), tout entier à écrire, pas une suite.
 */
export function EchecEcriture({ raison, sobre = false }: { raison: Echec; sobre?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);
  const relancer = async () => {
    setBusy(true);
    setSouci(null);
    try {
      setQueryData("report", await relancerRapport());
    } catch (e) {
      setSouci(messageErreur("relance", e));
    }
    setBusy(false);
  };
  return (
    <Card className="flex flex-col gap-2 p-[18px]">
      <div role="alert" className="text-accent font-black leading-[1.3]">
        {sobre ? "Ton rapport n’a pas pu s’écrire." : "La suite de ton rapport n’a pas pu s’écrire."}
      </div>
      <p className="m-0 text-detail font-extrabold leading-[1.45] text-soft">{TEXTES_ECHEC[raison]}</p>
      {souci && <p className="m-0 text-note font-extrabold leading-[1.4] text-ink">{souci}</p>}
      {raison === "panne" && (
        <Button className="mt-1" onClick={() => void relancer()} disabled={busy} loading={busy} loadingLabel="Relance de l’écriture">
          Relancer l’écriture
        </Button>
      )}
    </Card>
  );
}

/** Pendant que BLUSH écrit le rapport (2 à 3 minutes), avant de savoir où il en est : une pastille en bas de l’écran. Texte relu le 8 octobre */
export function Writing() {
  return (
    <div role="status" className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <span className="flex items-center gap-2.5 rounded-full bg-ink px-4 py-2.5 text-note font-extrabold text-white shadow-card">
        <TypingDots color="currentColor" label="BLUSH écrit ton rapport" />
        BLUSH écrit ton rapport, 2 à 3 minutes
      </span>
    </div>
  );
}

/**
 * La suite du rapport, après ses chapitres ouverts. `fermes` : les chapitres encore fermés ; `access` : le plan du compte
 * (« Une question incluse avec ton rapport », sans BLUSH+) ; `ouvrirPaiement` : un chapitre fermé touché, dans l’aperçu.
 */
export function Suite({ phase, fermes, access, ouvrirPaiement }: { phase: PhaseDuRapport; fermes: Chapter[]; access: Plan; ouvrirPaiement: () => void }) {
  const ecriture = phase.nom === "ecriture" ? phase.ecriture : undefined;
  const enEcriture = (n: number) => ecriture?.chapitres.find((c) => c.number === n);
  return (
    <>
      {fermes.length > 0 && phase.nom === "ecriture" && (
        <>
          <ChapterRule />
          <div className="text-legende font-black text-grey">La suite de ton rapport s’écrit · {fermes.length} chapitres</div>
          <div ref={SUITE_ECRITURE} className="flex flex-col rounded-card bg-white px-4 py-1 shadow-card">
            {fermes.map((c, k) => (
              <LigneEcriture
                key={c.number}
                number={c.number}
                title={enEcriture(c.number)?.title ?? c.tocTitle}
                etat={enEcriture(c.number)?.etat ?? "attente"}
                last={k === fermes.length - 1}
              />
            ))}
          </div>
        </>
      )}

      {fermes.length > 0 && (phase.nom === "echec" || phase.nom === "souffle") && (
        <>
          <ChapterRule />
          <EchecEcriture raison={phase.nom === "echec" ? phase.raison : "souffle"} />
        </>
      )}

      {fermes.length > 0 && (phase.nom === "lecture" || phase.nom === "complet") && (
        <>
          <ChapterRule />
          <div className="text-legende font-black text-grey">La suite de ton rapport · {fermes.length} chapitres</div>
          <div className="flex flex-col rounded-card bg-white px-4 py-1 shadow-card">
            {fermes.map((c) => (
              <LockRow key={c.number} number={c.number} title={c.tocTitle} onClick={ouvrirPaiement} />
            ))}
          </div>
        </>
      )}

      {/* Après la lecture : ta question passe par le chat, prêt une fois le rapport écrit (pas pendant l’écriture, ni après un échec) */}
      {phase.nom === "complet" && (
        <>
          <ChapterRule />
          {/* Après la lecture : ta question, bien visible */}
          <InsetGroup>
            <InsetRow
              leading={<RowIcon icon="bolt" tone="toi" />}
              title="Poser ma question à BLUSH"
              sub={access === "rapport" ? "Une question incluse avec ton rapport" : undefined}
              href="/rapport/question"
              chevron
            />
          </InsetGroup>
        </>
      )}
    </>
  );
}
