"use client";

import { useState } from "react";
import { NB_CHAPITRES, titreDAttente } from "@/contenu/chapitres";
import { PAYWALL, PIED_GRATUIT } from "@/contenu/paiement";
import { formatCount } from "@/lib/format";
import { moiEtAutre, titreDuo } from "@/lib/participants";
import { useFeuilleDuPaiement } from "@/lib/requetes";
import { BubbleLogo } from "@/components/brand/objects3d";
import { FeuilleBulle } from "@/components/bulles/FeuilleBulle";
import { Grappe } from "@/components/bulles/perles";
import { FeuilleFormule } from "@/components/paiement/FeuilleFormule";
import { Screen } from "@/components/shell/Screen";
import { AvatarPair } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/cards";
import { Icon } from "@/components/ui/icons";
import { LockRow, ScoreCard } from "@/components/ui/progress";
import type { ScoreRow, Story } from "@/types";
import { Discoveries } from "./LectureScreen";

/*
 * Le paywall, avant toute lecture (décidé le 16 octobre) : la conv est importée, « Qui es-tu ? » rempli, et rien n’est
 * encore parti au modèle. On montre ce que le code a compté (qui ouvre la journée, qui relance, qui répond vite, les
 * trouvailles), les huit chapitres du rapport fermés, et « Ta formule » s’ouvre d’emblée. Payé, « C’est débloqué » mène
 * à la vraie lecture (/lecture), puis au verdict et au rapport.
 */
export function Paywall({ story, scores, trouvailles }: { story: Story; scores: ScoreRow[]; trouvailles: string[] }) {
  const { moi, autre } = moiEtAutre(story);
  /* Le paywall direct : la feuille est ouverte en arrivant ; fermée, le paywall reste dessous, et ses boutons la rouvrent */
  const [formule, setFormule] = useState(true);
  const [bulle, setBulle] = useState(false);
  const ouvrir = () => setFormule(true);
  const vocaux = story.voiceCount === 1 ? "vocal" : "vocaux";
  return (
    <Screen
      mainWidth={560}
      contentGap={14}
      mobileTop={
        <header className="flex h-[58px] shrink-0 items-center justify-center gap-1.5 lg:hidden">
          <BubbleLogo size={16} />
          <span className="text-note font-black">askblush.com</span>
        </header>
      }
      footer={<PiedPaywall ouvrirPaiement={ouvrir} expliquer={() => setBulle(true)} />}
    >
      <Card className="flex flex-col gap-2.5 p-[18px]">
        <div className="text-legende font-black text-grey">{PAYWALL.surtitre}</div>
        <div className="flex items-center gap-2.5">
          <AvatarPair me={moi.initial} other={autre.initial} />
          <div className="m-0 text-titre-2 font-black leading-[1.05] tracking-[-0.02em] [text-wrap:balance]">{titreDuo(story)}</div>
        </div>
        <div className="text-legende font-bold leading-[1.45] text-grey">
          {story.period} · {formatCount(story.totalMessages)} messages · {story.voiceCount} {vocaux}
        </div>
      </Card>

      <h1 className="m-0 mt-2 text-titre-2 font-black leading-[1.1] tracking-[-0.025em] [text-wrap:balance]">{PAYWALL.titre(autre.name)}</h1>

      {scores.length > 0 && (
        <>
          <div className="text-legende font-black text-grey">{PAYWALL.vu}</div>
          <ScoreCard rows={scores} autre={autre.pronoun} />
        </>
      )}
      {trouvailles.length > 0 && <Discoveries items={trouvailles} className="mt-1 min-h-0 justify-start" />}

      <div className="mt-2 text-legende font-black text-grey">{PAYWALL.chapitres(NB_CHAPITRES)}</div>
      <div className="flex flex-col rounded-card bg-white px-4 py-1 shadow-card">
        {Array.from({ length: NB_CHAPITRES }, (_, k) => k + 1).map((n) => (
          <LockRow key={n} number={n} title={titreDAttente(n, autre.name)} last={n === NB_CHAPITRES} onClick={ouvrir} />
        ))}
      </div>

      <FeuilleFormule open={formule} onClose={() => setFormule(false)} autre={autre.name} chapitres={NB_CHAPITRES} suite="/lecture" entete={PAYWALL.formule(autre.name)} />
      <FeuilleBulle open={bulle} onClose={() => setBulle(false)} />
    </Screen>
  );
}

/** Le bas du paywall : « Débloquer mon rapport », son prix (ou ce que le compte a d’avance), et les bulles offertes, comme l’aperçu. */
function PiedPaywall({ ouvrirPaiement, expliquer }: { ouvrirPaiement: () => void; expliquer: () => void }) {
  const avoirs = useFeuilleDuPaiement().data;
  return (
    <div className="flex flex-col gap-3">
      <Button arrow onClick={ouvrirPaiement} aria-haspopup="dialog">
        {avoirs?.avance ? PAYWALL.debloquerAvance : avoirs?.garde ? PAYWALL.debloquerGarde : PAYWALL.debloquer}
      </Button>
      <button
        type="button"
        onClick={expliquer}
        aria-haspopup="dialog"
        className="row-hover flex items-center gap-2.5 rounded-2xl bg-[#FFE6F2] px-3.5 py-2.5 text-left shadow-[inset_0_0_0_1px_rgba(232,53,138,0.22)]"
      >
        <Grappe taille={30} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-note font-black text-ink">{PIED_GRATUIT.offertes}</span>
          <span className="text-legende font-extrabold text-soft">{PIED_GRATUIT.regle}</span>
        </span>
        <Icon name="chevron" size={15} stroke={2.8} className="shrink-0 text-elle-ink" />
      </button>
    </div>
  );
}
