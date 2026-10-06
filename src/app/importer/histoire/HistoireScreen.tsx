"use client";

import { AppBadge } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { FlowSteps } from "@/components/ui/progress";
import { MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { formatCount } from "@/lib/format";
import type { Story } from "@/types";

const APP_NAME = { whatsapp: "WhatsApp", imessage: "iMessage", instagram: "Instagram", hinge: "Hinge", autre: "Autre appli" } as const;

/* Écran 05 — Votre histoire réunie : le total en grand, puis les applis dans l’ordre, en une seule liste. */
export function HistoireScreen({ story }: { story: Story }) {
  return (
    <Screen
      mobileTop={<MobileTopBar back="/importer/ok" progress={1} />}
      desktopBack={{ target: "/importer/ok" }}
      aside={<FlowSteps step={1} />}
      contentGap={22}
      head={
        <>
          <div className="text-[13px] font-black text-vrai-ink">BLUSH a tout remis dans l’ordre</div>
          <ScreenTitle size={30}>Votre histoire, d’un bout à l’autre.</ScreenTitle>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[52px] font-black leading-none tracking-[-0.035em] tabular-nums">{formatCount(story.totalMessages)}</span>
            <span className="text-[16px] font-black text-soft">
              messages · {story.durationLabel} · {story.sources.length} applis
            </span>
          </div>
        </>
      }
      footer={
        <ButtonLink href="/qui" arrow>
          Continuer
        </ButtonLink>
      }
    >
      <InsetGroup>
        {story.sources.map((s, i) => (
          <InsetRow
            key={s.id}
            leading={
              <span className="relative flex flex-col items-center">
                <AppBadge app={s.app} size={40} radius={11} />
                <span className="sr-only">{`Étape ${i + 1}`}</span>
              </span>
            }
            title={
              <span className="flex items-center gap-2">
                {APP_NAME[s.app]}
                <span className="rounded-full bg-[#F1EFEA] px-2 py-0.5 text-[11px] font-black text-grey">{s.mode === "export" ? "export" : "captures"}</span>
              </span>
            }
            sub={`${s.label} · ${s.period}`}
            trailing={
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-[16px] font-black tabular-nums">{formatCount(s.messageCount)}</span>
                <span className="text-[11.5px] font-extrabold text-grey">messages</span>
              </span>
            }
          />
        ))}
        <InsetRow leading={<RowIcon icon="plus" tone="vrai" />} title={<span className="text-toi-ink">Ajouter d’autres captures</span>} href="/importer/captures?mode=ajout" />
      </InsetGroup>
    </Screen>
  );
}
