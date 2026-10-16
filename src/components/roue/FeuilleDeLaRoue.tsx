"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { CASE_AU_REPOS, DUREE_DU_CADEAU_MS, GAINS, ROUE } from "@/contenu/roue";
import { jouerLaRoue } from "@/services/api";
import { BubbleLogo } from "@/components/brand/objects3d";
import { restant } from "@/components/paiement/OffreAvantDePartir";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/surfaces";
import type { LotDeLaRoue } from "@/types";
import type { RoueDuCompte } from "@/types/api";
import { angleDeLaCase, DUREE_DU_TOUR_MS, Roue } from "./Roue";

/*
 * La roue, juste avant le paywall (les maquettes G1 et G2 validées le 16 octobre) : « Avant ton rapport, tourne la
 * roue ». « Découvrir mon cadeau » la fait tourner : le serveur tire la case (POST /api/roue), la roue s’y arrête, puis
 * « Gagné » dit le lot et son minuteur (15 minutes, l’heure de fin tirée du temps qu’il lui reste à l’heure du serveur).
 * « Je ne veux pas de cadeau » la refuse pour de bon. Fermée autrement (le voile, Échap), rien n’est noté : elle revient
 * au prochain passage. Pendant le tour, elle ne se ferme pas. Sur ordinateur, une fenêtre large : le texte à gauche, la
 * roue à droite ; sur un écran bas (375 × 667), la roue et ses écarts se resserrent pour tenir sans défiler. `onJoue` :
 * ce que le serveur a répondu (l’écran garde la roue du compte à jour) ; `onFermee` : sa sortie
 * finie.
 */

/** Ce que la roue montre : son écran, le tour (la réponse du serveur, puis la roue qui tourne), ou le lot gagné. */
type Phase = "proposer" | "tourne" | "gagne";

/** Le lot gagné, sa case, et sa fin à l’horloge du téléphone. */
type Gain = { case: number; lot: LotDeLaRoue; fin: number };

export function FeuilleDeLaRoue({ open, onJoue, onFermer, onFermee }: { open: boolean; onJoue: (r: RoueDuCompte) => void; onFermer: () => void; onFermee?: () => void }) {
  const titre = useId();
  const [phase, setPhase] = useState<Phase>("proposer");
  const [angle, setAngle] = useState(() => angleDeLaCase(CASE_AU_REPOS));
  const [gain, setGain] = useState<Gain | null>(null);
  const [souci, setSouci] = useState(false);

  const tourner = async () => {
    setSouci(false);
    setPhase("tourne");
    let r: RoueDuCompte;
    try {
      r = await jouerLaRoue("tourner");
    } catch {
      setPhase("proposer");
      setSouci(true);
      return;
    }
    onJoue(r);
    if (r.etat !== "gagnee") return onFermer();
    setGain({ case: r.case, lot: r.lot, fin: Date.now() + r.reste });
    /* Quelques degrés de plus ou de moins : la roue ne s’arrête pas toujours pile au milieu de la case */
    setAngle(angleDeLaCase(r.case, 6) + (Math.random() - 0.5) * 24);
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => setPhase("gagne"), reduit ? 300 : DUREE_DU_TOUR_MS + 250);
  };

  /* Refusée tout de suite à l’écran (l’offre ① redevient possible sans attendre), puis notée par le serveur, qui a le dernier mot */
  const refuser = () => {
    onJoue({ etat: "refusee" });
    void jouerLaRoue("refuser").then(onJoue, () => {});
    onFermer();
  };

  return (
    <Sheet
      open={open}
      onClose={phase === "tourne" ? () => {} : onFermer}
      onClosed={onFermee}
      labelledBy={titre}
      belowHeader={false}
      className="lg:w-[920px]! lg:max-w-[920px]! lg:flex-row! lg:items-center lg:gap-10! lg:p-[44px]!"
    >
      {phase === "gagne" && gain ? (
        <Gagne titre={titre} gain={gain} onVoir={onFermer} />
      ) : (
        <>
          <div className="flex flex-col items-center gap-3 text-center [@media(max-height:700px)]:gap-2 lg:flex-1 lg:gap-4">
            <div className="relative pt-1">
              <BubbleLogo size={58} />
              <span className="absolute -right-[60px] -top-1 rotate-[8deg] rounded-[16px] rounded-bl-[5px] bg-[linear-gradient(160deg,#FF9BCB,#E8358A)] px-3 py-1.5 text-detail font-black text-white shadow-[0_10px_20px_-10px_rgba(232,53,138,0.8)]">
                {ROUE.attends}
              </span>
            </div>
            <h2 id={titre} className="m-0 text-[30px] font-black leading-[1.05] tracking-[-0.03em] [text-wrap:balance] [@media(max-height:700px)]:text-[25px] lg:text-[44px]">
              {ROUE.titre}
            </h2>
            <p className="m-0 text-detail font-extrabold text-soft lg:text-corps">{ROUE.sous}</p>
            <Roue
              angle={angle}
              tourne={phase === "tourne"}
              className="my-1 w-[min(300px,40dvh)] [@media(max-height:700px)]:my-0 [@media(max-height:700px)]:w-[min(260px,33dvh)] lg:hidden"
            />
            {souci && <Alert className="text-center">{ROUE.souci}</Alert>}
            <div className="flex w-full flex-col items-center gap-1.5 lg:max-w-[360px]">
              <Button onClick={() => void tourner()} loading={phase === "tourne"} loadingLabel={ROUE.tourne}>
                {ROUE.tourner}
              </Button>
              <Button variant="link" disabled={phase === "tourne"} onClick={refuser}>
                {ROUE.refuser}
              </Button>
            </div>
            <p className="m-0 text-micro font-extrabold leading-[1.45] text-grey">
              {ROUE.regle}
              <Link href="/conditions#roue" target="_blank" className="font-black text-soft underline underline-offset-2">
                {ROUE.reglement}
              </Link>
            </p>
          </div>
          <Roue angle={angle} tourne={phase === "tourne"} className="hidden w-[420px] shrink-0 lg:block" />
        </>
      )}
    </Sheet>
  );
}

/** « Gagné » (G2) : la roue arrêtée sur la case, le lot, son minuteur, et « Voir mon rapport ». */
function Gagne({ titre, gain, onVoir }: { titre: string; gain: Gain; onVoir: () => void }) {
  const idFin = useId();
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const reste = Math.max(0, gain.fin - maintenant);
  const g = GAINS[gain.lot];
  return (
    <>
      <Roue angle={angleDeLaCase(gain.case)} gagnee={gain.case} className="w-[min(220px,28dvh)] self-center lg:order-2 lg:w-[380px] lg:shrink-0" />
      <div className="flex flex-col items-center gap-3 text-center lg:flex-1">
        <span className="text-detail font-black text-elle-ink">{ROUE.gagne}</span>
        <h2 id={titre} className="m-0 text-[44px] font-black leading-none tracking-[-0.04em] [text-wrap:balance] [@media(max-height:700px)]:text-[36px] lg:text-[56px]">
          {g.titre}
        </h2>
        <p className="m-0 text-detail font-extrabold leading-[1.4] text-soft">{g.detail}</p>
        <div className="flex w-full flex-col gap-2.5 rounded-[22px] bg-ink px-4 py-3.5 text-white shadow-[0_18px_36px_-18px_rgba(17,17,20,0.7)] lg:max-w-[380px]">
          <span className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-legende font-black text-white/75">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-elle" />
              <span id={idFin}>{ROUE.garde}</span>
            </span>
            <span role="timer" aria-live="off" aria-labelledby={idFin} className="text-[30px] font-black leading-none tracking-[-0.02em] tabular-nums">
              {restant(reste)}
            </span>
          </span>
          <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-white/15">
            <span
              className="block h-full rounded-full bg-[linear-gradient(90deg,#FF9BCB,#E8358A)] transition-[width] duration-500 ease-linear"
              style={{ width: `${Math.min(100, (100 * reste) / DUREE_DU_CADEAU_MS)}%` }}
            />
          </span>
        </div>
        <div className="flex w-full flex-col items-center gap-1.5 lg:max-w-[380px]">
          <Button arrow onClick={onVoir}>
            {ROUE.voir}
          </Button>
          <p className="m-0 text-micro font-extrabold leading-[1.45] text-grey">{ROUE.partir}</p>
        </div>
      </div>
    </>
  );
}
