"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CATALOGUE, DUREE_SUITE_MS } from "@/contenu/offres";
import { FEUILLE_FORMULE, OFFRE_SUITE } from "@/contenu/paiement";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Perle } from "@/components/bulles/perles";
import { Pastille } from "@/components/bulles/pieces";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/messages";
import { Sheet } from "@/components/ui/surfaces";
import { PayerDansLaFeuille } from "./integre/PayerDansLaFeuille";

/** Le temps qu’il reste, en minutes et secondes (« 04:59 »). */
export function restant(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Toutes les combien l’horloge avance (le compte à rebours, sa barre). */
const PAS_MS = 250;

/**
 * L’offre unique ① (le prototype des bulles) : la feuille « Ta formule » fermée sans payer, la suite moins chère, une
 * seule fois, pendant 5 minutes. BLUSH la lance (« attends… »), le compte à rebours se vide sous tes yeux : `fin`, l’heure
 * de fin à l’horloge du téléphone, tirée du temps qu’il lui reste à l’heure du serveur (POST /api/paiement/offre, `reste`) ;
 * une page rechargée retrouve donc le même, et une horloge fausse ne l’avance ni ne le retarde. Passée, elle
 * se ferme pour de bon (`onPassee` : l’écran le dit). Fermée par « Non merci », le voile ou Échap : `onRefus`.
 * `onClosed` : sa sortie finie. `chapitres` : ceux qu’elle ouvre ; `suite` : où reprendre après le paiement. Sur
 * ordinateur, son voile couvre tout l’écran, en-tête compris (belowHeader faux). « attends… » est dans la police de
 * l’appli (Nunito), comme dans le prototype, pas dans celle des messages.
 * TODO(produit): une réduction, ou un ajout (+20 bulles) ? (la question du prototype)
 */
export function OffreAvantDePartir({
  fin,
  chapitres,
  suite,
  onRefus,
  onPassee,
  onClosed,
}: {
  fin: number;
  chapitres: number;
  suite?: string;
  onRefus: () => void;
  onPassee: () => void;
  onClosed: () => void;
}) {
  const titre = useId();
  const idFin = useId();
  const [maintenant, setMaintenant] = useState(() => Date.now());
  /* Fermée par « Non merci », le voile ou Échap ; passée (le compte à rebours à zéro, ou le serveur qui ne la vend plus) */
  const [fermee, setFermee] = useState(false);
  const [vendue, setVendue] = useState(true);
  /* Payée : la feuille ne se ferme plus, et le compte à rebours ne la fait plus passer, le temps de la livraison */
  const [paye, setPaye] = useState(false);
  const reste = vendue ? Math.max(0, fin - maintenant) : 0;
  const ouverte = paye || (!fermee && reste > 0);
  /* Passée sous nos yeux : l’écran le dit, une fois */
  const dite = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), PAS_MS);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (paye || fermee || reste > 0 || dite.current) return;
    dite.current = true;
    onPassee();
  }, [paye, fermee, reste, onPassee]);

  const refuser = () => {
    setFermee(true);
    onRefus();
  };

  return (
    <Sheet open={ouverte} onClose={paye ? () => {} : refuser} onClosed={onClosed} labelledBy={titre} belowHeader={false}>
      <div className="flex flex-col items-center gap-2 pt-1 text-center">
        <div className="relative">
          <BubbleLogo size={76} />
          <span className="absolute -right-[58px] -top-1 rotate-[8deg] rounded-[16px] rounded-bl-[5px] bg-[linear-gradient(160deg,#FF9BCB,#E8358A)] px-3 py-1.5 font-sans text-detail font-bold text-white shadow-[0_10px_20px_-10px_rgba(232,53,138,0.8)]">
            {OFFRE_SUITE.attends}
          </span>
        </div>
        <h2 id={titre} className="m-0 text-[30px] font-black leading-[1.05] tracking-[-0.02em]">
          {OFFRE_SUITE.avant}
          <span className="text-elle-ink">{OFFRE_SUITE.remise}</span>
        </h2>
        <p className="m-0 text-note font-extrabold text-soft">{OFFRE_SUITE.sousTitre}</p>
      </div>
      <div className="flex flex-col gap-2.5 rounded-[22px] bg-ink px-4 py-3.5 text-white shadow-[0_18px_36px_-18px_rgba(17,17,20,0.7)]">
        <span className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-legende font-black text-white/75">
            <span aria-hidden="true" className="relative flex size-2.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-elle opacity-70" />
              <span className="relative size-2.5 rounded-full bg-elle" />
            </span>
            <span id={idFin}>{OFFRE_SUITE.fin}</span>
          </span>
          {/* Lu à la demande, pas à chaque seconde (aria-live="off") */}
          <span role="timer" aria-live="off" aria-labelledby={idFin} className="text-[30px] font-black leading-none tracking-[-0.02em] tabular-nums">
            {restant(reste)}
          </span>
        </span>
        <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-white/15">
          <span
            data-barre=""
            className="block h-full rounded-full bg-[linear-gradient(90deg,#FF9BCB,#E8358A)] transition-[width] duration-300 ease-linear"
            style={{ width: `${Math.min(100, (100 * reste) / DUREE_SUITE_MS)}%` }}
          />
        </span>
      </div>
      <div className="flex items-center justify-center gap-3">
        <span className="text-[50px] font-black leading-none tracking-[-0.03em]">{OFFRE_SUITE.prix}</span>
        <span className="flex flex-col items-start gap-1">
          <s className="text-carte font-extrabold text-grey">
            <span className="sr-only">{FEUILLE_FORMULE.auLieuDe}</span>
            {OFFRE_SUITE.barre}
          </s>
          <Tag tone="risque">{OFFRE_SUITE.economie}</Tag>
        </span>
      </div>
      <ul className="m-0 flex list-none flex-wrap justify-center gap-1.5 p-0">
        <li>
          <Pastille>
            <Icon name="check" size={14} stroke={3} className="text-vrai-ink" />
            {OFFRE_SUITE.chapitres(chapitres)}
          </Pastille>
        </li>
        <li>
          <Pastille>
            <Icon name="check" size={14} stroke={3} className="text-vrai-ink" />
            {OFFRE_SUITE.vocal}
          </Pastille>
        </li>
        <li>
          <Pastille rose>
            <Perle taille={15} />
            {OFFRE_SUITE.contenu}
          </Pastille>
        </li>
      </ul>
      <div className="flex flex-col gap-1">
        <PayerDansLaFeuille
          offre="suite"
          centimes={CATALOGUE.suite.centimes}
          titre={CATALOGUE.suite.titre}
          libelle={OFFRE_SUITE.prendre}
          quoi="rapport"
          suite={suite}
          /* Plus vendue (prise dans un autre onglet, ou passée côté serveur) : elle s’efface, comme à la fin du compte à rebours */
          quand={{ offre: () => setVendue(false) }}
          surPaye={setPaye}
          fleche
        />
        {!paye && (
          <Button variant="link" onClick={refuser}>
            {OFFRE_SUITE.non}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
