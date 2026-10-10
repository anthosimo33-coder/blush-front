"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { invalidate } from "@/lib/query";
import { openConv } from "@/services/api";
import { IconButton } from "@/components/ui/Button";
import { ContactRing } from "@/components/ui/contact";
import { EnRoute } from "@/components/ui/EnRoute";
import { Icon } from "@/components/ui/icons";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { AppScreen } from "@/components/shell/AppScreen";
import type { ConvSummary } from "@/types";

/*
 * Plusieurs convs : tes convs, comme dans Messages. Une ligne par personne : où vous en êtes (l’anneau
 * du niveau, le verdict en badge), le verdict, la tendance, et quand BLUSH en a parlé pour la dernière fois.
 * Un toucher ouvre son accueil, qui s’ouvrira encore sur elle la fois suivante. En bas, de quoi en analyser une autre.
 * « Mon compte » passe ici : sur l’accueil, sa place sert à revenir à cette liste.
 */
export function ConvsScreen({ convs }: { convs: ConvSummary[] }) {
  return (
    <AppScreen
      aside={null}
      mainWidth={600}
      frameWidth={600}
      contentGap={0}
      mobileTop={
        <header className="flex h-[60px] shrink-0 items-center px-4 lg:hidden">
          <IconButton href="/compte" icon="user" label="Mon compte" iconSize={19} className="!size-10 !shadow-soft" />
        </header>
      }
    >
      <h1 className="m-0 pl-1 text-[34px] font-black leading-none tracking-[-0.03em] lg:mt-4 lg:text-[44px]">Tes convs</h1>
      <InsetGroup className="mt-5 lg:mt-7">
        {convs.map((c) => (
          <ConvRow key={c.storyId} conv={c} />
        ))}
      </InsetGroup>
      <InsetGroup className="mt-6 pb-10">
        <InsetRow leading={<RowIcon icon="plus" tone="vrai" />} title={<span className="text-toi-ink">Analyser une autre conv</span>} sub="Une autre personne, un autre rapport" href="/commencer" />
      </InsetGroup>
    </AppScreen>
  );
}

function ConvRow({ conv }: { conv: ConvSummary }) {
  const up = conv.trend.startsWith("↗");
  /* Pas encore de verdict : BLUSH lit la conv (texte relu le 8 octobre) */
  const where = conv.verdict?.title ?? "BLUSH lit votre conv…";
  return (
    <Link
      href="/app"
      /* Pas de préchargement : l’accueil dépend de la conv choisie au toucher. Sans remise en haut : il s’ouvre sur le dernier échange */
      prefetch={false}
      scroll={false}
      transitionTypes={["nav-forward"]}
      onClick={() => {
        openConv(conv.storyId);
        invalidate("report", "account", "fiche");
      }}
      aria-label={`${conv.person.name} : ${[where, conv.trend].filter(Boolean).join(" ")}, ${conv.lastLabel}`}
      className="row-hover group flex items-center gap-3.5 px-4 py-3.5 text-ink no-underline"
    >
      <span className="transition-[scale] duration-300 [transition-timing-function:var(--ease-pop)] group-active:scale-95">
        <ContactRing initial={conv.person.initial} level={conv.level} emoji={conv.verdict?.emoji ?? null} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[17px] font-black leading-tight">{conv.person.name}</span>
          <span className="shrink-0 text-[13px] font-extrabold text-grey">{conv.lastLabel}</span>
        </span>
        <span className="mt-0.5 truncate text-[14px] font-extrabold leading-[1.35] text-soft">{where}</span>
        {conv.trend && <span className={cn("mt-1 text-[12.5px] font-black leading-none", up ? "text-vrai-ink" : "text-grey")}>{conv.trend}</span>}
      </span>
      {/* Sans préchargement, l’accueil se rend au toucher : le chevron laisse place aux trois points pendant ce temps */}
      <EnRoute>
        <Icon name="chevron" size={17} color="#B4B1A9" stroke={2.6} className="lift-chev shrink-0" />
      </EnRoute>
    </Link>
  );
}
