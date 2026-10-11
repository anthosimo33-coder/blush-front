"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { auRepos } from "@/lib/repos";
import { drapeauLocal, useDrapeau } from "@/lib/stockage";
import { Icon } from "@/components/ui/icons";
import { LienDiscret, NotePrivee } from "@/components/ui/NotePrivee";
import { PROMESSE_PARTAGE } from "@/contenu/confidentialite";

/*
 * Le bouton « Partager mon verdict » sous l’en-tête du rapport, et la promesse de confidentialité. Leurs feuilles
 * (Partage.tsx) ne s’ouvrent qu’au toucher : elles arrivent à part, sans alourdir le premier affichage du rapport.
 */
const PartageSheet = dynamic(() => import("./Partage").then((m) => m.PartageSheet), { ssr: false });
const ConfidentialiteSheet = dynamic(() => import("./Partage").then((m) => m.ConfidentialiteSheet), { ssr: false });

/*
 * « Partager mon verdict » sonne (dring dring) tant qu’on ne l’a jamais ouvert, sur ce navigateur. Stockage refusé
 * (navigation privée), et côté serveur : calme, le bouton ne sonne qu’une fois le navigateur lu.
 */
const PARTAGE_OUVERT = drapeauLocal("blush.partage.ouvert.v1", { defaut: false, indisponible: true, serveur: true });

/** Sous l’en-tête du rapport : partager son verdict, et la promesse de confidentialité (avec le détail à un toucher). */
export function PartageEtConfidentialite() {
  const [partage, setPartage] = useState(false);
  const [confidentialite, setConfidentialite] = useState(false);
  /*
   * Chaque feuille est montée fermée une fois la page posée (ou à sa première ouverture, si le toucher arrive avant), puis
   * gardée (sa sortie, le lien et l’image déjà prêts). Montée au toucher, React gardait 0,3 s son écran d’attente avant
   * de la montrer : au toucher, elle n’a plus qu’à s’ouvrir.
   */
  const [partageVu, setPartageVu] = useState(false);
  const [confidentialiteVu, setConfidentialiteVu] = useState(false);
  if (partage && !partageVu) setPartageVu(true);
  if (confidentialite && !confidentialiteVu) setConfidentialiteVu(true);
  useEffect(
    () =>
      auRepos(
        () =>
          void import("./Partage").then(() => {
            setPartageVu(true);
            setConfidentialiteVu(true);
          }),
      ),
    [],
  );
  const sonne = !useDrapeau(PARTAGE_OUVERT);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          setPartage(true);
          PARTAGE_OUVERT.poser(true);
        }}
        aria-haspopup="dialog"
        data-dring={sonne ? "" : undefined}
        className="lift lift-sm inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[26px] bg-white px-5 text-[16px] font-black text-ink shadow-soft"
      >
        <span data-dring-icone={sonne ? "" : undefined} className="flex">
          <Icon name="share" size={17} color="#121214" stroke={2.4} />
        </span>
        Partager mon verdict
      </button>
      <NotePrivee icone="shield" className="px-1 leading-[1.45]">
        {PROMESSE_PARTAGE}{" "}
        <LienDiscret onClick={() => setConfidentialite(true)} ouvreFeuille>
          En savoir plus
        </LienDiscret>
      </NotePrivee>
      {partageVu && <PartageSheet open={partage} onClose={() => setPartage(false)} />}
      {confidentialiteVu && <ConfidentialiteSheet open={confidentialite} onClose={() => setConfidentialite(false)} />}
    </div>
  );
}
