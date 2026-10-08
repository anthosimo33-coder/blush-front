"use client";

import Link from "next/link";
import { BACKEND } from "@/services/mode";
import { AppBadge } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { FlowSteps } from "@/components/ui/progress";
import { MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { formatCount } from "@/lib/format";
import { useSoundOnce } from "@/lib/sound";
import { useJourney } from "@/state/journey";
import type { Source } from "@/types";

/*
 * Écran 04 — Ta conv est ajoutée. Un seul bouton fort (Continuer) ; ajouter le début de l’histoire
 * reste à portée, en ligne discrète. Le « 100 % privé » est dit ici, une seule fois.
 */
export function ConvOkScreen({ source }: { source: Source }) {
  const [j] = useJourney();
  /* Ta conv est bien arrivée : le « oui » */
  useSoundOnce("oui");
  const back = `/importer/export?app=${j.exportApp}`;
  const fileName = j.exportFileName ?? source.fileName;
  return (
    <Screen
      mobileTop={<MobileTopBar back={back} progress={1} />}
      desktopBack={{ target: back }}
      aside={<FlowSteps step={1} />}
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
          <AppBadge app={j.exportApp ?? source.app} size={46} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[16px] font-black">{fileName}</span>
            <span className="text-[13px] font-extrabold text-grey">{source.period}</span>
          </span>
          <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full" style={{ background: "var(--gloss), #12C08A", boxShadow: "0 3px 8px -3px rgba(18,192,138,0.6)" }}>
            <Icon name="check" size={14} color="#FFFFFF" stroke={3.4} />
            <span className="sr-only">Fichier ajouté</span>
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 border-t border-[rgba(17,17,20,0.06)] px-5 pb-5 pt-4">
          <span className="text-[56px] font-black leading-none tracking-[-0.035em] tabular-nums">{formatCount(source.messageCount)}</span>
          <span className="text-[16px] font-black text-soft">
            messages · {source.voiceCount} vocaux
          </span>
        </div>
      </div>

      {/* Back-end v1 : réunir un export et des captures arrive plus tard */}
      {!BACKEND && (
        <InsetGroup title="Vous vous parliez ailleurs avant ?" id="ailleurs">
          <InsetRow
            leading={<RowIcon icon="photo" tone="elle" />}
            title="Ajouter des captures"
            sub="Du début (Hinge, Insta) : ton rapport sera plus juste."
            href="/importer/captures?mode=ajout"
            chevron
          />
        </InsetGroup>
      )}

      <p className="m-0 flex items-start gap-2 px-1 text-[13px] font-extrabold leading-[1.45] text-grey">
        <Icon name="lock" size={16} color="#8A8780" style={{ marginTop: 1 }} />
        100 % privé : ta conv est supprimée dès que ton rapport est prêt. <Link href="/confidentialite" className="font-black text-ink underline decoration-[rgba(17,17,20,0.25)] underline-offset-2">Comment ça marche</Link>
      </p>
    </Screen>
  );
}
