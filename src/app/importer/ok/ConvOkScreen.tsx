"use client";

import type { Route } from "next";
import { AppBadge } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { DoneCheck } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { LienDiscret, NotePrivee } from "@/components/ui/NotePrivee";
import { ParcoursScreen } from "@/components/shell/ParcoursScreen";
import { ScreenTitle } from "@/components/shell/Screen";
import { PROMESSE_CONV } from "@/contenu/confidentialite";
import { formatCount, NBSP } from "@/lib/format";
import { useSoundOnce } from "@/lib/sound";
import { useJourney } from "@/state/journey";
import type { Source } from "@/types";

/*
 * Écran 04 — Ta conv est ajoutée. Un seul bouton fort (Continuer). La promesse sur la conv (PROMESSE_CONV) est redite ici,
 * une seule fois, au moment où elle est partie.
 */
export function ConvOkScreen({ source }: { source: Source }) {
  const [j] = useJourney();
  /* Ta conv est bien arrivée : le « oui » */
  useSoundOnce("oui");
  const back: Route = `/importer/export?app=${j.exportApp}`;
  const fileName = j.exportFileName ?? source.fileName;
  return (
    <ParcoursScreen
      step={1}
      back={back}
      contentGap={22}
      head={<ScreenTitle>C’est bon, on a votre conv.</ScreenTitle>}
      footer={
        <ButtonLink href="/qui" arrow>
          Continuer
        </ButtonLink>
      }
    >
      {/* La conv reçue : le fichier, puis ce qu’il contient, en grand */}
      <div className="flex flex-col rounded-[24px] bg-white shadow-card">
        <div className="flex items-center gap-3 px-5 pb-4 pt-5">
          <AppBadge app={j.exportApp} size={46} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-corps font-black">{fileName}</span>
            <span className="text-legende font-extrabold text-grey">{source.period}</span>
          </span>
          <DoneCheck size={26} label="Fichier ajouté" />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 border-t border-[rgba(17,17,20,0.06)] px-5 pb-5 pt-4">
          <span className="text-affiche font-black leading-none tracking-[-0.035em] tabular-nums">{formatCount(source.messageCount)}</span>
          <span className="text-corps font-black text-soft">messages · {source.voiceCount} vocaux</span>
        </div>
      </div>

      {/* Une conv trop longue pour partir en entier : le navigateur n’en a gardé que la partie la plus récente, on le dit */}
      {source.moisLus && (
        <p className="m-0 flex items-start gap-2 rounded-[18px] bg-plaque px-3.5 py-3 text-note font-extrabold leading-[1.45] text-soft">
          <Icon name="clock" size={17} style={{ marginTop: 1 }} className="text-soft" />
          <span>
            Votre conv est très longue{NBSP}: BLUSH lit {source.moisLus > 1 ? `vos ${source.moisLus} derniers mois` : "votre dernier mois"}, ce qui compte le plus pour savoir où
            vous en êtes.
          </span>
        </p>
      )}

      <NotePrivee className="px-1 leading-[1.45]">
        {PROMESSE_CONV} <LienDiscret href="/confidentialite">Comment ça marche</LienDiscret>
      </NotePrivee>
    </ParcoursScreen>
  );
}
