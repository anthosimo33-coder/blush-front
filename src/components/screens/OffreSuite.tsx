"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useEffect, useId, useState } from "react";
import { OFFRE_SUITE } from "@/contenu/paiement";
import { codeDe } from "@/lib/messages-erreur";
import { partirPayer } from "@/lib/paiement";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/surfaces";
import { CaseRenonciation } from "./CaseRenonciation";

/** Le temps qu’il reste, en minutes et secondes (« 04:59 »). */
function restant(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * L’offre unique ① : la feuille du paiement fermée sans payer, la suite moins chère, une seule fois, pendant 5 minutes.
 * Le compte à rebours lit l’heure de fin donnée par le serveur (`fin`, POST /api/paiement/offre) : une page rechargée
 * retrouve le même. Passée, l’offre se ferme pour de bon. Les mots et les prix sont ceux du prototype des bulles
 * (« OffreAvantDePartir ») ; la vague 2 la met à son dessin. `suite` : où reprendre après le paiement.
 */
export function OffreSuite({ fin, onClose, suite }: { fin: string; onClose: () => void; suite?: string }) {
  const router = useRouter();
  const titre = useId();
  const finMs = Date.parse(fin);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  /* Fermée par « Non merci », le voile ou Échap ; passée, elle se ferme seule (le compte à rebours à zéro) */
  const [fermee, setFermee] = useState(false);
  const [renonce, setRenonce] = useState(false);
  const [manque, setManque] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState(false);
  const reste = Math.max(0, finMs - maintenant);
  const ouverte = !fermee && reste > 0;
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const prendre = async () => {
    if (!renonce) return setManque(true);
    setOccupe(true);
    setSouci(false);
    try {
      await partirPayer("suite", { renonciation: true, suite, aller: (adresse) => router.push(adresse as Route) });
    } catch (e) {
      setOccupe(false);
      /* Passée entre-temps (« offre ») : elle se ferme ; le reste se dit */
      if (codeDe(e) === "offre") setFermee(true);
      else setSouci(true);
    }
  };

  return (
    <Sheet open={ouverte} onClose={() => setFermee(true)} onClosed={onClose} labelledBy={titre}>
      <div className="flex flex-col items-center gap-2 pt-1 text-center">
        <h2 id={titre} className="m-0 text-[30px] font-black leading-[1.05] tracking-[-0.02em]">
          {OFFRE_SUITE.titre}
        </h2>
        <p className="m-0 text-note font-extrabold text-soft">{OFFRE_SUITE.sousTitre}</p>
      </div>
      <div className="flex items-center justify-between rounded-[22px] bg-ink px-4 py-3.5 text-white">
        <span className="text-legende font-black text-white/75">{OFFRE_SUITE.fin}</span>
        <span role="timer" aria-live="off" className="text-[30px] font-black leading-none tracking-[-0.02em] tabular-nums">
          {restant(reste)}
        </span>
      </div>
      <div className="flex items-center justify-center gap-3">
        <span className="text-[50px] font-black leading-none tracking-[-0.03em]">{OFFRE_SUITE.prix}</span>
        <span className="flex flex-col items-start gap-1">
          <s className="text-carte font-extrabold text-grey">{OFFRE_SUITE.barre}</s>
          <span className="text-legende font-black text-elle-ink">{OFFRE_SUITE.contenu}</span>
        </span>
      </div>
      <CaseRenonciation quoi="rapport" cochee={renonce} onChange={(v) => (setRenonce(v), setManque(false))} manque={manque} />
      {souci && <Alert className="text-center leading-[1.45]">Ça n’a pas pu se faire. Vérifie ta connexion et réessaie.</Alert>}
      <div className="flex flex-col gap-1">
        <Button arrow loading={occupe} loadingLabel="Paiement en cours" onClick={() => void prendre()}>
          {OFFRE_SUITE.prendre}
        </Button>
        <Button variant="link" onClick={() => setFermee(true)}>
          {OFFRE_SUITE.non}
        </Button>
      </div>
    </Sheet>
  );
}
